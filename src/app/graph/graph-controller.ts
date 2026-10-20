import { Injectable, computed, signal } from '@angular/core';
import {
  clamp,
  easeInOutCubic,
  flowToScreen,
  getBounds,
  getViewportForBounds,
  getVisibleFlowRect,
  interpolateViewport,
  screenToFlow,
  zoomAtPoint
} from './geometry';
import { Dimensions, FitViewOptions, GraphNode, HandleBounds, Rect, Viewport, XYPosition } from './types';

const DEFAULT_NODE_SIZE: Dimensions = { width: 0, height: 0 };

/**
 * Imperative API and shared state of one graph instance (GE-08). Provided by `<ngf-graph>`, so
 * add-ons projected into it (controls, minimap, background) and the host app can inject it.
 */
@Injectable()
export class GraphController {
  readonly viewport = signal<Viewport>({ x: 0, y: 0, zoom: 1 });
  readonly size = signal<Dimensions>({ width: 0, height: 0 });
  readonly minZoom = signal(0.5);
  readonly maxZoom = signal(2);
  readonly nodes = signal<GraphNode[]>([]);
  /** Measured node sizes, keyed by node id. */
  readonly dimensions = signal<ReadonlyMap<string, Dimensions>>(new Map());
  /** Measured handle bounds, keyed by node id. */
  readonly handles = signal<ReadonlyMap<string, HandleBounds[]>>(new Map());
  /** Positions of nodes being dragged; they win over the input positions until the drop. */
  readonly dragPositions = signal<ReadonlyMap<string, XYPosition>>(new Map());

  readonly transform = computed(() => {
    const { x, y, zoom } = this.viewport();
    return `translate(${x}px, ${y}px) scale(${zoom})`;
  });

  readonly nodeRects = computed<(Rect & { id: string })[]>(() => {
    const dims = this.dimensions();
    const drag = this.dragPositions();
    return this.nodes().map((node) => {
      const size = dims.get(node.id) ?? { width: node.width ?? DEFAULT_NODE_SIZE.width, height: node.height ?? DEFAULT_NODE_SIZE.height };
      const position = drag.get(node.id) ?? node.position;
      return { id: node.id, x: position.x, y: position.y, width: size.width, height: size.height };
    });
  });

  private container: HTMLElement | null = null;
  private animationFrame = 0;

  /** @internal */
  attach(container: HTMLElement): void {
    this.container = container;
  }

  /** @internal */
  detach(): void {
    this.container = null;
    cancelAnimationFrame(this.animationFrame);
  }

  getViewport(): Viewport {
    return this.viewport();
  }

  setViewport(viewport: Viewport, options: { duration?: number } = {}): Promise<void> {
    const target = { ...viewport, zoom: clamp(viewport.zoom, this.minZoom(), this.maxZoom()) };
    cancelAnimationFrame(this.animationFrame);
    const duration = options.duration ?? 0;
    if (duration <= 0) {
      this.viewport.set(target);
      return Promise.resolve();
    }
    const from = this.viewport();
    const start = performance.now();
    return new Promise((resolve) => {
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        this.viewport.set(interpolateViewport(from, target, easeInOutCubic(t)));
        if (t < 1) {
          this.animationFrame = requestAnimationFrame(step);
        } else {
          resolve();
        }
      };
      this.animationFrame = requestAnimationFrame(step);
    });
  }

  /** Converts a client (page) point to flow coordinates. */
  screenToFlowPosition(clientPoint: XYPosition): XYPosition {
    const rect = this.container?.getBoundingClientRect();
    const local = rect ? { x: clientPoint.x - rect.left, y: clientPoint.y - rect.top } : clientPoint;
    return screenToFlow(local, this.viewport());
  }

  /** Converts a flow point to client (page) coordinates. */
  flowToScreenPosition(flowPoint: XYPosition): XYPosition {
    const rect = this.container?.getBoundingClientRect();
    const local = flowToScreen(flowPoint, this.viewport());
    return rect ? { x: local.x + rect.left, y: local.y + rect.top } : local;
  }

  /** Visible area in flow coordinates. */
  getVisibleRect(): Rect {
    return getVisibleFlowRect(this.viewport(), this.size());
  }

  zoomTo(zoom: number, options: { duration?: number } = {}): Promise<void> {
    const { width, height } = this.size();
    const next = zoomAtPoint(this.viewport(), { x: width / 2, y: height / 2 }, zoom, this.minZoom(), this.maxZoom());
    return this.setViewport(next, options);
  }

  zoomIn(options: { duration?: number } = { duration: 200 }): Promise<void> {
    return this.zoomTo(this.viewport().zoom * 1.2, options);
  }

  zoomOut(options: { duration?: number } = { duration: 200 }): Promise<void> {
    return this.zoomTo(this.viewport().zoom / 1.2, options);
  }

  /** Fits the view to the nodes. Waits for nodes to be measured first. */
  async fitView(options: FitViewOptions = {}): Promise<void> {
    await this.whenMeasured();
    const ids = options.nodeIds ? new Set(options.nodeIds) : null;
    const rects = this.nodeRects().filter((r) => !ids || ids.has(r.id));
    if (rects.length === 0) {
      return;
    }
    const viewport = getViewportForBounds(
      getBounds(rects),
      this.size(),
      options.minZoom ?? this.minZoom(),
      options.maxZoom ?? this.maxZoom(),
      options.padding ?? 0.1
    );
    await this.setViewport(viewport, { duration: options.duration });
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes().find((n) => n.id === id);
  }

  getNodeRect(id: string): Rect | undefined {
    return this.nodeRects().find((r) => r.id === id);
  }

  getHandleBounds(id: string): HandleBounds[] {
    return this.handles().get(id) ?? [];
  }

  /** Resolves once every node has a measured size and the container has a size (or after ~1 s). */
  whenMeasured(): Promise<void> {
    return new Promise((resolve) => {
      let frames = 0;
      const check = () => {
        const dims = this.dimensions();
        const ready = this.size().width > 0 && this.nodes().every((n) => dims.has(n.id) || (n.width && n.height));
        if (ready || frames++ > 60) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }

  /** @internal */
  setMeasurement(id: string, size: Dimensions, handles: HandleBounds[]): void {
    const dims = new Map(this.dimensions());
    dims.set(id, size);
    this.dimensions.set(dims);
    const handleMap = new Map(this.handles());
    handleMap.set(id, handles);
    this.handles.set(handleMap);
  }

  /** @internal */
  forget(ids: string[]): void {
    if (ids.length === 0) {
      return;
    }
    const dims = new Map(this.dimensions());
    const handleMap = new Map(this.handles());
    for (const id of ids) {
      dims.delete(id);
      handleMap.delete(id);
    }
    this.dimensions.set(dims);
    this.handles.set(handleMap);
  }
}
