import {
  type ReassessmentAffectedSet,
  type ReassessmentPlan,
  type ReassessmentPlanItem,
} from '@indago/contracts';

// ============================================================================
// Reassessment plan builder
//
// Converts a resolved affected set into canonical ordered work items — ONE per
// affected region — BEFORE any side effect. Ordering is canonical (regionId
// asc); it never depends on DB insertion order, queue arrival, Map/Set
// iteration, or worker scheduling. The plan may be inspected (dry-run) and is
// the unit of deterministic testing.
// ============================================================================

export interface BuildReassessmentPlanOptions {
  /**
   * Region ids whose work item must REBUILD the region identity (graph-affecting
   * scope on a concrete new graphVersionId). Every region in the affected set
   * is included here when the effect class is GRAPH_AFFECTING. Manual scopes
   * pass the region ids only when the manual trigger declared a new
   * graphVersionId.
   */
  readonly recomputeIdentityRegionIds?: readonly string[];
  /** Region → candidate binding (from the authoritative persisted holes). */
  readonly candidatesByRegion?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Plan semantics per item:
 *   - recomputeIdentity=true  region must be rebuilt on the new graph version
 *                             => new content-addressed region id + new candidate
 *                             ids (resulting candidates are derived downstream).
 *   - recomputeIdentity=false reassess the SAME region/candidate identities on
 *                             the SAME graph version (evidence-affecting).
 */
export function buildReassessmentPlan(
  affectedSet: ReassessmentAffectedSet,
  options: BuildReassessmentPlanOptions = {},
): ReassessmentPlan {
  const recomputeSet = new Set(options.recomputeIdentityRegionIds ?? []);
  if (affectedSet.effectClass === 'GRAPH_AFFECTING') {
    for (const regionId of affectedSet.affectedRegionIds) recomputeSet.add(regionId);
  }

  const plan: ReassessmentPlan = affectedSet.affectedRegionIds.map((regionId) => {
    const recomputeIdentity = recomputeSet.has(regionId);
    const item: ReassessmentPlanItem = {
      regionId,
      graphVersionId: affectedSet.graphVersionId,
      effectClass: affectedSet.effectClass,
      recomputeIdentity,
      candidateIds: recomputeIdentity
        ? []
        : [...(options.candidatesByRegion?.[regionId] ?? [])].sort(),
    };
    return item;
  });

  plan.sort((a, b) => (a.regionId < b.regionId ? -1 : a.regionId > b.regionId ? 1 : 0));
  return plan;
}

export type { ReassessmentPlan, ReassessmentPlanItem };