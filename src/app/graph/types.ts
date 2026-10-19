import { InjectionToken } from '@angular/core';

export interface XYPosition {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface Rect extends XYPosition, Dimensions {}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export type HandleType = 'source' | 'target';
export type HandlePosition = 'left' | 'right' | 'top' | 'bottom';

export interface GraphNode<D = unknown> {
  id: string;
  type: string;
  position: XYPosition;
  data: D;
  selected?: boolean;
  draggable?: boolean;
  selectable?: boolean;
  width?: number;
  height?: number;
  /** Accessible name of the node's focusable wrapper. */
  ariaLabel?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  selected?: boolean;
}

export type NodeChange =
  | { type: 'position'; id: string; position: XYPosition; dragging: boolean }
  | { type: 'select'; id: string; selected: boolean }
  | { type: 'remove'; id: string }
  | { type: 'dimensions'; id: string; width: number; height: number };

export type EdgeChange = { type: 'select'; id: string; selected: boolean } | { type: 'remove'; id: string };

/** Bounds of a handle relative to its node's top-left corner, in flow units. */
export interface HandleBounds extends Rect {
  id: string | null;
  type: HandleType;
  position: HandlePosition;
}

export interface Connection {
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}

export interface ConnectStartEvent {
  nodeId: string;
  handleId: string | null;
  handleType: HandleType;
}

export interface ConnectEndEvent {
  event: PointerEvent;
  target: 'handle' | 'node' | 'pane';
  nodeId?: string;
  flowPosition: XYPosition;
  /** Where the drag started. */
  from: ConnectStartEvent;
  /** Whether a `connect` event was emitted for this drag. */
  connected: boolean;
}

export interface NodeMouseEvent<D = unknown> {
  event: MouseEvent;
  node: GraphNode<D>;
  flowPosition: XYPosition;
}

export interface EdgeMouseEvent {
  event: MouseEvent;
  edge: GraphEdge;
  flowPosition: XYPosition;
}

export interface PaneMouseEvent {
  event: MouseEvent;
  flowPosition: XYPosition;
}

export interface SelectionChangeEvent<D = unknown> {
  nodes: GraphNode<D>[];
  edges: GraphEdge[];
}

export interface FitViewOptions {
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
  duration?: number;
  nodeIds?: string[];
}

export type IsValidConnection = (connection: Connection) => boolean;

/** Drop target found under the pointer when a connection drag ends. */
export type ConnectionDropTarget =
  | { kind: 'handle'; nodeId: string; handleId: string | null; handleType: HandleType }
  | { kind: 'node'; nodeId: string }
  | { kind: 'pane' };

/** What node wrappers and handles call back into; implemented by the graph component. */
export interface GraphInternals {
  onNodePointerDown(event: PointerEvent, node: GraphNode, element: HTMLElement): void;
  onNodeContextMenu(event: MouseEvent, node: GraphNode): void;
  onNodeKeydown(event: KeyboardEvent, node: GraphNode): void;
  onHandlePointerDown(event: PointerEvent, nodeId: string, handleId: string | null, handleType: HandleType): void;
  onNodeMeasured(id: string, size: Dimensions, handles: HandleBounds[]): void;
  isInteractive(): boolean;
}

export const NGF_GRAPH = new InjectionToken<GraphInternals>('NGF_GRAPH');

export interface NodeContext {
  nodeId: string;
}

export const NGF_NODE = new InjectionToken<NodeContext>('NGF_NODE');
