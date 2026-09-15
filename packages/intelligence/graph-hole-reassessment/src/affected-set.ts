import {
  PR12_MAX_AFFECTED_HYPOTHESES_PER_CHANGE,
  PR12_MAX_AFFECTED_GROUPS_PER_CHANGE,
  PR12_MAX_AFFECTED_REGIONS_PER_CHANGE,
  PR12_MAX_REASSESSMENTS_PER_CHANGE,
  deriveReassessmentEffectClass,
  type ReassessmentAffectedSet,
  type ReassessmentEffectClass,
  type ReassessmentTrigger,
} from '@indago/contracts';

// ============================================================================
// Deterministic, lazy, content-addressed affected-set resolution
//
// PR12 has NO invalidation table. Impact is recomputed from the persisted
// authoritative context with which the port supplies this pure module:
//
//   EVIDENCE_AFFECTING (NEW_OBSERVATION / NEW_EVIDENCE):
//     1. hypotheses whose supporting/contradicting observation sets reference
//        the changed observations;
//     2. groups whose memberships include an affected hypothesis;
//     3. regions whose node/edge membership intersects the affected
//        hypotheses' canonical entity references OR whose seed observations
//        are among the changed observations;
//     4. persisted holes bound to those regions on the SAME graphVersionId.
//
//   GRAPH_AFFECTING (ENTITY_RESOLUTION_ACCEPTED / RELATION_ACCEPTED):
//     1. regions (prior/current version) whose node/edge membership overlaps
//        the changed canonical nodes/edge — these are the regions to REBUILD
//        with the same seeds on the NEW version (new region/candidate ids);
//     2. the holes currently bound to those regions are the supersession
//        targets, surfaced as affected candidates.
//
//   MANUAL_REASSESSMENT: explicit operator scope (CASE_WIDE / REGIONS /
//     CANDIDATES / HOLES). When scope.graphVersionId is present the manual
//     scope behaves as graph-affecting (rebuild on the new version).
//
// Every bound stops deterministically and surfaces truncation (status /
// truncated flag). NO_AFFECTED and AFFECTED_TRUNCATED are never conflated.
//
// All collections are sorted + deduped; ordering is canonical (id asc). This
// module is pure: it performs no DB access, no clock reads, no global state.
// ============================================================================

export interface ReassessmentHypothesisRef {
  readonly id: string;
  readonly kind: 'ENTITY' | 'RELATION';
  readonly supportingObservationIds: readonly string[];
  readonly contradictingObservationIds: readonly string[];
  readonly candidateEntityIds: readonly string[];
}

export interface ReassessmentGroupRef {
  readonly id: string;
  readonly memberHypothesisIds: readonly string[];
}

export interface ReassessmentRegionRef {
  readonly id: string;
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly seedObservationIds: readonly string[];
}

export interface ReassessmentHoleRef {
  readonly id: string;
  readonly candidateId: string;
  readonly regionId: string;
  readonly supportingHypothesisIds: readonly string[];
}

export interface ReassessmentChangeReference {
  /** Canonical graph nodes/entities that changed (graph-affecting). */
  readonly nodeIds: readonly string[];
  /** Canonical graph edge ids that changed (graph-affecting). */
  readonly edgeIds: readonly string[];
  /** Observation ids newly created/affected (evidence-affecting). */
  readonly changedObservationIds: readonly string[];
}

export interface ResolveAffectedSetInput {
  readonly trigger: ReassessmentTrigger;
  readonly changeId: string;
  readonly caseId: string;
  /** Single authoritative version the impact is resolved against. */
  readonly graphVersionId: string;
  readonly changeReference: ReassessmentChangeReference;
  readonly hypotheses: readonly ReassessmentHypothesisRef[];
  readonly groups: readonly ReassessmentGroupRef[];
  /** Persisted regions of this version (the port loads them case-scoped). */
  readonly regions: readonly ReassessmentRegionRef[];
  /** Persisted holes bound to those regions on this version. */
  readonly holes: readonly ReassessmentHoleRef[];
  readonly bounds?: Partial<
    Readonly<{
      maxAffectedHypotheses: number;
      maxAffectedGroups: number;
      maxAffectedRegions: number;
      maxReassessments: number;
    }>
  >;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function resolveAffectedSet(input: ResolveAffectedSetInput): ReassessmentAffectedSet {
  const effectClass = deriveReassessmentEffectClass(input.trigger);
  const bounds = {
    maxAffectedHypotheses:
      input.bounds?.maxAffectedHypotheses ?? PR12_MAX_AFFECTED_HYPOTHESES_PER_CHANGE,
    maxAffectedGroups: input.bounds?.maxAffectedGroups ?? PR12_MAX_AFFECTED_GROUPS_PER_CHANGE,
    maxAffectedRegions: input.bounds?.maxAffectedRegions ?? PR12_MAX_AFFECTED_REGIONS_PER_CHANGE,
    maxReassessments: input.bounds?.maxReassessments ?? PR12_MAX_REASSESSMENTS_PER_CHANGE,
  };

  const hypothesisUniverseCount = input.hypotheses.length;
  const groupUniverseCount = input.groups.length;
  const regionUniverseCount = input.regions.length;
  const observationUniverseCount = input.changeReference.changedObservationIds.length;

  const affectedHypothesisIds = new Set<string>();
  const affectedGroupIds = new Set<string>();
  const affectedRegionIds = new Set<string>();
  const affectedCandidateIds = new Set<string>();

  const changedObservationSet = new Set(input.changeReference.changedObservationIds);

  // ---- Manual scope target resolution -------------------------------------------------------------------
  const manualScoped: string[] = [];
  if (input.trigger.triggerType === 'REASSESSMENT_REQUESTED') {
    const scope = input.trigger.scope;
    switch (scope.scope) {
      case 'REGIONS':
        manualScoped.push(...(scope.regionIds ?? []));
        break;
      case 'CANDIDATES':
        manualScoped.push(
          ...regionIdsOfHoles(input.holes, (h) =>
            (scope.candidateIds ?? []).includes(h.candidateId),
          ),
        );
        break;
      case 'HOLES':
        manualScoped.push(
          ...regionIdsOfHoles(input.holes, (h) => (scope.holeIds ?? []).includes(h.id)),
        );
        break;
      case 'CASE_WIDE':
        manualScoped.push(...input.regions.map((r) => r.id));
        break;
    }
  }

  if (effectClass === 'EVIDENCE_AFFECTING' || effectClass === 'GRAPH_AFFECTING') {
    // 1. Hypotheses touched by the changed evidence.
    for (const hypothesis of input.hypotheses) {
      const referencesChangedObservation =
        hypothesis.supportingObservationIds.some((o) => changedObservationSet.has(o)) ||
        hypothesis.contradictingObservationIds.some((o) => changedObservationSet.has(o));
      if (referencesChangedObservation) {
        affectedHypothesisIds.add(hypothesis.id);
      }
    }

    // 2. Groups containing an affected hypothesis.
    for (const group of input.groups) {
      if (group.memberHypothesisIds.some((id) => affectedHypothesisIds.has(id))) {
        affectedGroupIds.add(group.id);
      }
    }

    // 3. Regions overlapping the affected hypotheses' canonical entities / seeds,
    //    or (graph-affecting) overlapping the changed canonical nodes/edge.
    const graphNodeIds = new Set(input.changeReference.nodeIds);
    const graphEdgeIds = new Set(input.changeReference.edgeIds);
    for (const region of input.regions) {
      const affectedEntityIds = new Set<string>();
      for (const hypothesis of input.hypotheses) {
        if (affectedHypothesisIds.has(hypothesis.id)) {
          for (const entityId of hypothesis.candidateEntityIds) affectedEntityIds.add(entityId);
        }
      }
      const seedOverlap = region.seedObservationIds.some((o) => changedObservationSet.has(o));
      const nodeOverlap =
        (effectClass === 'GRAPH_AFFECTING'
          ? region.nodeIds.some((n) => graphNodeIds.has(n))
          : region.nodeIds.some((n) => affectedEntityIds.has(n))) ||
        region.nodeIds.length === 0;
      const edgeOverlap = region.edgeIds.some((e) => graphEdgeIds.has(e));
      const graphAffecting = effectClass === 'GRAPH_AFFECTING';
      if (
        (graphAffecting && (nodeOverlap || edgeOverlap)) ||
        (!graphAffecting && (nodeOverlap || seedOverlap))
      ) {
        affectedRegionIds.add(region.id);
      }
    }

    // 4. Holes bound to the affected regions on this version.
    for (const hole of input.holes) {
      if (affectedRegionIds.has(hole.regionId)) {
        affectedCandidateIds.add(hole.candidateId);
      }
    }
  } else {
    // MANUAL_REASSESSMENT — affected set derives from the explicit scope.
    const scopedRegionSet = new Set(manualScoped);
    for (const hole of input.holes) {
      if (scopedRegionSet.has(hole.regionId)) {
        affectedRegionIds.add(hole.regionId);
        affectedCandidateIds.add(hole.candidateId);
        for (const hypothesisId of hole.supportingHypothesisIds) {
          affectedHypothesisIds.add(hypothesisId);
        }
      }
    }
    for (const group of input.groups) {
      if (group.memberHypothesisIds.some((id) => affectedHypothesisIds.has(id))) {
        affectedGroupIds.add(group.id);
      }
    }
  }

  // ---- Bounded, deterministic truncation ---------------------------------------------------------------
  let truncated = false;

  const boundedHypotheses = cap(affectedHypothesisIds, bounds.maxAffectedHypotheses);
  if (boundedHypotheses.truncated) truncated = true;

  const boundedGroups = cap(affectedGroupIds, bounds.maxAffectedGroups);
  if (boundedGroups.truncated) truncated = true;

  const boundedRegions = cap(affectedRegionIds, bounds.maxAffectedRegions);
  if (boundedRegions.truncated) truncated = true;

  const boundedCandidates = cap(affectedCandidateIds, bounds.maxReassessments);
  if (boundedCandidates.truncated) truncated = true;

  const hasAffected =
    boundedRegions.values.length > 0 || boundedCandidates.values.length > 0;

  const status = !hasAffected
    ? ('NO_AFFECTED' as const)
    : truncated
      ? ('AFFECTED_TRUNCATED' as const)
      : ('AFFECTED_COMPLETE' as const);

  return {
    caseId: input.caseId,
    graphVersionId: input.graphVersionId,
    changeId: input.changeId,
    effectClass,
    status,
    affectedObservationIds: sortedUnique(input.changeReference.changedObservationIds),
    affectedEntityHypothesisIds: boundedHypotheses.values.filter(
      (id) => kindOf(input.hypotheses, id) === 'ENTITY',
    ),
    affectedRelationHypothesisIds: boundedHypotheses.values.filter(
      (id) => kindOf(input.hypotheses, id) === 'RELATION',
    ),
    affectedGroupIds: boundedGroups.values,
    affectedRegionIds: boundedRegions.values,
    affectedCandidateIds: boundedCandidates.values,
    truncated,
    accounting: {
      observationUniverseCount,
      hypothesisUniverseCount,
      candidateUniverseCount: input.holes.length,
      groupUniverseCount,
      regionUniverseCount,
    },
  };
}

function regionIdsOfHoles(
  holes: readonly ReassessmentHoleRef[],
  matches: (hole: ReassessmentHoleRef) => boolean,
): string[] {
  return holes.filter(matches).map((h) => h.regionId);
}

function kindOf(
  hypotheses: readonly ReassessmentHypothesisRef[],
  id: string,
): 'ENTITY' | 'RELATION' {
  for (const hypothesis of hypotheses) {
    if (hypothesis.id === id) return hypothesis.kind;
  }
  return 'ENTITY';
}

function cap(
  values: ReadonlySet<string>,
  bound: number,
): { values: string[]; truncated: boolean } {
  const sorted = sortedUnique([...values]);
  if (sorted.length <= bound) {
    return { values: sorted, truncated: false };
  }
  return { values: sorted.slice(0, bound), truncated: true };
}

/** Discriminated-union narrowing helper for the trigger union. */
export function isGraphEffectingTrigger(
  trigger: ReassessmentTrigger,
): trigger is Extract<
  ReassessmentTrigger,
  { triggerType: 'ENTITY_RESOLUTION_ACCEPTED' | 'RELATION_ACCEPTED' }
> {
  return (
    trigger.triggerType === 'ENTITY_RESOLUTION_ACCEPTED' ||
    trigger.triggerType === 'RELATION_ACCEPTED'
  );
}

export type { ReassessmentEffectClass };