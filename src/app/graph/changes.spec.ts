import { applyEdgeChanges, applyNodeChanges, getSelectChanges, resolveConnection } from './changes';
import { HandleBounds } from './types';

const nodes = [
  { id: 'a', position: { x: 0, y: 0 }, selected: false },
  { id: 'b', position: { x: 10, y: 10 }, selected: true },
  { id: 'c', position: { x: 20, y: 20 } }
];
const edges = [
  { id: 'e1', source: 'a', target: 'b' },
  { id: 'e2', source: 'b', target: 'c', selected: true }
];

describe('applyNodeChanges', () => {
  it('applies position, select, dimensions and remove without mutating', () => {
    const snapshot = structuredClone(nodes);
    const result = applyNodeChanges(
      [
        { type: 'position', id: 'a', position: { x: 5, y: 6 }, dragging: false },
        { type: 'select', id: 'a', selected: true },
        { type: 'dimensions', id: 'c', width: 192, height: 192 },
        { type: 'remove', id: 'b' }
      ],
      nodes
    );
    expect(result.map((n) => n.id)).toEqual(['a', 'c']);
    expect(result[0]).toMatchObject({ position: { x: 5, y: 6 }, selected: true });
    expect(result[1]).toMatchObject({ width: 192, height: 192 });
    expect(nodes).toEqual(snapshot);
  });

  it('keeps the identity of untouched nodes', () => {
    const result = applyNodeChanges([{ type: 'select', id: 'a', selected: true }], nodes);
    expect(result[1]).toBe(nodes[1]);
    expect(result[0]).not.toBe(nodes[0]);
  });

  it('returns the same array for no changes', () => {
    expect(applyNodeChanges([], nodes)).toBe(nodes);
  });
});

describe('applyEdgeChanges', () => {
  it('applies select and remove', () => {
    const result = applyEdgeChanges(
      [
        { type: 'select', id: 'e1', selected: true },
        { type: 'remove', id: 'e2' }
      ],
      edges
    );
    expect(result).toEqual([{ id: 'e1', source: 'a', target: 'b', selected: true }]);
    expect(edges[0]).not.toHaveProperty('selected');
  });
});

describe('getSelectChanges', () => {
  it('emits only the changes needed for the requested selection', () => {
    const { nodeChanges, edgeChanges } = getSelectChanges(nodes, edges, ['a'], []);
    expect(nodeChanges).toEqual([
      { type: 'select', id: 'a', selected: true },
      { type: 'select', id: 'b', selected: false }
    ]);
    expect(edgeChanges).toEqual([{ type: 'select', id: 'e2', selected: false }]);
  });
});

describe('resolveConnection', () => {
  const handles: Record<string, HandleBounds[]> = {
    trigger: [{ id: null, type: 'source', position: 'right', x: 0, y: 0, width: 1, height: 1 }],
    action: [
      { id: null, type: 'target', position: 'left', x: 0, y: 0, width: 1, height: 1 },
      { id: null, type: 'source', position: 'right', x: 0, y: 0, width: 1, height: 1 }
    ],
    other: [
      { id: 'in', type: 'target', position: 'left', x: 0, y: 0, width: 1, height: 1 },
      { id: 'out', type: 'source', position: 'right', x: 0, y: 0, width: 1, height: 1 }
    ]
  };
  const getHandles = (id: string) => handles[id] ?? [];
  const fromSource = { nodeId: 'trigger', handleId: null, handleType: 'source' as const };

  it('connects a source handle to a target handle', () => {
    expect(resolveConnection(fromSource, { kind: 'handle', nodeId: 'action', handleId: null, handleType: 'target' }, getHandles)).toEqual({
      source: 'trigger',
      sourceHandle: null,
      target: 'action',
      targetHandle: null
    });
  });

  it('rejects source to source (strict mode)', () => {
    expect(
      resolveConnection(fromSource, { kind: 'handle', nodeId: 'action', handleId: null, handleType: 'source' }, getHandles)
    ).toBeNull();
  });

  it('rejects self-connections', () => {
    const from = { nodeId: 'action', handleId: null, handleType: 'source' as const };
    expect(resolveConnection(from, { kind: 'handle', nodeId: 'action', handleId: null, handleType: 'target' }, getHandles)).toBeNull();
    expect(resolveConnection(from, { kind: 'node', nodeId: 'action' }, getHandles)).toBeNull();
  });

  it('connects to a node body through its matching handle', () => {
    expect(resolveConnection(fromSource, { kind: 'node', nodeId: 'other' }, getHandles)).toMatchObject({
      target: 'other',
      targetHandle: 'in'
    });
  });

  it('does nothing when the node has no matching handle (e.g. a trigger has no input)', () => {
    const from = { nodeId: 'action', handleId: null, handleType: 'source' as const };
    expect(resolveConnection(from, { kind: 'node', nodeId: 'trigger' }, getHandles)).toBeNull();
  });

  it('reverses direction when dragging from an input', () => {
    const from = { nodeId: 'action', handleId: null, handleType: 'target' as const };
    expect(resolveConnection(from, { kind: 'node', nodeId: 'trigger' }, getHandles)).toEqual({
      source: 'trigger',
      sourceHandle: null,
      target: 'action',
      targetHandle: null
    });
  });

  it('honors isValidConnection', () => {
    expect(resolveConnection(fromSource, { kind: 'node', nodeId: 'action' }, getHandles, () => false)).toBeNull();
  });

  it('ignores drops on the pane', () => {
    expect(resolveConnection(fromSource, { kind: 'pane' }, getHandles)).toBeNull();
  });
});
