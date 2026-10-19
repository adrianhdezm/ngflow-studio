// Interfaces the UI depends on (01-data-model.md, DM-01). Mocks are provided by default; a real
// backend only needs to provide these tokens.

import { InjectionToken, inject } from '@angular/core';
import {
  Connection,
  ExecutionLog,
  ExecutionStatusResult,
  Workflow,
  WorkflowEdge,
  WorkflowExecution,
  WorkflowNode,
  WorkflowSummary,
  WorkflowVisibility
} from '../models/workflow';
import { MockAiService } from './mock/mock-ai.service';
import { MockConnectionService } from './mock/mock-connection.service';
import { MockWorkflowService } from './mock/mock-workflow.service';

export { NotFoundError } from './errors';

export interface WorkflowService {
  list(): Promise<WorkflowSummary[]>;
  get(id: string): Promise<Workflow>;
  create(input: { name: string; description?: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] }): Promise<Workflow>;
  update(id: string, patch: Partial<Pick<Workflow, 'name' | 'nodes' | 'edges' | 'visibility'>>): Promise<void>;
  delete(id: string): Promise<void>;
  duplicate(id: string): Promise<Workflow>;

  execute(id: string, input?: unknown): Promise<{ executionId: string }>;
  getExecutionStatus(executionId: string): Promise<ExecutionStatusResult>;
  listExecutions(workflowId: string): Promise<WorkflowExecution[]>;
  getExecutionLogs(executionId: string): Promise<ExecutionLog[]>;
  deleteExecutions(workflowId: string): Promise<void>;

  exportCode(id: string): Promise<Record<string, string>>;
}

export interface ConnectionService {
  list(): Promise<Connection[]>;
  create(input: { type: string; name: string; credentials?: Record<string, string> }): Promise<Connection>;
  delete(id: string): Promise<void>;
}

export interface GeneratedWorkflow {
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface AiService {
  generateStream(
    prompt: string,
    existing: GeneratedWorkflow | null,
    onPartial: (partial: Partial<GeneratedWorkflow>) => void
  ): Promise<GeneratedWorkflow>;
}

export type { WorkflowVisibility };

export const WORKFLOW_SERVICE = new InjectionToken<WorkflowService>('WORKFLOW_SERVICE', {
  providedIn: 'root',
  factory: () => new MockWorkflowService()
});

export const CONNECTION_SERVICE = new InjectionToken<ConnectionService>('CONNECTION_SERVICE', {
  providedIn: 'root',
  factory: () => new MockConnectionService()
});

export const AI_SERVICE = new InjectionToken<AiService>('AI_SERVICE', {
  providedIn: 'root',
  factory: () => new MockAiService()
});

export function injectWorkflowService(): WorkflowService {
  return inject(WORKFLOW_SERVICE);
}
