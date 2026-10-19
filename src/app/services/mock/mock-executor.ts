// Fake step implementations used by the mock executor. Each returns a plausible output for its
// action, or throws to simulate a failure.

import { getAction } from '../../actions/registry';
import { WorkflowNode } from '../../models/workflow';
import { getActionType, getTriggerType } from '../../lib/nodes';
import { delay } from './delay';

export class SkipBranch extends Error {
  constructor() {
    super('Condition is false');
  }
}

function parseJson(value: unknown, fallback: unknown): unknown {
  if (typeof value !== 'string' || value.trim() === '') {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Evaluates tiny expressions such as `5 > 3`, `status === 200`, `true`. No eval. */
export function evaluateCondition(expression: string): boolean {
  const trimmed = expression.trim();
  const match = /^(.+?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/.exec(trimmed);
  const literal = (raw: string): unknown => {
    const v = raw.trim().replace(/^['"]|['"]$/g, '');
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null' || v === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? v : n;
  };
  if (!match) {
    const value = literal(trimmed);
    return !!value && value !== 0;
  }
  const [, left, op, right] = match;
  const a = literal(left) as number | string;
  const b = literal(right) as number | string;
  switch (op) {
    case '===':
    case '==':
      return a === b;
    case '!==':
    case '!=':
      return a !== b;
    case '>':
      return a > b;
    case '<':
      return a < b;
    case '>=':
      return a >= b;
    case '<=':
      return a <= b;
  }
  return false;
}

function mockImage(prompt: string): string {
  const hue = [...prompt].reduce((h, c) => (h + c.charCodeAt(0) * 7) % 360, 200);
  const text = prompt.replace(/[<>&"]/g, '').slice(0, 28) || 'Generated image';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},80%,60%)"/><stop offset="1" stop-color="hsl(${(hue + 80) % 360},80%,45%)"/></linearGradient></defs><rect width="256" height="256" fill="url(#g)"/><circle cx="190" cy="70" r="34" fill="rgba(255,255,255,0.55)"/><path d="M0 200 L80 130 L140 180 L190 140 L256 200 V256 H0Z" fill="rgba(0,0,0,0.25)"/><text x="16" y="240" font-family="sans-serif" font-size="14" fill="white">${text}</text></svg>`;
  return btoa(unescape(encodeURIComponent(svg)));
}

/** Runs one node with its resolved config. `input` is what the log shows as the step's input. */
export async function runStep(node: WorkflowNode, resolvedConfig: Record<string, unknown>, startedAt: string): Promise<unknown> {
  if (node.type === 'trigger') {
    await delay(250);
    const triggerType = getTriggerType(node);
    const base = { triggeredAt: startedAt, triggerType };
    if (triggerType === 'Webhook') {
      return { ...base, body: parseJson(resolvedConfig['webhookMockRequest'], {}) };
    }
    if (triggerType === 'Schedule') {
      return { ...base, cron: resolvedConfig['scheduleCron'] ?? '' };
    }
    return base;
  }

  const actionType = getActionType(node);
  const action = getAction(actionType);
  await delay(400 + Math.round(Math.random() * 500));

  switch (actionType) {
    case 'HTTP Request': {
      const endpoint = String(resolvedConfig['endpoint'] ?? '');
      if (/fail|error|500/.test(endpoint)) {
        throw new Error(`Request to ${endpoint} failed with status 500`);
      }
      const method = String(resolvedConfig['httpMethod'] ?? 'POST');
      return {
        status: 200,
        data: { ok: true, method, url: endpoint, echo: method === 'GET' ? null : parseJson(resolvedConfig['httpBody'], {}) },
        headers: { 'content-type': 'application/json' }
      };
    }
    case 'Database Query':
      return {
        rows: [
          { id: 1, name: 'Ada Lovelace', email: 'ada@example.com' },
          { id: 2, name: 'Grace Hopper', email: 'grace@example.com' }
        ],
        count: 2
      };
    case 'Condition': {
      const result = evaluateCondition(String(resolvedConfig['condition'] ?? ''));
      if (!result) {
        throw new SkipBranch();
      }
      return { result };
    }
    case 'ai/generate-text': {
      const prompt = String(resolvedConfig['prompt'] ?? '');
      if (resolvedConfig['format'] === 'object') {
        const schema = parseJson(resolvedConfig['schema'], []) as { name: string; type: string }[];
        const object = Object.fromEntries(
          (Array.isArray(schema) ? schema : []).map((f) => [f.name, f.type === 'number' ? 42 : f.type === 'boolean' ? true : `Sample ${f.name}`])
        );
        return { object, text: JSON.stringify(object) };
      }
      return { text: `Here is a mock response to: "${prompt.slice(0, 120)}". In a real run, the model output appears here.` };
    }
    case 'ai/generate-image':
      return { base64: mockImage(String(resolvedConfig['prompt'] ?? '')), mimeType: 'image/svg+xml' };
    case 'slack/send-message': {
      const ts = `${Math.floor(Date.now() / 1000)}.000100`;
      return {
        ok: true,
        ts,
        channel: resolvedConfig['slackChannel'] ?? '#general',
        permalink: `https://acme.slack.com/archives/C024BE91L/p${ts.replace('.', '')}`
      };
    }
    case 'resend/send-email':
      return { id: crypto.randomUUID(), to: resolvedConfig['emailTo'] };
    case 'utilities/delay': {
      const seconds = Math.min(5, Math.max(0, Number(resolvedConfig['delaySeconds'] ?? 1)));
      await delay(seconds * 1000);
      return { waitedMs: seconds * 1000 };
    }
    case 'utilities/format-text':
      return { text: resolvedConfig['template'] ?? '' };
    case 'utilities/throw-error':
      throw new Error(String(resolvedConfig['errorMessage'] || 'Something went wrong'));
    default:
      if (!action) {
        throw new Error(actionType ? `Unknown action "${actionType}"` : 'No action configured for this step');
      }
      return { ok: true };
  }
}
