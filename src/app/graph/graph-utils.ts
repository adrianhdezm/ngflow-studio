// Adapter to @statelyai/graph and the queries the app needs (GE-24, GE-25).
// Our node/edge arrays stay the source of truth; the library graph is a derived, read-only view.

import {
  Graph,
  createGraph,
  genBFS,
  getCycle,
  getEdgesOf,
  getPredecessors,
  getSources,
  getSuccessors,
  getTopologicalSort,
  hasPath,
  isAcyclic
} from '@statelyai/graph';
import { GraphEdge, GraphNode } from './types';

type AdapterNode = Pick<GraphNode, 'id' | 'position' | 'width' | 'height'> & { data?: unknown; type?: string };
type AdapterEdge = Pick<GraphEdge, 'id' | 'source' | 'target' | 'sourceHandle' | 'targetHandle'> & { type?: string };

let lastNodes: readonly AdapterNode[] | null = null;
let lastEdges: readonly AdapterEdge[] | null = null;
let lastGraph: Graph | null = null;

/** Maps nodes and edges to a `@statelyai/graph` graph. Memoized on array identity. */
export function toGraph(nodes: readonly AdapterNode[], edges: readonly AdapterEdge[]): Graph {
  if (lastGraph && nodes === lastNodes && edges === lastEdges) {
    return lastGraph;
  }
  const nodeIds = new Set(nodes.map((n) => n.id));
  const graph = createGraph({
    nodes: nodes.map((n) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      width: n.width,
      height: n.height,
      data: { type: n.type, data: n.data }
    })),
    // Dangling edges (to a deleted node) are ignored rather than making the graph invalid.
    edges: edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({
        id: e.id,
        sourceId: e.source,
        targetId: e.target,
        sourcePort: e.sourceHandle ?? undefined,
        targetPort: e.targetHandle ?? undefined,
        data: { type: e.type }
      }))
  });
  lastNodes = nodes;
  lastEdges = edges;
  lastGraph = graph;
  return graph;
}

/** Every node from which `nodeId` can be reached (transitive upstream), nearest first. */
export function getUpstreamNodeIds(graph: Graph, nodeId: string): string[] {
  const ids: string[] = [];
  for (const node of genBFS(graph, { from: nodeId, direction: 'incoming' })) {
    if (node.id !== nodeId) {
      ids.push(node.id);
    }
  }
  return ids;
}

export function getDirectInputs(graph: Graph, nodeId: string): string[] {
  return getPredecessors(graph, nodeId).map((n) => n.id);
}

export function getDirectOutputs(graph: Graph, nodeId: string): string[] {
  return getSuccessors(graph, nodeId).map((n) => n.id);
}

/** Ids of the edges attached to a node (removed along with it). */
export function getConnectedEdgeIds(graph: Graph, nodeId: string): string[] {
  return getEdgesOf(graph, nodeId).map((e) => e.id);
}

/** True when adding source → target would close a cycle (target already reaches source). */
export function wouldCreateCycle(graph: Graph, source: string, target: string): boolean {
  return source === target || hasPath(graph, target, source);
}

/** Topological order of node ids, or null when the graph has a cycle. */
export function getRunOrder(graph: Graph): string[] | null {
  const order = getTopologicalSort(graph);
  return order ? order.map((n) => n.id) : null;
}

/** Node ids along a cycle, if any. */
export function findCycle(graph: Graph): string[] | null {
  if (isAcyclic(graph)) {
    return null;
  }
  const cycle = getCycle(graph);
  if (!cycle) {
    return null;
  }
  return [cycle.source.id, ...cycle.steps.map((s) => s.node.id)];
}

/** Nodes that can't be reached from any of `entryIds`. */
export function getUnreachableNodeIds(graph: Graph, entryIds: string[]): string[] {
  return graph.nodes.filter((n) => !entryIds.some((entry) => hasPath(graph, entry, n.id))).map((n) => n.id);
}

export function getEntryNodeIds(graph: Graph): string[] {
  return getSources(graph).map((n) => n.id);
}
