// Template references between steps (06-template-references.md).
// Stored inline as {{@<nodeId>:<Label>}} or {{@<nodeId>:<Label>.<field.path>}}.

import { WorkflowNode } from '../models/workflow';

export const REFERENCE_PATTERN = /\{\{@([^:}]+):([^}]*)\}\}/g;

export interface ParsedReference {
  raw: string;
  nodeId: string;
  label: string;
  field: string | null;
}

export type TemplateSegment = { kind: 'text'; text: string } | ({ kind: 'ref' } & ParsedReference);

function splitLabel(labelAndField: string): { label: string; field: string | null } {
  const dot = labelAndField.indexOf('.');
  return dot === -1 ? { label: labelAndField, field: null } : { label: labelAndField.slice(0, dot), field: labelAndField.slice(dot + 1) };
}

export function formatReference(nodeId: string, label: string, field?: string | null): string {
  return `{{@${nodeId}:${label}${field ? `.${field}` : ''}}}`;
}

export function parseReferences(value: string): ParsedReference[] {
  return [...value.matchAll(REFERENCE_PATTERN)].map((m) => ({ raw: m[0], nodeId: m[1], ...splitLabel(m[2]) }));
}

export function parseTemplate(value: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  let last = 0;
  for (const match of value.matchAll(REFERENCE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ kind: 'text', text: value.slice(last, index) });
    }
    segments.push({ kind: 'ref', raw: match[0], nodeId: match[1], ...splitLabel(match[2]) });
    last = index + match[0].length;
  }
  if (last < value.length) {
    segments.push({ kind: 'text', text: value.slice(last) });
  }
  return segments;
}

/** Rewrites the cached label of every reference to `nodeId`, recursively through objects and arrays (TPL-05). */
export function renameReferencesInValue<T>(value: T, nodeId: string, newLabel: string): T {
  if (typeof value === 'string') {
    return value.replace(REFERENCE_PATTERN, (raw, id: string, rest: string) => {
      if (id !== nodeId) {
        return raw;
      }
      const { field } = splitLabel(rest);
      return formatReference(id, newLabel, field);
    }) as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => renameReferencesInValue(v, nodeId, newLabel)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renameReferencesInValue(v, nodeId, newLabel)])) as T;
  }
  return value;
}

/** Applies a rename of `nodeId` to every other node's config. Returns the same node object when nothing changed. */
export function propagateRename(nodes: WorkflowNode[], nodeId: string, newLabel: string): WorkflowNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId || !node.data.config) {
      return node;
    }
    const config = renameReferencesInValue(node.data.config, nodeId, newLabel);
    return JSON.stringify(config) === JSON.stringify(node.data.config) ? node : { ...node, data: { ...node.data, config } };
  });
}

/** Every reference inside a config, with the top-level key it was found under. */
export function findReferencesInConfig(config: Record<string, unknown> | undefined): { key: string; reference: ParsedReference }[] {
  const found: { key: string; reference: ParsedReference }[] = [];
  const walk = (key: string, value: unknown) => {
    if (typeof value === 'string') {
      for (const reference of parseReferences(value)) {
        found.push({ key, reference });
      }
    } else if (Array.isArray(value)) {
      value.forEach((v) => walk(key, v));
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach((v) => walk(key, v));
    }
  };
  for (const [key, value] of Object.entries(config ?? {})) {
    walk(key, value);
  }
  return found;
}

/** Reads a dotted path such as `body.user.name` from a value. */
export function getPath(value: unknown, path: string | null): unknown {
  if (!path) {
    return value;
  }
  let current: unknown = value;
  for (const part of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Replaces references with values from earlier outputs, for the mock executor. */
export function resolveTemplate(value: string, outputs: Record<string, unknown>): string {
  return value.replace(REFERENCE_PATTERN, (_raw, id: string, rest: string) => {
    const resolved = getPath(outputs[id], splitLabel(rest).field);
    if (resolved === undefined) {
      return '';
    }
    return typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
  });
}

export function resolveConfig(config: Record<string, unknown>, outputs: Record<string, unknown>): Record<string, unknown> {
  const resolve = (v: unknown): unknown => {
    if (typeof v === 'string') {
      return resolveTemplate(v, outputs);
    }
    if (Array.isArray(v)) {
      return v.map(resolve);
    }
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, inner]) => [k, resolve(inner)]));
    }
    return v;
  };
  return resolve(config) as Record<string, unknown>;
}
