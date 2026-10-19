# 01 — Data Model

These shapes are what the UI reads and writes. Field names follow the reference app so imported workflows stay compatible.

## Workflow

```ts
type WorkflowVisibility = 'private' | 'public';

interface Workflow {
  id: string;
  name: string; // default "Untitled Workflow"
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  visibility: WorkflowVisibility;
  isOwner: boolean; // false means the UI is read-only (see 09)
  updatedAt: string; // ISO date
}
```

## Node

```ts
type WorkflowNodeType = 'trigger' | 'action' | 'add';
type NodeStatus = 'idle' | 'running' | 'success' | 'error';

interface WorkflowNode {
  id: string; // nanoid-style
  type: WorkflowNodeType; // also selects the canvas renderer
  position: { x: number; y: number };
  selected?: boolean;
  data: {
    label: string; // user label; '' means use the default display name
    description?: string;
    type: WorkflowNodeType;
    config?: Record<string, unknown>;
    status?: NodeStatus; // runtime only, never saved as meaningful state
    enabled?: boolean; // default true; disabled steps are skipped
  };
}
```

- **`trigger`**: exactly one per workflow, and it cannot be deleted. `config.triggerType` is one of `'Manual' | 'Schedule' | 'Webhook'` (default `'Manual'`).
  - Webhook config: `webhookSchema` (JSON string of `SchemaField[]`) and `webhookMockRequest` (a JSON string).
  - Schedule config: `scheduleCron` and `scheduleTimezone` (default `America/New_York`).
- **`action`**: `config.actionType` holds the action definition ID. An empty value means "not chosen yet". `config.integrationId` points to a saved connection when the action needs one. Every other key comes from the action's config fields.
- **`add`**: a UI-only placeholder for the empty workflow (see 02). It is never saved, and it can't be dragged or selected.

## Edge

```ts
interface WorkflowEdge {
  id: string;
  source: string; // node id
  target: string; // node id
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type: 'animated' | 'temporary';
  selected?: boolean;
}
```

Every node has at most one input handle (left) and one output handle (right). Triggers have no input handle.

## Action definitions (registry)

The UI is driven by a registry of action definitions, so new actions need no new UI code.

```ts
interface ActionDefinition {
  id: string; // e.g. 'slack/send-message'; system actions use their label ('HTTP Request')
  label: string; // 'Send Slack Message'
  description: string;
  category: string; // group name in the picker: 'System', 'Slack', ...
  integration?: string; // connection type required, e.g. 'slack'
  icon?: string; // icon key or URL
  configFields: ConfigField[];
  outputFields?: { field: string; description: string }[]; // used by template autocomplete (06)
  outputDisplay?: { type: 'image' | 'video' | 'url'; field: string }; // used by the run output preview (07)
}

type ConfigField =
  | {
      key: string;
      label: string;
      type: 'template-input' | 'template-textarea' | 'text' | 'number' | 'select' | 'schema-builder';
      placeholder?: string;
      defaultValue?: string;
      options?: { value: string; label: string }[]; // select only
      rows?: number; // textarea only
      min?: number; // number only
      required?: boolean;
      showWhen?: { field: string; equals: string };
    }
  | { label: string; type: 'group'; fields: ConfigField[]; defaultExpanded?: boolean };
```

**System actions** are built in and always shown first:

| ID               | Category | Needs connection | Config                                              |
| ---------------- | -------- | ---------------- | --------------------------------------------------- |
| `HTTP Request`   | System   | no               | `httpMethod`, `endpoint`, `httpHeaders`, `httpBody` |
| `Database Query` | System   | yes (`database`) | `dbQuery`, `dbSchema`                               |
| `Condition`      | System   | no               | `condition`                                         |

## Schema field (schema builder)

```ts
interface SchemaField {
  id?: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  itemType?: 'string' | 'number' | 'boolean' | 'object'; // when type = array
  fields?: SchemaField[]; // when object, or array of object
  description?: string;
}
```

## Connections (integrations)

```ts
interface Connection {
  id: string;
  type: string;
  name: string;
}
```

## Executions

```ts
type ExecutionStatus = 'pending' | 'running' | 'success' | 'error';

interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  duration?: string; // milliseconds, stored as a string
}

interface ExecutionLog {
  id: string;
  executionId: string;
  nodeId: string;
  nodeName: string;
  nodeType: string; // actionType or trigger type
  status: ExecutionStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt: string;
  duration?: string; // ms
}
```

## Service interface the UI depends on

```ts
interface WorkflowService {
  list(): Promise<Pick<Workflow, 'id' | 'name' | 'updatedAt'>[]>;
  get(id: string): Promise<Workflow>; // rejects with NotFound
  create(input: { name: string; description?: string; nodes; edges }): Promise<Workflow>;
  update(id: string, patch: Partial<Pick<Workflow, 'name' | 'nodes' | 'edges' | 'visibility'>>): Promise<void>;
  delete(id: string): Promise<void>;
  duplicate(id: string): Promise<Workflow>;

  execute(id: string, input?: unknown): Promise<{ executionId: string }>;
  getExecutionStatus(executionId: string): Promise<{ status: ExecutionStatus; nodeStatuses: { nodeId: string; status: NodeStatus }[] }>;
  listExecutions(workflowId: string): Promise<WorkflowExecution[]>; // newest first
  getExecutionLogs(executionId: string): Promise<ExecutionLog[]>;
  deleteExecutions(workflowId: string): Promise<void>;

  exportCode(id: string): Promise<Record<string, string>>; // path -> file content (P2)
}

interface ConnectionService {
  list(): Promise<Connection[]>;
}
```

**DM-01 (P0):** The UI must reach persistence and execution only through these interfaces, so a mock implementation can be swapped for a real backend.
