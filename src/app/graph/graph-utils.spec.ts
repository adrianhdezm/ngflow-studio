import {
  findCycle,
  getConnectedEdgeIds,
  getRunOrder,
  getUnreachableNodeIds,
  getUpstreamNodeIds,
  toGraph,
  wouldCreateCycle
} from './graph-utils';

const node = (id: string) => ({ id, position: { x: 0, y: 0 } });
const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });

describe('graph utils', () => {
  const nodes = ['t', 'a', 'b', 'c', 'x'].map(node);
  const edges = [edge('t', 'a'), edge('a', 'b'), edge('t', 'c'), edge('c', 'b')];

  it('memoizes the adapter on array identity', () => {
    expect(toGraph(nodes, edges)).toBe(toGraph(nodes, edges));
    expect(toGraph(nodes, [...edges])).not.toBe(toGraph(nodes, edges));
  });

  it('maps fields onto the library model', () => {
    const graph = toGraph([{ id: 'n', position: { x: 3, y: 4 }, width: 10, height: 20 }], []);
    expect(graph.nodes[0]).toMatchObject({ id: 'n', x: 3, y: 4, width: 10, height: 20 });
  });

  it('finds transitive upstream nodes', () => {
    expect(getUpstreamNodeIds(toGraph(nodes, edges), 'b').sort()).toEqual(['a', 'c', 't']);
    expect(getUpstreamNodeIds(toGraph(nodes, edges), 't')).toEqual([]);
  });

  it('detects connections that would create a cycle', () => {
    const graph = toGraph(nodes, edges);
    expect(wouldCreateCycle(graph, 'b', 't')).toBe(true);
    expect(wouldCreateCycle(graph, 'a', 'a')).toBe(true);
    expect(wouldCreateCycle(graph, 'a', 'c')).toBe(false);
  });

  it('orders nodes topologically', () => {
    const order = getRunOrder(toGraph(nodes, edges))!;
    expect(order.indexOf('t')).toBeLessThan(order.indexOf('a'));
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('b'));
  });

  it('reports cycles', () => {
    const cyclic = toGraph(nodes, [...edges, edge('b', 't')]);
    expect(getRunOrder(cyclic)).toBeNull();
    expect(findCycle(cyclic)).toContain('t');
    expect(findCycle(toGraph(nodes, edges))).toBeNull();
  });

  it('lists edges attached to a node and unreachable nodes', () => {
    const graph = toGraph(nodes, edges);
    expect(getConnectedEdgeIds(graph, 'b').sort()).toEqual(['a-b', 'c-b']);
    expect(getUnreachableNodeIds(graph, ['t'])).toEqual(['x']);
  });

  it('ignores dangling edges', () => {
    expect(toGraph(nodes, [edge('t', 'missing')]).edges).toEqual([]);
  });
});
