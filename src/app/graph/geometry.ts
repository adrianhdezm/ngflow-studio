// Pure geometry used by the engine. No DOM access here (GE-03).

import { Dimensions, HandleBounds, HandlePosition, Rect, Viewport, XYPosition } from './types';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Converts a point relative to the graph container into flow coordinates. */
export function screenToFlow(point: XYPosition, viewport: Viewport): XYPosition {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom
  };
}

/** Converts a flow point into a point relative to the graph container. */
export function flowToScreen(point: XYPosition, viewport: Viewport): XYPosition {
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y
  };
}

/** Zooms to `nextZoom` while keeping `point` (container coordinates) fixed on screen. */
export function zoomAtPoint(viewport: Viewport, point: XYPosition, nextZoom: number, minZoom: number, maxZoom: number): Viewport {
  const zoom = clamp(nextZoom, minZoom, maxZoom);
  const flowPoint = screenToFlow(point, viewport);
  return {
    x: point.x - flowPoint.x * zoom,
    y: point.y - flowPoint.y * zoom,
    zoom
  };
}

/** Union of rectangles. Returns an empty rect at the origin for an empty list. */
export function getBounds(rects: Rect[]): Rect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Viewport that centers `bounds` in a container of `size`. `padding` is a fraction of the bounds
 * (0.2 leaves 20% of free space around the content).
 */
export function getViewportForBounds(bounds: Rect, size: Dimensions, minZoom: number, maxZoom: number, padding: number): Viewport {
  const paddedWidth = bounds.width * (1 + padding);
  const paddedHeight = bounds.height * (1 + padding);
  const zoomX = paddedWidth > 0 ? size.width / paddedWidth : maxZoom;
  const zoomY = paddedHeight > 0 ? size.height / paddedHeight : maxZoom;
  const zoom = clamp(Math.min(zoomX, zoomY), minZoom, maxZoom);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return {
    x: size.width / 2 - centerX * zoom,
    y: size.height / 2 - centerY * zoom,
    zoom
  };
}

/** The visible area of the container, in flow coordinates. */
export function getVisibleFlowRect(viewport: Viewport, size: Dimensions): Rect {
  const topLeft = screenToFlow({ x: 0, y: 0 }, viewport);
  return { x: topLeft.x, y: topLeft.y, width: size.width / viewport.zoom, height: size.height / viewport.zoom };
}

export function pointInRect(point: XYPosition, rect: Rect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/** Topmost rect (last in the list) containing the point. */
export function hitTest<T extends Rect & { id: string }>(point: XYPosition, rects: T[]): T | undefined {
  for (let i = rects.length - 1; i >= 0; i--) {
    if (pointInRect(point, rects[i])) {
      return rects[i];
    }
  }
  return undefined;
}

/** The point on a handle's outer edge where an edge attaches, in flow coordinates. */
export function getHandleAnchor(
  nodePosition: XYPosition,
  handle: Pick<HandleBounds, 'x' | 'y' | 'width' | 'height' | 'position'>
): XYPosition {
  const x = nodePosition.x + handle.x;
  const y = nodePosition.y + handle.y;
  switch (handle.position) {
    case 'left':
      return { x, y: y + handle.height / 2 };
    case 'right':
      return { x: x + handle.width, y: y + handle.height / 2 };
    case 'top':
      return { x: x + handle.width / 2, y };
    case 'bottom':
      return { x: x + handle.width / 2, y: y + handle.height };
  }
}

/** Attachment point when a node has no measured handle: the middle of the matching side. */
export function getFallbackAnchor(rect: Rect, position: HandlePosition): XYPosition {
  switch (position) {
    case 'left':
      return { x: rect.x, y: rect.y + rect.height / 2 };
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y };
    case 'bottom':
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
  }
}

function controlOffset(distance: number, curvature: number): number {
  return distance >= 0 ? 0.5 * distance : curvature * 25 * Math.sqrt(-distance);
}

function controlPoint(position: HandlePosition, x1: number, y1: number, x2: number, y2: number, curvature: number): XYPosition {
  switch (position) {
    case 'left':
      return { x: x1 - controlOffset(x1 - x2, curvature), y: y1 };
    case 'right':
      return { x: x1 + controlOffset(x2 - x1, curvature), y: y1 };
    case 'top':
      return { x: x1, y: y1 - controlOffset(y1 - y2, curvature) };
    case 'bottom':
      return { x: x1, y: y1 + controlOffset(y2 - y1, curvature) };
  }
}

export interface BezierParams {
  sourceX: number;
  sourceY: number;
  sourcePosition?: HandlePosition;
  targetX: number;
  targetY: number;
  targetPosition?: HandlePosition;
  curvature?: number;
}

export interface BezierPath {
  path: string;
  labelX: number;
  labelY: number;
}

/** Cubic bezier between two anchors, with control points pulled out along each handle's side. */
export function getBezierPath({
  sourceX,
  sourceY,
  sourcePosition = 'right',
  targetX,
  targetY,
  targetPosition = 'left',
  curvature = 0.25
}: BezierParams): BezierPath {
  const c1 = controlPoint(sourcePosition, sourceX, sourceY, targetX, targetY, curvature);
  const c2 = controlPoint(targetPosition, targetX, targetY, sourceX, sourceY, curvature);
  // Point at t = 0.5 on the cubic curve.
  const labelX = sourceX * 0.125 + c1.x * 0.375 + c2.x * 0.375 + targetX * 0.125;
  const labelY = sourceY * 0.125 + c1.y * 0.375 + c2.y * 0.375 + targetY * 0.125;
  return {
    path: `M${sourceX},${sourceY} C${c1.x},${c1.y} ${c2.x},${c2.y} ${targetX},${targetY}`,
    labelX,
    labelY
  };
}

export function oppositePosition(position: HandlePosition): HandlePosition {
  switch (position) {
    case 'left':
      return 'right';
    case 'right':
      return 'left';
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
  }
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function interpolateViewport(from: Viewport, to: Viewport, t: number): Viewport {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    zoom: from.zoom + (to.zoom - from.zoom) * t
  };
}

export function distance(a: XYPosition, b: XYPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
