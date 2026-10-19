// Pure helpers that apply engine change requests to the app's own arrays (GE-05).

import {
  Connection,
  ConnectionDropTarget,
  ConnectStartEvent,
  EdgeChange,
  GraphEdge,
  GraphNode,
  HandleBounds,
  IsValidConnection,
  NodeChange
} from './types';

/** Applies node changes, returning a new array. Unchanged nodes keep their identity. */
export function applyNodeChanges<N extends Pick<GraphNode, 'id' | 'position' | 'selected' | 'width' | 'height'>>(
  changes: NodeChange[],
  nodes: N[]
): N[] {
  if (changes.length === 0) {
    return nodes;
  }
  const removed = new Set<string>();
  const updates = new Map<string, NodeChange[]>();
  for (const change of changes) {
    if (change.type === 'remove') {
      removed.add(change.id);
    } else {
      const list = updates.get(change.id) ?? [];
      list.push(change);
      updates.set(change.id, list);
    }
  }
  const result: N[] = [];
  for (const node of nodes) {
    if (removed.has(node.id)) {
      continue;
    }
    const nodeChanges = updates.get(node.id);
    if (!nodeChanges) {
      result.push(node);
      continue;
    }
    let next = { ...node };
    for (const change of nodeChanges) {
      switch (change.type) {
        case 'position':
          next = { ...next, position: { ...change.position } };
          break;
        case 'select':
          next = { ...next, selected: change.selected };
          break;
        case 'dimensions':
          next = { ...next, width: change.width, height: change.height };
          break;
      }
    }
    result.push(next);
  }
  return result;
}

/** Applies edge changes, returning a new array. Unchanged edges keep their identity. */
export function applyEdgeChanges<E extends Pick<GraphEdge, 'id' | 'selected'>>(changes: EdgeChange[], edges: E[]): E[] {
  if (changes.length === 0) {
    return edges;
  }
  const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
  const selected = new Map<string, boolean>();
  for (const change of changes) {
    if (change.type === 'select') {
      selected.set(change.id, change.selected);
    }
  }
  return edges
    .filter((edge) => !removed.has(edge.id))
    .map((edge) => (selected.has(edge.id) ? { ...edge, selected: selected.get(edge.id) } : edge));
}

/** Select changes that make exactly `nodeIds` and `edgeIds` selected. */
export function getSelectChanges(
  nodes: Pick<GraphNode, 'id' | 'selected'>[],
  edges: Pick<GraphEdge, 'id' | 'selected'>[],
  nodeIds: Iterable<string>,
  edgeIds: Iterable<string>
): { nodeChanges: NodeChange[]; edgeChanges: EdgeChange[] } {
  const nodeSet = new Set(nodeIds);
  const edgeSet = new Set(edgeIds);
  const nodeChanges: NodeChange[] = [];
  const edgeChanges: EdgeChange[] = [];
  for (const node of nodes) {
    const want = nodeSet.has(node.id);
    if (!!node.selected !== want) {
      nodeChanges.push({ type: 'select', id: node.id, selected: want });
    }
  }
  for (const edge of edges) {
    const want = edgeSet.has(edge.id);
    if (!!edge.selected !== want) {
      edgeChanges.push({ type: 'select', id: edge.id, selected: want });
    }
  }
  return { nodeChanges, edgeChanges };
}

/**
 * Resolves a connection drag into a connection, using strict mode: source → target only, never a
 * self-connection. A drop on a node body uses that node's first handle of the needed type.
 */
export function resolveConnection(
  from: ConnectStartEvent,
  drop: ConnectionDropTarget,
  getHandles: (nodeId: string) => HandleBounds[],
  isValidConnection?: IsValidConnection
): Connection | null {
  if (drop.kind === 'pane' || drop.nodeId === from.nodeId) {
    return null;
  }
  const neededType = from.handleType === 'source' ? 'target' : 'source';
  let toHandleId: string | null;
  if (drop.kind === 'handle') {
    if (drop.handleType !== neededType) {
      return null;
    }
    toHandleId = drop.handleId;
  } else {
    const handle = getHandles(drop.nodeId).find((h) => h.type === neededType);
    if (!handle) {
      return null;
    }
    toHandleId = handle.id;
  }
  const connection: Connection =
    from.handleType === 'source'
      ? { source: from.nodeId, sourceHandle: from.handleId, target: drop.nodeId, targetHandle: toHandleId }
      : { source: drop.nodeId, sourceHandle: toHandleId, target: from.nodeId, targetHandle: from.handleId };
  if (isValidConnection && !isValidConnection(connection)) {
    return null;
  }
  return connection;
}
