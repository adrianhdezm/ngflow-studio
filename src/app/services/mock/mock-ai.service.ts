import { createId } from '../../lib/id';
import { NODE_SIZE } from '../../lib/nodes';
import { formatReference } from '../../lib/templates';
import { WorkflowEdge, WorkflowNode } from '../../models/workflow';
import type { AiService, GeneratedWorkflow } from '../workflow.service';
import { delay } from './delay';

const GAP = NODE_SIZE + 96;

interface StepSpec {
  label: string;
  actionType: string;
  config: (prev: WorkflowNode) => Record<string, unknown>;
}

function action(id: string, x: number, y: number, spec: StepSpec, prev: WorkflowNode): WorkflowNode {
  return {
    id,
    type: 'action',
    position: { x, y },
    data: {
      label: spec.label,
      description: '',
      type: 'action',
      enabled: true,
      config: { actionType: spec.actionType, ...spec.config(prev) }
    }
  };
}

/** Picks canned steps from keywords in the prompt. */
function planSteps(prompt: string): StepSpec[] {
  const p = prompt.toLowerCase();
  const steps: StepSpec[] = [];
  if (/http|api|fetch|webhook|request/.test(p)) {
    steps.push({
      label: 'Fetch Data',
      actionType: 'HTTP Request',
      config: () => ({ httpMethod: 'GET', endpoint: 'https://api.example.com/items', httpHeaders: '{}', httpBody: '{}' })
    });
  }
  if (/database|sql|query|users/.test(p)) {
    steps.push({
      label: 'Query Users',
      actionType: 'Database Query',
      config: () => ({ dbQuery: 'SELECT id, name, email FROM users LIMIT 10;' })
    });
  }
  if (/image|picture|photo|illustrat/.test(p)) {
    steps.push({ label: 'Create Image', actionType: 'ai/generate-image', config: () => ({ model: 'imagen-fast', prompt }) });
  } else if (/summar|ai|write|generate|text|draft/.test(p) || steps.length === 0) {
    steps.push({
      label: 'Summarize',
      actionType: 'ai/generate-text',
      config: (prev) => ({
        model: 'claude-sonnet',
        format: 'text',
        prompt: `Summarize this: ${formatReference(prev.id, prev.data.label || 'Manual')}`
      })
    });
  }
  if (/if|only when|condition|check/.test(p)) {
    steps.push({ label: 'Check Result', actionType: 'Condition', config: () => ({ condition: 'true' }) });
  }
  if (/email|mail/.test(p)) {
    steps.push({
      label: 'Send Email',
      actionType: 'resend/send-email',
      config: (prev) => ({
        emailTo: 'team@example.com',
        emailSubject: 'Workflow update',
        emailBody: formatReference(prev.id, prev.data.label)
      })
    });
  }
  if (/slack|notify|message|post/.test(p) || !/email|mail/.test(p)) {
    steps.push({
      label: 'Notify Slack',
      actionType: 'slack/send-message',
      config: (prev) => ({ slackChannel: '#general', slackMessage: `New update: ${formatReference(prev.id, prev.data.label, 'text')}` })
    });
  }
  return steps;
}

function titleFromPrompt(prompt: string): string {
  const words = prompt
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  const title = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return title || 'Generated Workflow';
}

/**
 * Canned "AI": streams a plausible workflow built from keywords, one node at a time. With an
 * existing workflow, appends the new steps after its last step instead of replacing it.
 */
export class MockAiService implements AiService {
  async generateStream(
    prompt: string,
    existing: GeneratedWorkflow | null,
    onPartial: (partial: Partial<GeneratedWorkflow>) => void
  ): Promise<GeneratedWorkflow> {
    await delay(500);
    if (/\bfail\b/i.test(prompt)) {
      throw new Error('The model could not generate a workflow');
    }
    const nodes: WorkflowNode[] = existing ? [...existing.nodes] : [];
    const edges: WorkflowEdge[] = existing ? [...existing.edges] : [];
    const name = existing?.name && existing.name !== 'Untitled Workflow' ? existing.name : titleFromPrompt(prompt);

    let trigger = nodes.find((n) => n.type === 'trigger');
    if (!trigger) {
      trigger = {
        id: createId(),
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: { label: '', description: '', type: 'trigger', config: { triggerType: /webhook/i.test(prompt) ? 'Webhook' : 'Manual' } }
      };
      nodes.push(trigger);
      onPartial({ name, nodes: [...nodes], edges: [...edges] });
      await delay(350);
    }

    // Continue from the last step that has no outgoing edge, rightmost first.
    const sinks = nodes.filter((n) => !edges.some((e) => e.source === n.id));
    let prev = sinks.sort((a, b) => b.position.x - a.position.x)[0] ?? trigger;

    for (const spec of planSteps(prompt)) {
      const node = action(createId(), prev.position.x + GAP, prev.position.y, spec, prev);
      nodes.push(node);
      edges.push({ id: createId(), source: prev.id, target: node.id, type: 'animated', sourceHandle: null, targetHandle: null });
      onPartial({ name, nodes: [...nodes], edges: [...edges] });
      prev = node;
      await delay(450);
    }
    return { name, nodes, edges };
  }
}
