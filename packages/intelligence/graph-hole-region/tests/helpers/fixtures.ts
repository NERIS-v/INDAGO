// ============================================================================
// Shared test fixtures + deterministic UUID helper.
//
// Region identity is validated against the frozen contract schema, so every
// id used in a graph hole region (case, graph version, node, edge,
// observation) must be a UUID. The helper builds stable version-4 UUIDs from
// a small integer so fixtures are deterministic across runs.
// ============================================================================

import type { GraphProjectionInput, GraphNode, GraphEdge } from '@indago/graphology-projection';

const HEX = '0123456789abcdef';

export function uuid(n: number): string {
  const hex = n.toString(16).padStart(32, '0');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

export const CASE_A = uuid(0x0000ff01);
export const CASE_B = uuid(0x0000ff02);
export const VERSION_A = uuid(0x0000aa01);
export const VERSION_B = uuid(0x0000aa02);

export const NODE_CENTER = uuid(0x00000001);
export const NODE_LEAF_A = uuid(0x00000002);
export const NODE_LEAF_B = uuid(0x00000003);
export const NODE_LEAF_C = uuid(0x00000004);

export const EDGE_A = uuid(0x10000001);
export const EDGE_B = uuid(0x10000002);
export const EDGE_C = uuid(0x10000003);

export const OBS_1 = uuid(0x20000001);
export const OBS_2 = uuid(0x20000002);

export const ENT_UNKNOWN_CASE = uuid(0x30000001);

export function node(id: string, name: string): GraphNode {
  return { id, entityType: 'PERSON', canonicalName: name };
}

export function edge(
  id: string,
  source: string,
  target: string,
  relationType = 'communication',
): GraphEdge {
  return { id, relationType, source, target, provenance: {} };
}

/** Star graph: center connected to the given leaf ids (one edge each). */
export function starProjection(
  caseId: string,
  leaves: readonly string[],
  edgeIds?: readonly string[],
): GraphProjectionInput {
  const nodes: GraphNode[] = [node(NODE_CENTER, 'Center')];
  const edges: GraphEdge[] = [];
  leaves.forEach((leaf, index) => {
    nodes.push(node(leaf, `Leaf-${index}`));
    edges.push(
      edge(edgeIds?.[index] ?? uuid(0x10000000 + index), NODE_CENTER, leaf),
    );
  });
  return { caseId, nodes, edges };
}

export function resolverFor(
  seedById: Record<string, { entityIds: readonly string[] }>,
): (ids: readonly string[]) => Promise<Array<{ id: string; entityIds: readonly string[] }>> {
  return async (ids) =>
    ids
      .filter((id) => seedById[id] != null)
      .map((id) => ({ id, entityIds: [...seedById[id].entityIds] }));
}