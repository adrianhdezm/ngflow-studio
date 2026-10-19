// Code generation for the Code tab and the export (PP-20, TB-07). Pure functions; the output is
// illustrative TypeScript that mirrors the workflow, not a runnable server project.

import { getAction } from '../actions/registry';
import { getRunOrder, toGraph } from '../graph';
import { WorkflowEdge, WorkflowNode } from '../models/workflow';
import { camelCase, slugify } from './format';
import { getActionType, getNodeDisplayName, getTriggerType, isEnabled } from './nodes';
import { REFERENCE_PATTERN } from './templates';

export interface GeneratedFile {
  filename: string;
  language: 'typescript' | 'json';
  code: string;
}

function stepFunctionName(node: WorkflowNode): string {
  return `${camelCase(getNodeDisplayName(node))}Step`;
}

/** Turns `{{@id:Label.field}}` into a `${outputs.label.field}` expression inside a template literal. */
function templateToExpression(value: unknown, varNames: Map<string, string>): string {
  if (typeof value !== 'string') {
    return JSON.stringify(value ?? null);
  }
  if (!value.match(REFERENCE_PATTERN)) {
    return JSON.stringify(value);
  }
  const body = value.replace(/`/g, '\\`').replace(REFERENCE_PATTERN, (_raw, id: string, rest: string) => {
    const dot = rest.indexOf('.');
    const field = dot === -1 ? '' : `.${rest.slice(dot + 1)}`;
    return `\${${varNames.get(id) ?? 'undefined'}${field ? `?${field.replace(/\./g, '?.').slice(1)}` : ''}}`;
  });
  return `\`${body}\``;
}

function configObject(node: WorkflowNode, varNames: Map<string, string>, indent: string): string {
  const { actionType: _actionType, integrationId: _integrationId, ...config } = node.data.config ?? {};
  const entries = Object.entries(config).filter(([, v]) => v !== '' && v !== undefined);
  if (entries.length === 0) {
    return '{}';
  }
  return `{\n${entries.map(([k, v]) => `${indent}  ${k}: ${templateToExpression(v, varNames)}`).join(',\n')}\n${indent}}`;
}

export function generateNodeCode(node: WorkflowNode): GeneratedFile | null {
  if (node.type === 'trigger') {
    const triggerType = getTriggerType(node);
    const config = node.data.config ?? {};
    if (triggerType === 'Schedule') {
      return {
        filename: 'vercel.json',
        language: 'json',
        code: JSON.stringify({ crons: [{ path: '/api/workflows/run', schedule: config['scheduleCron'] || '0 9 * * *' }] }, null, 2)
      };
    }
    if (triggerType === 'Webhook') {
      return {
        filename: 'app/api/workflows/webhook/route.ts',
        language: 'typescript',
        code: [
          `import { start } from 'workflow/api';`,
          `import { workflow } from '@/workflows';`,
          '',
          'export async function POST(request: Request) {',
          '  const body = await request.json();',
          '  const run = await start(workflow, [{ body, triggeredAt: new Date().toISOString() }]);',
          '  return Response.json({ runId: run.id });',
          '}',
          ''
        ].join('\n')
      };
    }
    return null;
  }
  const actionType = getActionType(node);
  if (!actionType || actionType === 'Condition') {
    return null;
  }
  const action = getAction(actionType);
  const fn = stepFunctionName(node);
  const params = Object.keys(node.data.config ?? {}).filter((k) => k !== 'actionType' && k !== 'integrationId');
  return {
    filename: `steps/${slugify(action?.label ?? actionType)}-step.ts`,
    language: 'typescript',
    code: [
      `// ${action?.label ?? actionType}: ${action?.description ?? ''}`,
      `export async function ${fn}(input: {`,
      ...params.map((p) => `  ${p}?: unknown;`),
      '}) {',
      `  'use step';`,
      `  // Calls the ${action?.category ?? 'external'} API with the resolved input.`,
      `  const response = await fetch('https://api.example.com/${slugify(actionType)}', {`,
      `    method: 'POST',`,
      `    headers: { 'Content-Type': 'application/json' },`,
      `    body: JSON.stringify(input)`,
      '  });',
      '  return response.json();',
      '}',
      ''
    ].join('\n')
  };
}

export function generateWorkflowCode(nodes: WorkflowNode[], edges: WorkflowEdge[], opts: { name: string }): GeneratedFile {
  const real = nodes.filter((n) => n.type !== 'add' && isEnabled(n));
  const order = getRunOrder(toGraph(real, edges)) ?? real.map((n) => n.id);
  const byId = new Map(real.map((n) => [n.id, n]));
  const varNames = new Map<string, string>();
  const used = new Set<string>();
  for (const id of order) {
    const node = byId.get(id);
    if (!node) {
      continue;
    }
    let name = camelCase(getNodeDisplayName(node));
    while (used.has(name)) {
      name = `${name}2`;
    }
    used.add(name);
    varNames.set(id, node.type === 'trigger' ? 'trigger' : name);
  }

  const imports = new Set<string>();
  const body: string[] = [];
  for (const id of order) {
    const node = byId.get(id);
    if (!node || node.type === 'trigger') {
      continue;
    }
    const actionType = getActionType(node);
    const varName = varNames.get(id)!;
    if (!actionType) {
      body.push(`  // ${getNodeDisplayName(node)}: no action configured`);
      continue;
    }
    if (actionType === 'Condition') {
      body.push(`  if (!(${templateToExpression(node.data.config?.['condition'], varNames).replace(/^`|`$/g, '')})) {`, '    return;', '  }');
      continue;
    }
    const fn = stepFunctionName(node);
    imports.add(`import { ${fn} } from './steps/${slugify(getAction(actionType)?.label ?? actionType)}-step';`);
    body.push(`  const ${varName} = await ${fn}(${configObject(node, varNames, '  ')});`);
  }

  const fnName = `${camelCase(opts.name || 'Untitled Workflow')}Workflow`;
  const code = [
    ...imports,
    imports.size ? '' : null,
    `export async function ${fnName}(trigger: { triggeredAt: string; body?: unknown }) {`,
    `  'use workflow';`,
    ...body,
    '}',
    ''
  ]
    .filter((l) => l !== null)
    .join('\n');
  return { filename: `workflows/${slugify(opts.name || 'workflow')}.ts`, language: 'typescript', code };
}

/** Every file of the export, path → content. */
export function generateExportFiles(nodes: WorkflowNode[], edges: WorkflowEdge[], opts: { name: string }): Record<string, string> {
  const files: Record<string, string> = {};
  const workflow = generateWorkflowCode(nodes, edges, opts);
  files[workflow.filename] = workflow.code;
  for (const node of nodes) {
    const file = generateNodeCode(node);
    if (file) {
      files[file.filename] = file.code;
    }
  }
  files['README.md'] = `# ${opts.name}\n\nExported from ngflow studio. Experimental: review the generated code before using it.\n`;
  return files;
}
