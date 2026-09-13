// ============================================================================
// Detection context builder (Phase 5A-PR4)
//
// PURE normalization of the closed detection input into the graph the
// detectors share. Scope is enforced BY the region: nodes/edges outside
// `region.nodeIds` / `region.edgeIds` are excluded, never invented.
//
// The hypothesis context (PR3) is consumed as-is when already built, or built
// from the authoritative relation/entity hypotheses. Detectors never fetch
// persistence — everything they may reference must already be inside the
// supplied scope, and every observation id they could probe MUST resolve to a
// source id (else we refuse to run rather than fabricate).
// ============================================================================

import { buildHypothesisContext } from '@indago/hypothesis-context';
import { GraphHoleDetectionError } from './types.js';
import { sortedUnique } from './determinism.js';
import type { DetectionInput, GraphHoleDetectionContext } from './types.js';

export function buildDetectionContext(input: DetectionInput): GraphHoleDetectionContext {
  assertScope(input);

  const nodeIds = new Set(regionNodeIds(input));
  const nodesInScope = new Map<string, (typeof input.nodes)[number]>();
  for (const node of input.nodes) {
    if (nodeIds.has(node.id) && !nodesInScope.has(node.id)) nodesInScope.set(node.id, node);
  }
  const nodes = [...nodesInScope.keys()].sort().map((id) => nodesInScope.get(id)!);

  const edgeIds = new Set(regionEdgeIds(input));
  const edgesInScope = new Map<string, (typeof input.edges)[number]>();
  for (const edge of input.edges) {
    if (
      edgeIds.has(edge.id) &&
      nodeIds.has(edge.sourceNodeId) &&
      nodeIds.has(edge.targetNodeId) &&
      edge.sourceNodeId !== edge.targetNodeId &&
      !edgesInScope.has(edge.id)
    ) {
      edgesInScope.set(edge.id, edge);
    }
  }
  const edges = [...edgesInScope.keys()].sort().map((id) => edgesInScope.get(id)!);

  const nodeById = new Map(input.nodes.filter((n) => nodeIds.has(n.id)).map((n) => [n.id, n]));
  const edgeById = new Map(edges.map((e) => [e.id, e]));

  // Deterministic incident-edge + neighbor indices (region scope).
  const edgesByNode = new Map<string, string[]>();
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const from = edge.sourceNodeId;
    const to = edge.targetNodeId;
    for (const [incidentNode, other] of [
      [from, to],
      [to, from],
    ] as const) {
      const incident = edgesByNode.get(incidentNode) ?? [];
      incident.push(edge.id);
      edgesByNode.set(incidentNode, incident);
      const neighbors = adjacency.get(incidentNode) ?? [];
      neighbors.push(other);
      adjacency.set(incidentNode, neighbors);
    }
  }
  for (const [nodeId, list] of edgesByNode) edgesByNode.set(nodeId, sortedUnique(list));
  for (const [nodeId, list] of adjacency) adjacency.set(nodeId, sortedUnique(list));

  const hypothesisContext =
    input.hypothesisContext ??
    buildHypothesisContext({
      caseId: input.caseId,
      graphVersionId: input.graphVersionId,
      relationHypotheses: input.relationHypotheses,
      entityHypotheses: input.entityHypotheses,
    });

  if (hypothesisContext.caseId !== input.caseId) {
    throw new GraphHoleDetectionError(
      'AUTHORITY_MISMATCH',
      `hypothesis context belongs to case ${hypothesisContext.caseId}, input is case ${input.caseId}`,
    );
  }

  const observations = sortedUnique(input.observations.map((o) => o.id)).map((id) => {
    const obs = input.observations.find((o) => o.id === id);
    return obs!;
  });
  const sourceByObservationId = new Map(input.observations.map((o) => [o.id, o.sourceId]));

  // Closed world: every observation id the detectors could probe must resolve
  // to a source id. Refuse to run rather than fabricate provenance.
  for (const atomic of hypothesisContext.atomic) {
    for (const id of [...atomic.supportingObservations, ...atomic.contradictingObservations]) {
      if (!sourceByObservationId.has(id)) {
        throw new GraphHoleDetectionError(
          'MISSING_OBSERVATION_SOURCE',
          `observation ${id} referenced by ${atomic.derivedId} has no source record in the detection input`,
        );
      }
    }
  }

  const communities =
    input.communities === undefined || input.communities === null
      ? null
      : new Map(
          [...input.communities.entries()]
            .filter(([nodeId]) => nodeIds.has(nodeId))
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        );

  return {
    caseId: input.caseId,
    graphVersionId: input.graphVersionId,
    temporalContext: input.temporalContext,
    region: input.region,
    nodes,
    edges,
    nodeById,
    edgeById,
    edgesByNode,
    adjacency,
    hypothesisContext,
    observations,
    sourceByObservationId,
    communities,
    enabledDetectors: input.enabledDetectors ?? [],
  };
}

function regionNodeIds(input: DetectionInput): readonly string[] {
  return input.region.nodeIds;
}

function regionEdgeIds(input: DetectionInput): readonly string[] {
  return input.region.edgeIds;
}

function assertScope(input: DetectionInput): void {
  if (input.region.identity.caseId !== input.caseId) {
    throw new GraphHoleDetectionError(
      'AUTHORITY_MISMATCH',
      `region belongs to case ${input.region.identity.caseId}, input is case ${input.caseId}`,
    );
  }
  if (input.region.identity.graphVersionId !== input.graphVersionId) {
    throw new GraphHoleDetectionError(
      'AUTHORITY_MISMATCH',
      `region belongs to graph ${input.region.identity.graphVersionId}, input is graph ${input.graphVersionId}`,
    );
  }
  if (input.enabledDetectors !== undefined && input.enabledDetectors.length === 0) {
    throw new GraphHoleDetectionError(
      'INVALID_CASE_SCOPE',
      'enabledDetectors must be empty (all six) or list at least one detector',
    );
  }
}