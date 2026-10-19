// Pre-run validation (RUN-02).

import { flattenFields, getAction, getIntegration, isFieldVisible } from '../actions/registry';
import { findCycle, getUnreachableNodeIds, toGraph } from '../graph';
import { Connection, WorkflowEdge, WorkflowNode } from '../models/workflow';
import { getActionType, getNodeDisplayName, isEnabled } from './nodes';
import { findReferencesInConfig } from './templates';

export interface BrokenReferenceIssue {
  nodeId: string;
  nodeName: string;
  references: { fieldKey: string; fieldLabel: string; text: string }[];
}

export interface MissingFieldIssue {
  nodeId: string;
  nodeName: string;
  fields: { key: string; label: string }[];
}

export interface MissingConnectionIssue {
  integrationType: string;
  integrationLabel: string;
  steps: { nodeId: string; nodeName: string }[];
}

export interface ValidationResult {
  brokenReferences: BrokenReferenceIssue[];
  missingFields: MissingFieldIssue[];
  missingConnections: MissingConnectionIssue[];
  unconfiguredSteps: { nodeId: string; nodeName: string }[];
  cycle: { nodeId: string; nodeName: string }[] | null;
  unreachableSteps: { nodeId: string; nodeName: string }[];
  total: number;
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/** Human-readable label of a config key for a node (falls back to the key). */
export function getFieldLabel(node: WorkflowNode, key: string): string {
  if (node.type === 'trigger') {
    return key === 'webhookMockRequest' ? 'Mock Request' : key === 'scheduleCron' ? 'Cron Expression' : key;
  }
  const action = getAction(getActionType(node));
  return (action && flattenFields(action.configFields).find((f) => f.key === key)?.label) ?? key;
}

export function validateWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[], connections: Connection[]): ValidationResult {
  const real = nodes.filter((n) => n.type !== 'add');
  const ids = new Set(real.map((n) => n.id));
  const enabled = real.filter(isEnabled);

  const brokenReferences: BrokenReferenceIssue[] = [];
  const missingFields: MissingFieldIssue[] = [];
  const unconfiguredSteps: { nodeId: string; nodeName: string }[] = [];
  const missingByType = new Map<string, MissingConnectionIssue>();

  for (const node of enabled) {
    const nodeName = getNodeDisplayName(node);
    const config = node.data.config ?? {};

    const broken = findReferencesInConfig(config)
      .filter(({ reference }) => !ids.has(reference.nodeId))
      .map(({ key, reference }) => ({
        fieldKey: key,
        fieldLabel: getFieldLabel(node, key),
        text: `${reference.label}${reference.field ? `.${reference.field}` : ''}`
      }));
    if (broken.length) {
      brokenReferences.push({ nodeId: node.id, nodeName, references: broken });
    }

    if (node.type !== 'action') {
      if (node.type === 'trigger' && config['triggerType'] === 'Schedule' && isEmpty(config['scheduleCron'])) {
        missingFields.push({ nodeId: node.id, nodeName, fields: [{ key: 'scheduleCron', label: 'Cron Expression' }] });
      }
      continue;
    }

    const action = getAction(getActionType(node));
    if (!action) {
      unconfiguredSteps.push({ nodeId: node.id, nodeName });
      continue;
    }

    const fields = flattenFields(action.configFields);
    const missing = fields
      .filter((f) => f.required && isFieldVisible(f, config, fields))
      .filter((f) => isEmpty(config[f.key] ?? f.defaultValue))
      .map((f) => ({ key: f.key, label: f.label }));
    if (missing.length) {
      missingFields.push({ nodeId: node.id, nodeName, fields: missing });
    }

    if (action.integration && !connections.some((c) => c.type === action.integration)) {
      const issue = missingByType.get(action.integration) ?? {
        integrationType: action.integration,
        integrationLabel: getIntegration(action.integration)?.label ?? action.integration,
        steps: []
      };
      issue.steps.push({ nodeId: node.id, nodeName });
      missingByType.set(action.integration, issue);
    }
  }

  // Graph checks only consider enabled steps; disabled ones are skipped at run time.
  const enabledIds = new Set(enabled.map((n) => n.id));
  const graph = toGraph(
    enabled,
    edges.filter((e) => enabledIds.has(e.source) && enabledIds.has(e.target))
  );
  const named = (id: string) => ({ nodeId: id, nodeName: getNodeDisplayName(real.find((n) => n.id === id)) });
  const cycleIds = findCycle(graph);
  const cycle = cycleIds ? [...new Set(cycleIds)].map(named) : null;
  const triggerIds = enabled.filter((n) => n.type === 'trigger').map((n) => n.id);
  const unreachableSteps = triggerIds.length ? getUnreachableNodeIds(graph, triggerIds).map(named) : [];

  const missingConnections = [...missingByType.values()];
  const total =
    brokenReferences.reduce((sum, i) => sum + i.references.length, 0) +
    missingFields.reduce((sum, i) => sum + i.fields.length, 0) +
    missingConnections.reduce((sum, i) => sum + i.steps.length, 0) +
    unconfiguredSteps.length +
    (cycle ? 1 : 0) +
    unreachableSteps.length;

  return { brokenReferences, missingFields, missingConnections, unconfiguredSteps, cycle, unreachableSteps, total };
}
