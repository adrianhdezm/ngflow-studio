import { getAction, getIntegration } from '../actions/registry';
import { TriggerType, WorkflowEdge, WorkflowNode } from '../models/workflow';
import { createId } from './id';

/** Card size used for placement maths (CNV-05). */
export const NODE_SIZE = 192;

export function getTriggerType(node: WorkflowNode): TriggerType {
  return ((node.data.config?.['triggerType'] as TriggerType) ?? 'Manual') as TriggerType;
}

export function getActionType(node: WorkflowNode): string {
  return (node.data.config?.['actionType'] as string) ?? '';
}

/** Title shown on the card and in references: label, then the action label, then the raw type. */
export function getNodeDisplayName(node: WorkflowNode | undefined): string {
  if (!node) {
    return 'Unknown';
  }
  if (node.data.label) {
    return node.data.label;
  }
  if (node.type === 'trigger') {
    return getTriggerType(node);
  }
  const actionType = getActionType(node);
  return getAction(actionType)?.label ?? (actionType || 'Action');
}

export function getNodeDescription(node: WorkflowNode): string {
  if (node.data.description) {
    return node.data.description;
  }
  if (node.type === 'trigger') {
    return 'Trigger';
  }
  const action = getAction(getActionType(node));
  if (!action) {
    return getActionType(node) ? 'System' : 'Select an action';
  }
  return getIntegration(action.integration)?.label ?? action.category;
}

export function isEnabled(node: WorkflowNode): boolean {
  return node.data.enabled !== false;
}

export function createTriggerNode(position = { x: 0, y: 0 }): WorkflowNode {
  return {
    id: createId(),
    type: 'trigger',
    position,
    data: { label: '', description: '', type: 'trigger', config: { triggerType: 'Manual' }, status: 'idle' }
  };
}

export function createActionNode(position: { x: number; y: number }): WorkflowNode {
  return {
    id: createId(),
    type: 'action',
    position,
    data: { label: '', description: '', type: 'action', config: { actionType: '' }, status: 'idle', enabled: true }
  };
}

export function createAddPlaceholderNode(): WorkflowNode {
  return { id: 'add-placeholder', type: 'add', position: { x: 0, y: 0 }, data: { label: '', type: 'add' } };
}

export function createEdge(
  source: string,
  target: string,
  sourceHandle: string | null = null,
  targetHandle: string | null = null
): WorkflowEdge {
  return { id: createId(), source, target, sourceHandle, targetHandle, type: 'animated' };
}

/**
 * Finds a free spot for a new node centered on `center` (CNV-22): when another node sits within
 * 20px on both axes, step diagonally by +20/+20, up to 20 times.
 */
export function findFreePosition(center: { x: number; y: number }, nodes: WorkflowNode[]): { x: number; y: number } {
  let position = { x: center.x - NODE_SIZE / 2, y: center.y - NODE_SIZE / 2 };
  for (let i = 0; i < 20; i++) {
    const taken = nodes.some((n) => Math.abs(n.position.x - position.x) < 20 && Math.abs(n.position.y - position.y) < 20);
    if (!taken) {
      break;
    }
    position = { x: position.x + 20, y: position.y + 20 };
  }
  return position;
}

/** Strips runtime-only and UI-only state before persisting. */
export function toPersistedNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes
    .filter((n) => n.type !== 'add')
    .map((n) => {
      const { status: _status, ...data } = n.data;
      const { selected: _selected, ...rest } = n;
      return { ...rest, data };
    });
}

export function toPersistedEdges(edges: WorkflowEdge[]): WorkflowEdge[] {
  return edges.map(({ selected: _selected, ...rest }) => rest);
}
