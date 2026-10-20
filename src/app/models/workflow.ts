// Data model shared by the editor, the services and the mocks (docs/requirements/01-data-model.md).

export type WorkflowVisibility = 'private' | 'public';

export type WorkflowNodeType = 'trigger' | 'action' | 'add';
export type NodeStatus = 'idle' | 'running' | 'success' | 'error';
export type TriggerType = 'Manual' | 'Schedule' | 'Webhook';

export interface WorkflowNodeData {
  label: string; // '' means "use the default display name"
  description?: string;
  type: WorkflowNodeType;
  config?: Record<string, unknown>;
  status?: NodeStatus; // runtime only
  enabled?: boolean; // default true
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  selected?: boolean;
  data: WorkflowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type: 'animated' | 'temporary';
  selected?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  visibility: WorkflowVisibility;
  isOwner: boolean;
  updatedAt: string;
}

export type WorkflowSummary = Pick<Workflow, 'id' | 'name' | 'updatedAt'>;

export type ConfigFieldType = 'template-input' | 'template-textarea' | 'text' | 'number' | 'select' | 'schema-builder';

export interface InputConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  placeholder?: string;
  defaultValue?: string;
  options?: { value: string; label: string }[];
  rows?: number;
  min?: number;
  required?: boolean;
  showWhen?: { field: string; equals: string };
}

export interface GroupConfigField {
  label: string;
  type: 'group';
  fields: ConfigField[];
  defaultExpanded?: boolean;
}

export type ConfigField = InputConfigField | GroupConfigField;

export interface OutputField {
  field: string;
  description: string;
}

export interface ActionDefinition {
  id: string;
  label: string;
  description: string;
  category: string;
  integration?: string;
  icon?: string;
  configFields: ConfigField[];
  outputFields?: OutputField[];
  outputDisplay?: { type: 'image' | 'video' | 'url'; field: string };
  /** Display name of the model, for AI actions (CNV-09 model badge). */
  modelLabel?: (config: Record<string, unknown>) => string | undefined;
}

export interface SchemaField {
  id?: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  itemType?: 'string' | 'number' | 'boolean' | 'object';
  fields?: SchemaField[];
  description?: string;
}

export interface Connection {
  id: string;
  type: string;
  name: string;
}

export type ExecutionStatus = 'pending' | 'running' | 'success' | 'error';

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  duration?: string;
}

export interface ExecutionLog {
  id: string;
  executionId: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: ExecutionStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt: string;
  duration?: string;
}

export interface ExecutionStatusResult {
  status: ExecutionStatus;
  nodeStatuses: { nodeId: string; status: NodeStatus }[];
}

export function isInputField(field: ConfigField): field is InputConfigField {
  return field.type !== 'group';
}
