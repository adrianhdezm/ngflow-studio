// Built-in action registry: the three system actions plus a few fake integrations that the mock
// executor knows how to "run". New actions only need an entry here; the UI is driven by this data.

import { ActionDefinition, ConfigField, InputConfigField, OutputField, isInputField } from '../models/workflow';

export interface IntegrationDefinition {
  type: string;
  label: string;
  icon: string;
  /** Fields of the add-connection form. */
  credentialFields: { key: string; label: string; placeholder?: string }[];
}

export const SYSTEM_CATEGORY = 'System';

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    type: 'database',
    label: 'Database',
    icon: 'database',
    credentialFields: [{ key: 'url', label: 'DATABASE_URL', placeholder: 'postgres://user:password@host:5432/db' }]
  },
  { type: 'slack', label: 'Slack', icon: 'slack', credentialFields: [{ key: 'token', label: 'Bot Token', placeholder: 'xoxb-...' }] },
  { type: 'resend', label: 'Resend', icon: 'resend', credentialFields: [{ key: 'apiKey', label: 'API Key', placeholder: 're_...' }] }
];

const AI_MODELS = [
  { value: 'claude-sonnet', label: 'Claude Sonnet' },
  { value: 'claude-haiku', label: 'Claude Haiku' },
  { value: 'gpt-mini', label: 'GPT Mini' }
];

const IMAGE_MODELS = [
  { value: 'imagen-fast', label: 'Imagen Fast' },
  { value: 'flux-pro', label: 'Flux Pro' }
];

function modelLabel(options: { value: string; label: string }[], fallback: string) {
  return (config: Record<string, unknown>) => options.find((o) => o.value === (config['model'] ?? fallback))?.label;
}

export const ACTIONS: ActionDefinition[] = [
  // ---------------------------------------------------------------- System
  {
    id: 'HTTP Request',
    label: 'HTTP Request',
    description: 'Make an HTTP request to any API',
    category: SYSTEM_CATEGORY,
    icon: 'http',
    configFields: [
      {
        key: 'httpMethod',
        label: 'Method',
        type: 'select',
        defaultValue: 'POST',
        options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m }))
      },
      { key: 'endpoint', label: 'URL', type: 'template-input', required: true },
      { key: 'httpHeaders', label: 'Headers (JSON)', type: 'text', defaultValue: '{}' },
      { key: 'httpBody', label: 'Body (JSON)', type: 'text', defaultValue: '{}' }
    ],
    outputFields: [
      { field: 'status', description: 'HTTP status code' },
      { field: 'data', description: 'Parsed response body' },
      { field: 'headers', description: 'Response headers' }
    ]
  },
  {
    id: 'Database Query',
    label: 'Database Query',
    description: 'Run a SQL query against your database',
    category: SYSTEM_CATEGORY,
    integration: 'database',
    icon: 'database',
    configFields: [
      { key: 'dbQuery', label: 'SQL Query', type: 'text', required: true },
      { key: 'dbSchema', label: 'Schema', type: 'schema-builder' }
    ],
    outputFields: [
      { field: 'rows', description: 'Returned rows' },
      { field: 'count', description: 'Number of rows' }
    ]
  },
  {
    id: 'Condition',
    label: 'Condition',
    description: 'Continue only when an expression is true',
    category: SYSTEM_CATEGORY,
    icon: 'condition',
    configFields: [{ key: 'condition', label: 'Condition Expression', type: 'template-input', required: true }],
    outputFields: [{ field: 'result', description: 'Whether the condition passed' }]
  },

  // ---------------------------------------------------------------- AI
  {
    id: 'ai/generate-text',
    label: 'Generate Text',
    description: 'Generate text or structured data with an AI model',
    category: 'AI',
    icon: 'ai',
    modelLabel: modelLabel(AI_MODELS, 'claude-sonnet'),
    configFields: [
      { key: 'model', label: 'Model', type: 'select', options: AI_MODELS, defaultValue: 'claude-sonnet' },
      { key: 'prompt', label: 'Prompt', type: 'template-textarea', rows: 4, required: true, placeholder: 'Summarize {{Trigger.body}}' },
      {
        key: 'format',
        label: 'Output Format',
        type: 'select',
        defaultValue: 'text',
        options: [
          { value: 'text', label: 'Text' },
          { value: 'object', label: 'Object' }
        ]
      },
      { key: 'schema', label: 'Schema', type: 'schema-builder', showWhen: { field: 'format', equals: 'object' } },
      {
        label: 'Advanced',
        type: 'group',
        defaultExpanded: false,
        fields: [
          { key: 'temperature', label: 'Temperature', type: 'number', min: 0, defaultValue: '0.7' },
          { key: 'system', label: 'System Prompt', type: 'template-textarea', rows: 3 }
        ]
      }
    ],
    outputFields: [
      { field: 'text', description: 'Generated text' },
      { field: 'object', description: 'Structured output (Object format)' }
    ]
  },
  {
    id: 'ai/generate-image',
    label: 'Generate Image',
    description: 'Create an image from a prompt',
    category: 'AI',
    icon: 'image',
    modelLabel: modelLabel(IMAGE_MODELS, 'imagen-fast'),
    configFields: [
      { key: 'model', label: 'Model', type: 'select', options: IMAGE_MODELS, defaultValue: 'imagen-fast' },
      { key: 'prompt', label: 'Prompt', type: 'template-textarea', rows: 3, required: true, placeholder: 'A watercolor fox' }
    ],
    outputFields: [
      { field: 'base64', description: 'Image data (base64)' },
      { field: 'mimeType', description: 'Image type' }
    ],
    outputDisplay: { type: 'image', field: 'base64' }
  },

  // ---------------------------------------------------------------- Slack
  {
    id: 'slack/send-message',
    label: 'Send Slack Message',
    description: 'Post a message to a Slack channel',
    category: 'Slack',
    integration: 'slack',
    icon: 'slack',
    configFields: [
      { key: 'slackChannel', label: 'Channel', type: 'text', required: true, placeholder: '#general' },
      { key: 'slackMessage', label: 'Message', type: 'template-textarea', rows: 4, required: true, placeholder: 'Hello from {{Trigger.name}}' }
    ],
    outputFields: [
      { field: 'ts', description: 'Message timestamp' },
      { field: 'channel', description: 'Channel id' },
      { field: 'permalink', description: 'Link to the message' }
    ],
    outputDisplay: { type: 'url', field: 'permalink' }
  },

  // ---------------------------------------------------------------- Resend
  {
    id: 'resend/send-email',
    label: 'Send Email',
    description: 'Send a transactional email',
    category: 'Resend',
    integration: 'resend',
    icon: 'resend',
    configFields: [
      { key: 'emailTo', label: 'To', type: 'template-input', required: true, placeholder: 'user@example.com' },
      { key: 'emailSubject', label: 'Subject', type: 'template-input', required: true },
      { key: 'emailBody', label: 'Body', type: 'template-textarea', rows: 5 },
      {
        label: 'Options',
        type: 'group',
        fields: [
          { key: 'emailFrom', label: 'From', type: 'text', placeholder: 'onboarding@resend.dev' },
          { key: 'emailReplyTo', label: 'Reply To', type: 'text' }
        ]
      }
    ],
    outputFields: [{ field: 'id', description: 'Email id' }]
  },

  // ---------------------------------------------------------------- Utilities
  {
    id: 'utilities/delay',
    label: 'Delay',
    description: 'Wait before continuing',
    category: 'Utilities',
    icon: 'delay',
    configFields: [{ key: 'delaySeconds', label: 'Seconds', type: 'number', min: 0, defaultValue: '1', required: true }],
    outputFields: [{ field: 'waitedMs', description: 'How long the step waited' }]
  },
  {
    id: 'utilities/format-text',
    label: 'Format Text',
    description: 'Build a string from previous outputs',
    category: 'Utilities',
    icon: 'text',
    configFields: [{ key: 'template', label: 'Template', type: 'template-textarea', rows: 4, required: true }],
    outputFields: [{ field: 'text', description: 'Formatted text' }]
  },
  {
    id: 'utilities/throw-error',
    label: 'Throw Error',
    description: 'Always fails; useful for testing error handling',
    category: 'Utilities',
    icon: 'error',
    configFields: [{ key: 'errorMessage', label: 'Error Message', type: 'text', placeholder: 'Something went wrong' }]
  }
];

const ACTIONS_BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

export function getAction(id: unknown): ActionDefinition | undefined {
  return typeof id === 'string' ? ACTIONS_BY_ID.get(id) : undefined;
}

export function getIntegration(type: string | undefined): IntegrationDefinition | undefined {
  return INTEGRATIONS.find((i) => i.type === type);
}

/** Categories in picker order: System first, then alphabetical. */
export function getCategories(actions: ActionDefinition[] = ACTIONS): string[] {
  const categories = [...new Set(actions.map((a) => a.category))];
  return categories.sort((a, b) => (a === SYSTEM_CATEGORY ? -1 : b === SYSTEM_CATEGORY ? 1 : a.localeCompare(b)));
}

/** Every input field of an action, flattening groups. */
export function flattenFields(fields: ConfigField[]): InputConfigField[] {
  return fields.flatMap((f) => (isInputField(f) ? [f] : flattenFields(f.fields)));
}

export function isFieldVisible(field: InputConfigField, config: Record<string, unknown>, allFields: InputConfigField[]): boolean {
  if (!field.showWhen) {
    return true;
  }
  const controller = allFields.find((f) => f.key === field.showWhen!.field);
  const value = config[field.showWhen.field] ?? controller?.defaultValue;
  return value === field.showWhen.equals;
}

/** Built-in output fields of triggers, for template autocomplete. */
export function getTriggerOutputFields(config: Record<string, unknown> | undefined): OutputField[] {
  const triggerType = (config?.['triggerType'] as string) ?? 'Manual';
  const base: OutputField[] = [{ field: 'triggeredAt', description: 'When the run started' }];
  if (triggerType === 'Webhook') {
    const fields: OutputField[] = [{ field: 'body', description: 'Request body' }, ...base];
    try {
      const schema = JSON.parse((config?.['webhookSchema'] as string) || '[]') as { name: string; description?: string }[];
      for (const f of schema) {
        if (f.name) {
          fields.push({ field: `body.${f.name}`, description: f.description ?? '' });
        }
      }
    } catch {
      // Invalid schema JSON: just offer the defaults.
    }
    return fields;
  }
  if (triggerType === 'Schedule') {
    return [...base, { field: 'cron', description: 'Cron expression' }];
  }
  return base;
}
