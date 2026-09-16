// ============================================================================
// Bounded region context loader (Phase 5A-PR12)
//
// Assembles the CLOSED-WORLD, bounded inputs every region recompute needs:
//   - GraphNode[]/GraphEdge[] mapped from the authoritative projected graph
//     (projectRegionNodes / projectRegionEdges)
//   - the region observations (region node touch) ∪ the observations referenced
//     by the in-scope hypotheses (so the closed-world source-id guard in PR4
//     can never fail on an id we supplied as scope)
//   - the in-scope hypothesis set (relation + entity) bounded to hypothesis
//     context budget, always including the plan item's required hypothesis ids
//   - the prebuilt PR3 HypothesisContext
//
// Everything is deterministic (sorted, deduped, id-bound) and bounded — the
// context hash economy (§25) is computed over the returned BoundedContextSketch.
// ============================================================================

import type {
  EntityHypothesis,
  GraphEdge,
  GraphNode,
  ObservedTime,
  Observation,
  RelationHypothesis,
} from '@indago/contracts';
import {
  MAX_CONTEXT_OBSERVATIONS,
  MAX_GRAPH_HOLES_PER_REGION,
  MAX_HYPOTHESES_IN_CONTEXT,
} from '@indago/contracts';
import { buildHypothesisContext } from '@indago/hypothesis-context';
import type { HypothesisContext } from '@indago/hypothesis-context';
import type { GraphHoleRegion } from '@indago/graph-hole-region';
import type {
  ReassessmentChangeReference,
} from '@indago/graph-hole-reassessment';
import { sha256Hex } from '@indago/graph-hole-reassessment';
import type { BuiltGraph } from '@indago/graphology-projection';
import type { QualificationObservation } from '@indago/graph-hole-qualification';
import type { ObservationStore } from '../persistence/observation-store.js';
import type { EntityHypothesisStore } from '../persistence/entity-hypothesis-store.js';
import type { RelationHypothesisStore } from '../persistence/relation-hypothesis-store.js';
import { projectPresentRelations, projectRegionEdges, projectRegionNodes } from './graph-shapes.js';
import type { ReassessmentScope } from './types.js';

export interface RegionContextDeps {
  readonly observations: ObservationStore;
  readonly entityHypotheses: EntityHypothesisStore;
  readonly relationHypotheses: RelationHypothesisStore;
}

export interface RegionContextScope extends ReassessmentScope {
  readonly computedAt: ObservedTime;
}

export interface RegionRecomputeInput {
  readonly scope: RegionContextScope;
  readonly region: GraphHoleRegion;
  readonly graph: BuiltGraph;
  /** Hypothesis ids the plan REQUIRES to be in scope (candidate support). */
  readonly requiredHypothesisIds?: readonly string[];
}

export interface RegionRecomputeContext {
  readonly scope: RegionContextScope;
  readonly region: GraphHoleRegion;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly observations: readonly Observation[];
  readonly qualificationObservations: readonly QualificationObservation[];
  readonly relationHypotheses: readonly RelationHypothesis[];
  readonly entityHypotheses: readonly EntityHypothesis[];
  readonly hypothesisContext: HypothesisContext;
  /** Authoritative canonical relations projected from the CURRENT graph version. */
  readonly presentRelations: readonly AuthoritativeRelationRef[];
  /** Deterministic canonical sketch — the AI-skip context hash input. */
  readonly contextSha256: string;
  /** true when a hard context bound silently bit (AI re-evaluation is forced). */
  readonly truncated: boolean;
}

export type AuthoritativeRelationRef = {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly relationType: string;
  readonly directed: boolean;
};

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function resolveObservationInputs(obs: readonly Observation[]): readonly QualificationObservation[] {
  return obs.map<QualificationObservation>((o) => {
    const qo: QualificationObservation = {
      id: o.id,
      sourceId: o.sourceId,
      sourceContextId: o.evidenceId,
      strength: o.strength,
      validityInterval: o.validityInterval ?? null,
    };
    return qo;
  });
}

function toRelationHypothesisShape(h: {
  readonly id: string;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationType: string;
  readonly support: number;
  readonly evidenceBasis: readonly string[];
  readonly contradictions: readonly string[];
  readonly directed: boolean;
  readonly status: string;
  readonly validityInterval?: unknown;
}): RelationHypothesis {
  const rh: RelationHypothesis = {
    id: h.id,
    sourceEntityId: h.sourceEntityId,
    targetEntityId: h.targetEntityId,
    relationType: h.relationType as RelationHypothesis['relationType'],
    support: h.support,
    evidenceBasis: [...h.evidenceBasis],
    directed: h.directed,
    status: h.status as RelationHypothesis['status'],
    provenance: { sourceId: h.id, extractor: 'graph-hole-reassessment.v1' },
    createdAt: { value: new Date(0).toISOString(), precision: 'exact' },
    updatedAt: { value: new Date(0).toISOString(), precision: 'exact' },
  };
  if (h.contradictions.length > 0) rh.contradictions = [...h.contradictions];
  return rh;
}

/** Build the deterministic context hash over the bounded region context. */
export function computeReassessmentContextSha256(
  scope: { caseId: string; graphVersionId: string },
  sketch: {
    readonly regionId: string;
    readonly regionStatus: string;
    readonly regionTruncated: boolean;
    readonly regionLimitations: readonly string[];
    readonly nodeIds: readonly string[];
    readonly edgeIds: readonly string[];
    readonly observationIds: readonly string[];
    readonly hypothesisIds: readonly string[];
    readonly presentRelations: ReadonlyArray<{
      readonly sourceNodeId: string;
      readonly targetNodeId: string;
      readonly relationType: string;
      readonly directed: boolean;
    }>;
  },
): string {
  const payload = {
    namespace: 'indago:graph-hole-reassessment:context',
    regionId: sketch.regionId,
    graphVersionId: scope.graphVersionId,
    regionStatus: sketch.regionStatus,
    regionTruncated: sketch.regionTruncated,
    regionLimitations: sortedUnique(sketch.regionLimitations),
    nodeIds: sortedUnique(sketch.nodeIds),
    edgeIds: sortedUnique(sketch.edgeIds),
    observationIds: sortedUnique(sketch.observationIds),
    hypothesisIds: sortedUnique(sketch.hypothesisIds),
    presentRelations: [...sketch.presentRelations]
      .sort((a, b) =>
        (a.sourceNodeId + a.targetNodeId + a.relationType) <
        (b.sourceNodeId + b.targetNodeId + b.relationType)
          ? -1
          : 1,
      ),
  };
  return sha256Hex(JSON.stringify(payload));
}

export async function buildRegionRecomputeContext(
  input: RegionRecomputeInput,
  deps: RegionContextDeps,
): Promise<RegionRecomputeContext> {
  const { scope, region, graph } = input;
  const nodes = projectRegionNodes(graph, region.nodeIds, {
    caseId: scope.caseId,
    investigationId: scope.investigationId,
    graphVersionId: scope.graphVersionId,
    computedAt: scope.computedAt,
    regionId: region.regionId,
  });
  const edges = projectRegionEdges(graph, region.edgeIds, {
    caseId: scope.caseId,
    investigationId: scope.investigationId,
    graphVersionId: scope.graphVersionId,
    computedAt: scope.computedAt,
    regionId: region.regionId,
  });

  // Region node touch observations (bounded — deterministic id order).
  const regionObservations = await deps.observations.listByEntityIds(region.nodeIds, {
    investigationId: scope.investigationId,
    caseId: scope.caseId,
  });
  const obsById = new Map<string, Observation>();
  for (const o of regionObservations) obsById.set(o.id, o);

  // In-scope hypotheses: overlap region nodes OR explicitly required.
  const regionNodes = new Set(region.nodeIds);
  const required = new Set(input.requiredHypothesisIds ?? []);
  const relationRecords = await deps.relationHypotheses.listByCase(scope.caseId, {
    investigationId: scope.investigationId,
  });
  const entityRecords = await deps.entityHypotheses.listByCase(scope.caseId, {
    investigationId: scope.investigationId,
  });

  const relationProps = relationRecords
    .filter((h) => {
      if (required.has(h.id)) return true;
      return regionNodes.has(h.sourceEntityId) || regionNodes.has(h.targetEntityId);
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, MAX_HYPOTHESES_IN_CONTEXT);

  const entityProps = entityRecords
    .filter((h) => {
      if (required.has(h.id)) return true;
      const entityIds = [...(h.supportingCandidateIds ?? []), ...(h.resolvedEntityId ? [h.resolvedEntityId] : [])];
      return entityIds.some((id) => regionNodes.has(id));
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, MAX_HYPOTHESES_IN_CONTEXT);

  const relationHypotheses = relationProps.map(toRelationHypothesisShape);
  const entityHypotheses: readonly EntityHypothesis[] = entityProps;

  // Closed world: hypothesis-referenced observations must be resolvable.
  const referencedIds = new Set<string>();
  for (const h of relationProps) {
    for (const id of [...h.evidenceBasis, ...h.contradictions]) referencedIds.add(id);
  }
  for (const h of entityProps) {
    for (const id of [...(h.supportingObservationIds ?? []), ...(h.contradictingObservationIds ?? [])]) {
      referencedIds.add(id);
    }
  }
  const missingRefs = [...referencedIds].sort().filter((id) => !obsById.has(id));
  if (missingRefs.length > 0) {
    const additional = await deps.observations.listByIds(missingRefs, {
      investigationId: scope.investigationId,
      caseId: scope.caseId,
    });
    for (const o of additional) if (!obsById.has(o.id)) obsById.set(o.id, o);
  }

  // Deterministic bounded observation set: referenced-first, then region touch.
  const referencedFirst = [...referencedIds].sort();
  const rest = [...obsById.keys()].sort().filter((id) => !referencedIds.has(id));
  const boundedIds = [...referencedFirst, ...rest].slice(0, MAX_CONTEXT_OBSERVATIONS);
  const truncated = boundedIds.length < obsById.size;

  const observations = boundedIds.map((id) => obsById.get(id)!).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const qualificationObservations = resolveObservationInputs(observations);

  const hypothesisContext = buildHypothesisContext({
    caseId: scope.caseId,
    graphVersionId: scope.graphVersionId,
    relationHypotheses,
    entityHypotheses,
  });

  const presentRelations = projectPresentRelations(graph);
  const contextSha256 = computeReassessmentContextSha256(
    { caseId: scope.caseId, graphVersionId: scope.graphVersionId },
    {
      regionId: region.regionId,
      regionStatus: region.status,
      regionTruncated: region.truncated,
      regionLimitations: region.limitations,
      nodeIds: region.nodeIds,
      edgeIds: region.edgeIds,
      observationIds: observations.map((o) => o.id),
      hypothesisIds: [...new Set([...relationProps.map((h) => h.id), ...entityProps.map((h) => h.id)])].sort(),
      presentRelations,
    },
  );

  return {
    scope,
    region,
    nodes,
    edges,
    observations,
    qualificationObservations,
    relationHypotheses,
    entityHypotheses,
    hypothesisContext,
    presentRelations,
    contextSha256,
    truncated,
  };
}

export const REGION_RECOMPUTE_BUDGETS = {
  maxRegions: MAX_GRAPH_HOLES_PER_REGION,
  maxCandidates: MAX_GRAPH_HOLES_PER_REGION,
} as const;

export type { ReassessmentChangeReference };