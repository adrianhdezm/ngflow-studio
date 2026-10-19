import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  TemplateRef,
  afterNextRender,
  computed,
  contentChild,
  contentChildren,
  effect,
  forwardRef,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { getSelectChanges, resolveConnection } from './changes';
import { GraphController } from './graph-controller';
import { distance, getBezierPath, getFallbackAnchor, getHandleAnchor, oppositePosition, zoomAtPoint } from './geometry';
import { NodeWrapperComponent } from './node-wrapper.component';
import { ConnectionLineTemplateDirective, EdgeTemplateDirective, EdgeTemplateContext, NodeTemplateContext, NodeTemplateDirective } from './templates';
import {
  ConnectEndEvent,
  ConnectStartEvent,
  Connection,
  ConnectionDropTarget,
  Dimensions,
  EdgeChange,
  EdgeMouseEvent,
  GraphEdge,
  GraphInternals,
  GraphNode,
  HandleBounds,
  HandlePosition,
  HandleType,
  IsValidConnection,
  NGF_GRAPH,
  NodeChange,
  NodeMouseEvent,
  PaneMouseEvent,
  SelectionChangeEvent,
  XYPosition
} from './types';

const CLICK_TOLERANCE = 3;

interface ConnectionDrag {
  from: ConnectStartEvent;
  fromPoint: XYPosition;
  fromPosition: HandlePosition;
  toPoint: XYPosition;
}

interface RenderedEdge {
  edge: GraphEdge;
  path: string;
  context: EdgeTemplateContext;
  template: TemplateRef<EdgeTemplateContext> | undefined;
}

/** True when keyboard input belongs to a text field or code editor rather than the graph. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    !!target.closest('.monaco-editor')
  );
}

/**
 * Controlled node graph (GE-04): nodes and edges come in, change requests go out.
 * Layers: background, SVG edges, HTML nodes, connection preview, overlay slots (GE-09).
 */
@Component({
  selector: 'ngf-graph',
  imports: [NgTemplateOutlet, NodeWrapperComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [GraphController, { provide: NGF_GRAPH, useExisting: forwardRef(() => GraphComponent) }],
  host: { class: 'block relative h-full w-full' },
  template: `
    <div
      #container
      class="absolute inset-0 overflow-hidden touch-none select-none outline-none"
      tabindex="0"
      [class.cursor-grabbing]="panning()"
      (pointerdown)="onPanePointerDown($event)"
      (wheel)="onWheel($event)"
      (contextmenu)="onPaneContextMenu($event)"
      (keydown)="onKeydown($event)"
      (dblclick)="$event.preventDefault()"
    >
      <ng-content select="ngf-background" />

      <div class="absolute left-0 top-0 origin-top-left" [style.transform]="controller.transform()">
        <svg class="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
          @for (item of renderedEdges(); track item.edge.id) {
            <g
              class="pointer-events-auto"
              [class.cursor-pointer]="interactive()"
              [attr.data-ngf-edge-id]="item.edge.id"
              (pointerdown)="onEdgePointerDown($event)"
              (click)="onEdgeClick($event, item.edge)"
              (contextmenu)="onEdgeContextMenu($event, item.edge)"
            >
              <path [attr.d]="item.path" fill="none" stroke="transparent" stroke-width="12" style="pointer-events: stroke" />
              @if (item.template) {
                <ng-container *ngTemplateOutlet="item.template; context: item.context" />
              } @else {
                <path
                  [attr.d]="item.path"
                  fill="none"
                  stroke-width="2"
                  class="pointer-events-none"
                  [class.stroke-border]="!item.edge.selected"
                  [class.stroke-muted-foreground]="item.edge.selected"
                />
              }
            </g>
          }
        </svg>

        @for (node of controller.nodes(); track node.id) {
          <ngf-node-wrapper [node]="node" [template]="nodeTemplateFor(node.type)" [dragPosition]="controller.dragPositions().get(node.id)" />
        }

        @if (connectionPreview(); as preview) {
          <svg class="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
            @if (connectionLineTemplate(); as custom) {
              <ng-container *ngTemplateOutlet="custom.template; context: preview" />
            } @else {
              <path [attr.d]="preview.path" fill="none" class="stroke-ring" stroke-width="1" />
              <circle [attr.cx]="preview.toX" [attr.cy]="preview.toY" r="3" class="fill-white stroke-ring" stroke-width="1.5" />
            }
          </svg>
        }
      </div>

      <ng-content />
    </div>
  `
})
export class GraphComponent implements GraphInternals {
  readonly nodes = input<GraphNode[]>([]);
  readonly edges = input<GraphEdge[]>([]);
  readonly interactive = input(true);
  readonly isValidConnection = input<IsValidConnection | undefined>();
  readonly minZoom = input(0.5);
  readonly maxZoom = input(2);

  readonly nodesChange = output<NodeChange[]>();
  readonly edgesChange = output<EdgeChange[]>();
  readonly connect = output<Connection>();
  readonly connectStart = output<ConnectStartEvent>();
  readonly connectEnd = output<ConnectEndEvent>();
  readonly nodeClick = output<NodeMouseEvent>();
  readonly edgeClick = output<EdgeMouseEvent>();
  readonly paneClick = output<PaneMouseEvent>();
  readonly nodeContextMenu = output<NodeMouseEvent>();
  readonly edgeContextMenu = output<EdgeMouseEvent>();
  readonly paneContextMenu = output<PaneMouseEvent>();
  readonly selectionChange = output<SelectionChangeEvent>();

  readonly controller = inject(GraphController);

  private readonly nodeTemplates = contentChildren(NodeTemplateDirective);
  private readonly edgeTemplates = contentChildren(EdgeTemplateDirective);
  protected readonly connectionLineTemplate = contentChild(ConnectionLineTemplateDirective);
  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');

  protected readonly panning = signal(false);
  private readonly connection = signal<ConnectionDrag | null>(null);
  private readonly activePointers = new Map<number, XYPosition>();
  private pinchStart: { distance: number; zoom: number } | null = null;
  private pendingFrame = 0;
  private cleanupListeners: (() => void) | null = null;

  private readonly nodeTemplateMap = computed(() => new Map(this.nodeTemplates().map((t) => [t.type(), t.template])));
  private readonly edgeTemplateMap = computed(() => new Map(this.edgeTemplates().map((t) => [t.type(), t.template])));

  protected readonly renderedEdges = computed<RenderedEdge[]>(() => {
    const rects = new Map(this.controller.nodeRects().map((r) => [r.id, r]));
    const handles = this.controller.handles();
    const templates = this.edgeTemplateMap();
    const result: RenderedEdge[] = [];
    for (const edge of this.edges()) {
      const source = rects.get(edge.source);
      const target = rects.get(edge.target);
      if (!source || !target) {
        continue;
      }
      const sourceHandle = findHandle(handles.get(edge.source), 'source', edge.sourceHandle);
      const targetHandle = findHandle(handles.get(edge.target), 'target', edge.targetHandle);
      const sourcePosition = sourceHandle?.position ?? 'right';
      const targetPosition = targetHandle?.position ?? 'left';
      const s = sourceHandle ? getHandleAnchor(source, sourceHandle) : getFallbackAnchor(source, sourcePosition);
      const t = targetHandle ? getHandleAnchor(target, targetHandle) : getFallbackAnchor(target, targetPosition);
      const bezier = getBezierPath({ sourceX: s.x, sourceY: s.y, sourcePosition, targetX: t.x, targetY: t.y, targetPosition });
      result.push({
        edge,
        path: bezier.path,
        template: templates.get(edge.type ?? 'default'),
        context: {
          $implicit: edge,
          edge,
          path: bezier.path,
          selected: !!edge.selected,
          labelX: bezier.labelX,
          labelY: bezier.labelY
        }
      });
    }
    return result;
  });

  protected readonly connectionPreview = computed(() => {
    const drag = this.connection();
    if (!drag) {
      return null;
    }
    const { fromPoint, toPoint, fromPosition } = drag;
    const bezier = getBezierPath({
      sourceX: fromPoint.x,
      sourceY: fromPoint.y,
      sourcePosition: fromPosition,
      targetX: toPoint.x,
      targetY: toPoint.y,
      targetPosition: oppositePosition(fromPosition)
    });
    return { path: bezier.path, fromX: fromPoint.x, fromY: fromPoint.y, toX: toPoint.x, toY: toPoint.y, fromPosition };
  });

  constructor() {
    effect(() => {
      const nodes = this.nodes();
      const ids = new Set(nodes.map((n) => n.id));
      this.controller.forget([...this.controller.dimensions().keys()].filter((id) => !ids.has(id)));
      this.controller.nodes.set(nodes);
    });
    effect(() => {
      this.controller.minZoom.set(this.minZoom());
      this.controller.maxZoom.set(this.maxZoom());
    });

    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.container().nativeElement;
      this.controller.attach(el);
      const observer = new ResizeObserver(() => this.controller.size.set({ width: el.clientWidth, height: el.clientHeight }));
      observer.observe(el);
      this.controller.size.set({ width: el.clientWidth, height: el.clientHeight });
      destroyRef.onDestroy(() => observer.disconnect());
    });
    destroyRef.onDestroy(() => {
      this.cleanupListeners?.();
      cancelAnimationFrame(this.pendingFrame);
      this.controller.detach();
    });
  }

  protected nodeTemplateFor(type: string): TemplateRef<NodeTemplateContext> | undefined {
    return this.nodeTemplateMap().get(type);
  }

  isInteractive(): boolean {
    return this.interactive();
  }

  // ---------------------------------------------------------------- selection

  private emitSelection(nodeIds: Iterable<string>, edgeIds: Iterable<string>): void {
    const { nodeChanges, edgeChanges } = getSelectChanges(this.nodes(), this.edges(), nodeIds, edgeIds);
    if (nodeChanges.length) {
      this.nodesChange.emit(nodeChanges);
    }
    if (edgeChanges.length) {
      this.edgesChange.emit(edgeChanges);
    }
    if (nodeChanges.length || edgeChanges.length) {
      const nodeSet = new Set(nodeIds);
      const edgeSet = new Set(edgeIds);
      this.selectionChange.emit({
        nodes: this.nodes().filter((n) => nodeSet.has(n.id)),
        edges: this.edges().filter((e) => edgeSet.has(e.id))
      });
    }
  }

  private selectedNodeIds(): string[] {
    return this.nodes()
      .filter((n) => n.selected)
      .map((n) => n.id);
  }

  private selectedEdgeIds(): string[] {
    return this.edges()
      .filter((e) => e.selected)
      .map((e) => e.id);
  }

  private toggleNode(node: GraphNode): void {
    const ids = new Set(this.selectedNodeIds());
    if (ids.has(node.id)) {
      ids.delete(node.id);
    } else {
      ids.add(node.id);
    }
    this.emitSelection(ids, this.selectedEdgeIds());
  }

  private selectNode(node: GraphNode, additive: boolean): void {
    if (node.selectable === false) {
      return;
    }
    if (additive) {
      this.toggleNode(node);
    } else {
      this.emitSelection([node.id], []);
    }
  }

  // ---------------------------------------------------------------- nodes

  onNodePointerDown(event: PointerEvent, node: GraphNode, element: HTMLElement): void {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('[data-ngf-handle],[data-ngf-no-drag],button,input,textarea,select,a,[contenteditable="true"]')) {
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
    if (!this.interactive()) {
      // Panning still works over nodes in read-only mode.
      this.onPanePointerDown(event, true);
      return;
    }
    element.focus({ preventScroll: true });
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    if (!additive && !node.selected) {
      this.selectNode(node, false);
    }

    const zoom = this.controller.viewport().zoom;
    const start = { x: event.clientX, y: event.clientY };
    const canDrag = node.draggable !== false;
    const dragIds = node.selected && !additive ? this.nodes().filter((n) => n.selected && n.draggable !== false).map((n) => n.id) : [node.id];
    const origins = new Map(this.nodes().filter((n) => dragIds.includes(n.id)).map((n) => [n.id, n.position]));
    let dragging = false;
    let latest = new Map<string, XYPosition>();

    const move = (e: PointerEvent) => {
      if (!canDrag) {
        return;
      }
      const dx = (e.clientX - start.x) / zoom;
      const dy = (e.clientY - start.y) / zoom;
      if (!dragging && distance(start, { x: e.clientX, y: e.clientY }) < CLICK_TOLERANCE) {
        return;
      }
      dragging = true;
      latest = new Map([...origins].map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }]));
      this.controller.dragPositions.set(latest);
      this.scheduleFrame(() => {
        this.nodesChange.emit([...latest].map(([id, position]) => ({ type: 'position', id, position, dragging: true })));
      });
    };
    const up = (e: PointerEvent) => {
      this.cleanupListeners?.();
      cancelAnimationFrame(this.pendingFrame);
      if (dragging) {
        this.nodesChange.emit([...latest].map(([id, position]) => ({ type: 'position', id, position, dragging: false })));
        this.controller.dragPositions.set(new Map());
      } else {
        if (additive) {
          this.selectNode(node, true);
        }
        this.nodeClick.emit({ event: e, node, flowPosition: this.controller.screenToFlowPosition({ x: e.clientX, y: e.clientY }) });
      }
    };
    this.listen(move, up);
  }

  onNodeContextMenu(event: MouseEvent, node: GraphNode): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.interactive()) {
      return;
    }
    this.nodeContextMenu.emit({ event, node, flowPosition: this.controller.screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
  }

  onNodeKeydown(event: KeyboardEvent, node: GraphNode): void {
    if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget && this.interactive()) {
      event.preventDefault();
      this.selectNode(node, event.shiftKey || event.metaKey || event.ctrlKey);
    }
  }

  onNodeMeasured(id: string, size: Dimensions, handles: HandleBounds[]): void {
    const previous = this.controller.dimensions().get(id);
    const previousHandles = this.controller.handles().get(id);
    if (previous && previous.width === size.width && previous.height === size.height && sameHandles(previousHandles, handles)) {
      return;
    }
    this.controller.setMeasurement(id, size, handles);
    if (!previous || previous.width !== size.width || previous.height !== size.height) {
      this.nodesChange.emit([{ type: 'dimensions', id, width: size.width, height: size.height }]);
    }
  }

  // ---------------------------------------------------------------- edges

  protected onEdgePointerDown(event: PointerEvent): void {
    // Keep the pane from treating this as a pan or a pane click.
    event.stopPropagation();
  }

  protected onEdgeClick(event: MouseEvent, edge: GraphEdge): void {
    event.stopPropagation();
    this.container().nativeElement.focus({ preventScroll: true });
    if (this.interactive()) {
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        const ids = new Set(this.selectedEdgeIds());
        if (ids.has(edge.id)) {
          ids.delete(edge.id);
        } else {
          ids.add(edge.id);
        }
        this.emitSelection(this.selectedNodeIds(), ids);
      } else {
        this.emitSelection([], [edge.id]);
      }
    }
    this.edgeClick.emit({ event, edge, flowPosition: this.controller.screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
  }

  protected onEdgeContextMenu(event: MouseEvent, edge: GraphEdge): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.interactive()) {
      return;
    }
    this.edgeContextMenu.emit({ event, edge, flowPosition: this.controller.screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
  }

  // ---------------------------------------------------------------- connecting

  onHandlePointerDown(event: PointerEvent, nodeId: string, handleId: string | null, handleType: HandleType): void {
    if (!this.interactive()) {
      return;
    }
    const rect = this.controller.getNodeRect(nodeId);
    const handle = findHandle(this.controller.getHandleBounds(nodeId), handleType, handleId);
    if (!rect) {
      return;
    }
    const fromPosition = handle?.position ?? (handleType === 'source' ? 'right' : 'left');
    const fromPoint = handle ? getHandleAnchor(rect, handle) : getFallbackAnchor(rect, fromPosition);
    const from: ConnectStartEvent = { nodeId, handleId, handleType };
    this.connection.set({ from, fromPoint, fromPosition, toPoint: this.controller.screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
    this.connectStart.emit(from);

    const move = (e: PointerEvent) => {
      const toPoint = this.controller.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      this.connection.update((c) => (c ? { ...c, toPoint } : c));
    };
    const up = (e: PointerEvent) => {
      this.cleanupListeners?.();
      this.connection.set(null);
      const drop = this.findDropTarget(e.clientX, e.clientY);
      const connection = resolveConnection(from, drop, (id) => this.controller.getHandleBounds(id), this.isValidConnection());
      if (connection) {
        this.connect.emit(connection);
      }
      this.connectEnd.emit({
        event: e,
        target: drop.kind,
        nodeId: drop.kind === 'pane' ? undefined : drop.nodeId,
        flowPosition: this.controller.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
        from,
        connected: !!connection
      });
    };
    this.listen(move, up);
  }

  /** Finds what's under the pointer; `elementFromPoint` also works for touch (GE-13). */
  private findDropTarget(clientX: number, clientY: number): ConnectionDropTarget {
    const el = document.elementFromPoint(clientX, clientY);
    const container = this.container().nativeElement;
    if (!el || !container.contains(el)) {
      return { kind: 'pane' };
    }
    const handleEl = el.closest<HTMLElement>('[data-ngf-handle]');
    if (handleEl?.dataset['nodeId']) {
      return {
        kind: 'handle',
        nodeId: handleEl.dataset['nodeId'],
        handleId: handleEl.dataset['handleId'] || null,
        handleType: handleEl.dataset['handleType'] as HandleType
      };
    }
    const nodeEl = el.closest<HTMLElement>('[data-ngf-node-id]');
    if (nodeEl?.dataset['ngfNodeId']) {
      return { kind: 'node', nodeId: nodeEl.dataset['ngfNodeId'] };
    }
    return { kind: 'pane' };
  }

  // ---------------------------------------------------------------- pane: pan, pinch, click

  protected onPanePointerDown(event: PointerEvent, fromNode = false): void {
    if (event.button !== 0 && event.pointerType === 'mouse') {
      return;
    }
    const el = this.container().nativeElement;
    if (!fromNode) {
      el.focus({ preventScroll: true });
    }
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.activePointers.size === 2) {
      const [a, b] = [...this.activePointers.values()];
      this.pinchStart = { distance: distance(a, b), zoom: this.controller.viewport().zoom };
      return;
    }
    if (this.activePointers.size > 2) {
      return;
    }

    const start = { x: event.clientX, y: event.clientY };
    const origin = this.controller.viewport();
    let moved = false;

    const move = (e: PointerEvent) => {
      if (!this.activePointers.has(e.pointerId)) {
        return;
      }
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.activePointers.size === 2 && this.pinchStart) {
        const [a, b] = [...this.activePointers.values()];
        const rect = el.getBoundingClientRect();
        const center = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
        const zoom = this.pinchStart.zoom * (distance(a, b) / this.pinchStart.distance);
        this.controller.viewport.set(zoomAtPoint(this.controller.viewport(), center, zoom, this.minZoom(), this.maxZoom()));
        moved = true;
        return;
      }
      if (!moved && distance(start, { x: e.clientX, y: e.clientY }) < CLICK_TOLERANCE) {
        return;
      }
      moved = true;
      this.panning.set(true);
      this.controller.viewport.set({ ...origin, x: origin.x + e.clientX - start.x, y: origin.y + e.clientY - start.y });
    };
    const up = (e: PointerEvent) => {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size > 0) {
        return;
      }
      this.pinchStart = null;
      this.cleanupListeners?.();
      this.panning.set(false);
      if (!moved && !fromNode) {
        if (this.interactive()) {
          this.emitSelection([], []);
        }
        this.paneClick.emit({ event: e, flowPosition: this.controller.screenToFlowPosition({ x: e.clientX, y: e.clientY }) });
      }
    };
    this.listen(move, up);
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.container().nativeElement.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    // Trackpad pinch arrives as ctrlKey wheel events with small deltas.
    const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002));
    const viewport = this.controller.viewport();
    this.controller.viewport.set(zoomAtPoint(viewport, point, viewport.zoom * factor, this.minZoom(), this.maxZoom()));
  }

  protected onPaneContextMenu(event: MouseEvent): void {
    event.preventDefault();
    if (!this.interactive()) {
      return;
    }
    this.paneContextMenu.emit({ event, flowPosition: this.controller.screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
  }

  // ---------------------------------------------------------------- keyboard

  protected onKeydown(event: KeyboardEvent): void {
    if ((event.key !== 'Backspace' && event.key !== 'Delete') || isTypingTarget(event.target) || !this.interactive()) {
      return;
    }
    const nodeChanges: NodeChange[] = this.selectedNodeIds().map((id) => ({ type: 'remove', id }));
    const edgeChanges: EdgeChange[] = this.selectedEdgeIds().map((id) => ({ type: 'remove', id }));
    if (nodeChanges.length === 0 && edgeChanges.length === 0) {
      return;
    }
    event.preventDefault();
    if (nodeChanges.length) {
      this.nodesChange.emit(nodeChanges);
    }
    if (edgeChanges.length) {
      this.edgesChange.emit(edgeChanges);
    }
  }

  // ---------------------------------------------------------------- helpers

  private listen(move: (e: PointerEvent) => void, up: (e: PointerEvent) => void): void {
    this.cleanupListeners?.();
    const cancel = (e: PointerEvent) => up(e);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    this.cleanupListeners = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      this.cleanupListeners = null;
    };
  }

  /** Coalesces work to one call per animation frame (GE-10). */
  private scheduleFrame(fn: () => void): void {
    cancelAnimationFrame(this.pendingFrame);
    this.pendingFrame = requestAnimationFrame(fn);
  }
}

function findHandle(handles: HandleBounds[] | undefined, type: HandleType, id: string | null | undefined): HandleBounds | undefined {
  if (!handles) {
    return undefined;
  }
  return handles.find((h) => h.type === type && (id == null || h.id === id)) ?? handles.find((h) => h.type === type);
}

function sameHandles(a: HandleBounds[] | undefined, b: HandleBounds[]): boolean {
  if (!a || a.length !== b.length) {
    return false;
  }
  return a.every((h, i) => h.id === b[i].id && h.type === b[i].type && h.x === b[i].x && h.y === b[i].y && h.width === b[i].width && h.height === b[i].height);
}
