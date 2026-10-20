import { formatReference, parseTemplate, propagateRename, resolveTemplate } from './templates';
import { WorkflowNode } from '../models/workflow';

describe('template references', () => {
  it('formats and parses references', () => {
    const ref = formatReference('n1', 'Fetch', 'data.items');
    expect(ref).toBe('{{@n1:Fetch.data.items}}');
    expect(parseTemplate(`Hi ${ref}!`)).toEqual([
      { kind: 'text', text: 'Hi ' },
      { kind: 'ref', raw: ref, nodeId: 'n1', label: 'Fetch', field: 'data.items' },
      { kind: 'text', text: '!' }
    ]);
  });

  it('rewrites labels only for the renamed node, including nested values', () => {
    const node = (id: string, config: Record<string, unknown>): WorkflowNode => ({
      id,
      type: 'action',
      position: { x: 0, y: 0 },
      data: { label: '', type: 'action', config }
    });
    const nodes = [node('a', {}), node('b', { x: '{{@a:Old.f}} {{@c:Old}}', nested: { list: ['{{@a:Old}}'] } })];
    const result = propagateRename(nodes, 'a', 'New');
    expect(result[1].data.config).toEqual({ x: '{{@a:New.f}} {{@c:Old}}', nested: { list: ['{{@a:New}}'] } });
    expect(result[0]).toBe(nodes[0]);
  });

  it('resolves references against outputs', () => {
    expect(resolveTemplate('id={{@a:A.user.id}} all={{@a:A}}', { a: { user: { id: 7 } } })).toBe('id=7 all={"user":{"id":7}}');
    expect(resolveTemplate('{{@missing:X.y}}', {})).toBe('');
  });
});
