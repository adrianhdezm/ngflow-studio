import { getRunOrder, toGraph } from '../../graph';
import { generateExportFiles } from '../../lib/codegen';
import { createId } from '../../lib/id';
import { getActionType, getNodeDisplayName, getTriggerType, isEnabled, toPersistedEdges, toPersistedNodes } from '../../lib/nodes';
import { readStorage, writeStorage } from '../../lib/storage';
import { resolveConfig } from '../../lib/templates';
import {
  ExecutionLog,
  ExecutionStatusResult,
  NodeStatus,
  Workflow,
  WorkflowEdge,
  WorkflowExecution,
  WorkflowNode,
  WorkflowSummary
} from '../../models/workflow';
import { NotFoundError } from '../errors';
import type { WorkflowService } from '../workflow.service';
import { LATENCY, delay } from './delay';
import { SkipBranch, runStep } from './mock-executor';

const WORKFLOWS_KEY = 'ngflow:workflows';
const EXECUTIONS_KEY = 'ngflow:executions';
const LOGS_KEY = 'ngflow:execution-logs';

/**
 * Persistence and execution backed by localStorage. Runs execute in the page: nodes run in
 * topological order with fake outputs, and progress is read back through `getExecutionStatus`.
 */
export class MockWorkflowService implements WorkflowService {
  /** Live node statuses of runs started in this page. */
  private readonly live = new Map<string, Map<string, NodeStatus>>();

  // ---------------------------------------------------------------- storage

  private workflows(): Workflow[] {
    return readStorage<Workflow[]>(WORKFLOWS_KEY, []);
  }

  private saveWorkflows(workflows: Workflow[]): void {
    writeStorage(WORKFLOWS_KEY, workflows);
  }

  private executions(): WorkflowExecution[] {
    const executions = readStorage<WorkflowExecution[]>(EXECUTIONS_KEY, []);
    // A run that was in flight when the page unloaded will never finish.
    return executions.map((e) => (e.status === 'running' && !this.live.has(e.id) ? { ...e, status: 'error' as const } : e));
  }

  private saveExecutions(executions: WorkflowExecution[]): void {
    writeStorage(EXECUTIONS_KEY, executions);
  }

  private logs(): ExecutionLog[] {
    return readStorage<ExecutionLog[]>(LOGS_KEY, []);
  }

  private saveLogs(logs: ExecutionLog[]): void {
    writeStorage(LOGS_KEY, logs);
  }

  private find(id: string): Workflow {
    const workflow = this.workflows().find((w) => w.id === id);
    if (!workflow) {
      throw new NotFoundError(`Workflow ${id} not found`);
    }
    return workflow;
  }

  // ---------------------------------------------------------------- workflows

  async list(): Promise<WorkflowSummary[]> {
    await delay(LATENCY);
    return this.workflows()
      .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Workflow> {
    await delay(LATENCY);
    return structuredClone(this.find(id));
  }

  async create(input: { name: string; description?: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] }): Promise<Workflow> {
    await delay(LATENCY);
    const workflow: Workflow = {
      id: createId(),
      name: input.name,
      description: input.description,
      nodes: toPersistedNodes(input.nodes),
      edges: toPersistedEdges(input.edges),
      visibility: 'private',
      isOwner: true,
      updatedAt: new Date().toISOString()
    };
    this.saveWorkflows([...this.workflows(), workflow]);
    return structuredClone(workflow);
  }

  async update(id: string, patch: Partial<Pick<Workflow, 'name' | 'nodes' | 'edges' | 'visibility'>>): Promise<void> {
    await delay(LATENCY);
    const workflows = this.workflows();
    const index = workflows.findIndex((w) => w.id === id);
    if (index === -1) {
      throw new NotFoundError();
    }
    const next = { ...workflows[index], ...patch, updatedAt: new Date().toISOString() };
    if (patch.nodes) {
      next.nodes = toPersistedNodes(patch.nodes);
    }
    if (patch.edges) {
      next.edges = toPersistedEdges(patch.edges);
    }
    workflows[index] = next;
    this.saveWorkflows(workflows);
  }

  async delete(id: string): Promise<void> {
    await delay(LATENCY);
    this.find(id);
    this.saveWorkflows(this.workflows().filter((w) => w.id !== id));
    await this.deleteExecutions(id);
  }

  async duplicate(id: string): Promise<Workflow> {
    const source = this.find(id);
    // Fresh node ids, so the copy's references point at its own nodes.
    const idMap = new Map(source.nodes.map((n) => [n.id, createId()]));
    const remap = (value: string) => [...idMap].reduce((s, [from, to]) => s.split(`{{@${from}:`).join(`{{@${to}:`), value);
    const nodes = source.nodes.map((n) => ({
      ...n,
      id: idMap.get(n.id)!,
      data: { ...n.data, config: JSON.parse(remap(JSON.stringify(n.data.config ?? {}))) }
    }));
    const edges = source.edges.map((e) => ({ ...e, id: createId(), source: idMap.get(e.source) ?? e.source, target: idMap.get(e.target) ?? e.target }));
    return this.create({ name: `${source.name} (Copy)`, nodes, edges });
  }

  async exportCode(id: string): Promise<Record<string, string>> {
    await delay(LATENCY * 3);
    const workflow = this.find(id);
    return generateExportFiles(workflow.nodes, workflow.edges, { name: workflow.name });
  }

  // ---------------------------------------------------------------- executions

  async execute(id: string, input?: unknown): Promise<{ executionId: string }> {
    await delay(LATENCY);
    const workflow = this.find(id);
    const execution: WorkflowExecution = { id: createId(), workflowId: id, status: 'running', startedAt: new Date().toISOString() };
    this.live.set(execution.id, new Map());
    this.saveExecutions([execution, ...this.executions()]);
    void this.run(execution, workflow, input);
    return { executionId: execution.id };
  }

  private async run(execution: WorkflowExecution, workflow: Workflow, input: unknown): Promise<void> {
    const statuses = this.live.get(execution.id)!;
    const nodes = workflow.nodes.filter((n) => n.type !== 'add' && isEnabled(n));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = workflow.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const graph = toGraph(nodes, edges);
    const order = getRunOrder(graph);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const outputs: Record<string, unknown> = {};
    const skipped = new Set<string>();
    let failed = false;

    if (!order) {
      failed = true;
    }

    for (const nodeId of order ?? []) {
      const node = byId.get(nodeId)!;
      const parents = edges.filter((e) => e.target === nodeId).map((e) => e.source);
      // A step only runs when it's the trigger or at least one input ran; false conditions prune branches.
      if (node.type !== 'trigger' && (parents.length === 0 || parents.every((p) => skipped.has(p)))) {
        skipped.add(nodeId);
        continue;
      }
      const startedAt = new Date().toISOString();
      const config = resolveConfig(node.data.config ?? {}, outputs);
      const stepInput = node.type === 'trigger' ? (input ?? config) : config;
      const log: ExecutionLog = {
        id: createId(),
        executionId: execution.id,
        nodeId,
        nodeName: getNodeDisplayName(node),
        nodeType: node.type === 'trigger' ? getTriggerType(node) : getActionType(node),
        status: 'running',
        input: stripInternal(stepInput),
        startedAt
      };
      statuses.set(nodeId, 'running');
      this.saveLogs([...this.logs(), log]);

      const t0 = performance.now();
      try {
        const output = await runStep(node, config, startedAt);
        outputs[nodeId] = output;
        statuses.set(nodeId, 'success');
        this.updateLog(log.id, { status: 'success', output, duration: String(Math.round(performance.now() - t0)) });
      } catch (error) {
        if (error instanceof SkipBranch) {
          outputs[nodeId] = { result: false };
          statuses.set(nodeId, 'success');
          this.updateLog(log.id, { status: 'success', output: { result: false }, duration: String(Math.round(performance.now() - t0)) });
          skipped.add(nodeId);
          continue;
        }
        statuses.set(nodeId, 'error');
        this.updateLog(log.id, {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          duration: String(Math.round(performance.now() - t0))
        });
        failed = true;
        break;
      }
    }

    const completedAt = new Date().toISOString();
    this.saveExecutions(
      this.executions().map((e) =>
        e.id === execution.id
          ? {
              ...e,
              status: failed ? 'error' : 'success',
              completedAt,
              duration: String(new Date(completedAt).getTime() - new Date(e.startedAt).getTime())
            }
          : e
      )
    );
    // Keep the live map briefly so a poll right after completion still sees final statuses.
    setTimeout(() => this.live.delete(execution.id), 5000);
  }

  private updateLog(id: string, patch: Partial<ExecutionLog>): void {
    this.saveLogs(this.logs().map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  async getExecutionStatus(executionId: string): Promise<ExecutionStatusResult> {
    await delay(30);
    const execution = this.executions().find((e) => e.id === executionId);
    if (!execution) {
      throw new NotFoundError('Execution not found');
    }
    const live = this.live.get(executionId);
    const nodeStatuses = live
      ? [...live].map(([nodeId, status]) => ({ nodeId, status }))
      : this.logs()
          .filter((l) => l.executionId === executionId)
          .map((l) => ({ nodeId: l.nodeId, status: (l.status === 'pending' ? 'idle' : l.status) as NodeStatus }));
    return { status: execution.status, nodeStatuses };
  }

  async listExecutions(workflowId: string): Promise<WorkflowExecution[]> {
    await delay(LATENCY);
    return this.executions()
      .filter((e) => e.workflowId === workflowId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async getExecutionLogs(executionId: string): Promise<ExecutionLog[]> {
    await delay(LATENCY / 2);
    return this.logs().filter((l) => l.executionId === executionId);
  }

  async deleteExecutions(workflowId: string): Promise<void> {
    await delay(LATENCY);
    const ids = new Set(
      this.executions()
        .filter((e) => e.workflowId === workflowId)
        .map((e) => e.id)
    );
    this.saveExecutions(this.executions().filter((e) => !ids.has(e.id)));
    this.saveLogs(this.logs().filter((l) => !ids.has(l.executionId)));
  }
}

function stripInternal(config: unknown): unknown {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return config;
  }
  const { integrationId: _integrationId, ...rest } = config as Record<string, unknown>;
  return rest;
}
