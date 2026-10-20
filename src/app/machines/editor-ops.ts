// Pure document operations used by the editor machine's actions. Each takes the current
// nodes/edges and returns new arrays; nothing here knows about XState.

import { Connection, EdgeChange, NodeChange, applyEdgeChanges, applyNodeChanges, toGraph, wouldCreateCycle } from '../graph';
import { createEdge } from '../lib/nodes';
import { propagateRename } from '../lib/templates';
import { NodeStatus, WorkflowEdge, WorkflowNode, WorkflowNodeData } from '../models/workflow';

export interface GraphDoc {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface Selection {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
}

/** Ids derived from each item's `selected` flag: set only when exactly one node (or edge) is selected. */
export function deriveSelection(doc: GraphDoc): Selection {
  const nodes = doc.nodes.filter((n) => n.selected);
  const edges = doc.edges.filter((e) => e.selected);
  return {
    selectedNodeId: nodes.length === 1 && edges.length === 0 ? nodes[0].id : null,
    selectedEdgeId: edges.length === 1 && nodes.length === 0 ? edges[0].id : null
  };
}

export function selectOnly(doc: GraphDoc, nodeIds: string[], edgeIds: string[] = []): GraphDoc {
  const nodeSet = new Set(nodeIds);
  const edgeSet = new Set(edgeIds);
  return {
    nodes: doc.nodes.map((n) => (!!n.selected === nodeSet.has(n.id) ? n : { ...n, selected: nodeSet.has(n.id) })),
    edges: doc.edges.map((e) => (!!e.selected === edgeSet.has(e.id) ? e : { ...e, selected: edgeSet.has(e.id) }))
  };
}

export function isTrigger(nodes: WorkflowNode[], id: string): boolean {
  return nodes.find((n) => n.id === id)?.type === 'trigger';
}

/** Removes nodes (never triggers or placeholders) and every edge attached to them. */
export function removeNodes(doc: GraphDoc, ids: string[]): GraphDoc {
  const removable = new Set(ids.filter((id) => doc.nodes.some((n) => n.id === id && n.type === 'action')));
  if (removable.size === 0) {
    return doc;
  }
  return {
    nodes: doc.nodes.filter((n) => !removable.has(n.id)),
    edges: doc.edges.filter((e) => !removable.has(e.source) && !removable.has(e.target))
  };
}

export function removeEdges(doc: GraphDoc, ids: string[]): GraphDoc {
  const set = new Set(ids);
  return { nodes: doc.nodes, edges: doc.edges.filter((e) => !set.has(e.id)) };
}

/** Applies engine node changes, dropping trigger removals and edges of removed nodes. */
export function applyNodeChangesToDoc(doc: GraphDoc, changes: NodeChange[]): GraphDoc {
  const relevant = changes.filter((c) => c.type !== 'dimensions');
  const removeIds = relevant.filter((c) => c.type === 'remove').map((c) => c.id);
  const others = relevant.filter((c) => c.type !== 'remove');
  const moved = { nodes: applyNodeChanges(others, doc.nodes), edges: doc.edges };
  return removeIds.length ? removeNodes(moved, removeIds) : moved;
}

export function applyEdgeChangesToDoc(doc: GraphDoc, changes: EdgeChange[]): GraphDoc {
  return { nodes: doc.nodes, edges: applyEdgeChanges(changes, doc.edges) };
}

/** Workflow connection rules (CNV-16, GE-25): no self-loops, no duplicates, no cycles, nothing into a trigger. */
export function isValidWorkflowConnection(doc: GraphDoc, connection: Pick<Connection, 'source' | 'target'>): boolean {
  const { source, target } = connection;
  if (source === target) {
    return false;
  }
  const targetNode = doc.nodes.find((n) => n.id === target);
  if (!targetNode || targetNode.type === 'trigger' || targetNode.type === 'add') {
    return false;
  }
  if (doc.edges.some((e) => e.source === source && e.target === target)) {
    return false;
  }
  return !wouldCreateCycle(toGraph(doc.nodes, doc.edges), source, target);
}

export function addConnection(doc: GraphDoc, connection: Connection): GraphDoc {
  if (!isValidWorkflowConnection(doc, connection)) {
    return doc;
  }
  return {
    nodes: doc.nodes,
    edges: [...doc.edges, createEdge(connection.source, connection.target, connection.sourceHandle, connection.targetHandle)]
  };
}

/** Patches a node's data. A label change rewrites references to it in other nodes (TPL-05). */
export function updateNodeData(doc: GraphDoc, id: string, patch: Partial<WorkflowNodeData>): GraphDoc {
  const node = doc.nodes.find((n) => n.id === id);
  if (!node) {
    return doc;
  }
  const next = { ...node, data: { ...node.data, ...patch } };
  let nodes = doc.nodes.map((n) => (n.id === id ? next : n));
  if (patch.label !== undefined && patch.label !== node.data.label) {
    nodes = propagateRename(nodes, id, patch.label);
  }
  return { nodes, edges: doc.edges };
}

export function setStatuses(
  nodes: WorkflowNode[],
  statuses: Map<string, NodeStatus> | ((node: WorkflowNode) => NodeStatus)
): WorkflowNode[] {
  return nodes.map((node) => {
    const status = typeof statuses === 'function' ? statuses(node) : (statuses.get(node.id) ?? 'idle');
    return node.data.status === status ? node : { ...node, data: { ...node.data, status } };
  });
}

/** Normalizes generated output: animated edges, one trigger, no dangling edges (AI-04). */
export function normalizeGenerated(doc: Partial<GraphDoc>): GraphDoc {
  const nodes = doc.nodes ?? [];
  const firstTrigger = nodes.find((n) => n.type === 'trigger');
  const dropped = new Set(nodes.filter((n) => n.type === 'trigger' && n !== firstTrigger).map((n) => n.id));
  const kept = nodes
    .filter((n) => !dropped.has(n.id) && n.type !== 'add')
    .map((n) => ({ ...n, data: { ...n.data, status: 'idle' as const } }));
  const ids = new Set(kept.map((n) => n.id));
  const edges = (doc.edges ?? []).filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e, type: 'animated' as const }));
  return { nodes: kept, edges };
}

export function snapshot(doc: GraphDoc): GraphDoc {
  // Selection and runtime status aren't part of history.
  return {
    nodes: doc.nodes.map(({ selected: _s, ...n }) => ({ ...n, data: { ...n.data, status: 'idle' as const } })),
    edges: doc.edges.map(({ selected: _s, ...e }) => e)
  };
}

export const HISTORY_LIMIT = 100;

export function pushHistory(history: GraphDoc[], doc: GraphDoc): GraphDoc[] {
  const next = [...history, snapshot(doc)];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}
