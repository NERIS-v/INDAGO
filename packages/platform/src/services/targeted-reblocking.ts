// ============================================================================
// Targeted Reblocking — Platform Orchestration Service (Phase 5A-PR11)
//
// The ONLY entry point that runs a targeted reblock against durable state.
//
// Invariants (enforced here + in the pure core + the stores):
//   - The persisted GraphHoleRegionAnalysis record is the ONLY source of
//     region truth (seeds, node ids, temporal context, policy version). A
//     missing record REJECTS the run (REGION_NOT_PERSISTED) — client-supplied
//     membership claims are never trusted.
//   - Authority isolation: caseId / graphVersionId are resolved SERVER-SIDE and
//     every read (region, observations, candidates, pairs) is case-scoped. The
//     pure core re-asserts the region reference against the operation context.
//   - Bounded operations: V1 MAX_OPERATIONS_PER_VERSION guard on distinct runs
//     per (case, region, policy version).
//   - M-A08 blockCandidates is reused verbatim via the pure core — there is no
//     second blocking engine.
//   - M-A09 authority boundary is preserved: the bounded pair set is handed to
//     the resolution boundary, which never auto-accepts and never fabricates
//     entities.
//   - Idempotency: run identity is content-addressed over the processed
//     candidate universe, so an identical re-run converges to ONE durable
//     TargetedReblockRun (pair + hypothesis writes are also idempotent).
// ============================================================================

import {
  TARGETED_REBLOCK_MAX_OPERATIONS_PER_VERSION,
  TARGETED_REBLOCK_POLICY_VERSION,
  type TargetedReblockRunRecord,
  type TemporalInterval,
} from "@indago/contracts";
import {
  blockTargetedRegion,
  resolveRegionMemberObservations,
  TargetedReblockError,
  TARGETED_REBLOCK_POLICY,
  type RegionObservation,
} from "@indago/targeted-reblocking";
import { buildCandidatePairIdentityKey } from "@indago/ingestion";
import { finalizeCandidatePair } from "@indago/ingestion";
import { logAuditEvent } from "../audit/logger.js";
import { candidatePairStore } from "../persistence/candidate-pair-store.js";
import { entityMentionStore } from "../persistence/entity-mention-store.js";
import { graphHoleRegionAnalysisStore } from "../persistence/graph-hole-region-analysis-store.js";
import { observationStore } from "../persistence/observation-store.js";
import { targetedReblockRunStore } from "../persistence/targeted-reblock-run-store.js";
import { handoffPairsToEntityResolution } from "./targeted-reblock-ma09-handoff.js";

export interface TargetedReblockRunInput {
  /** Operation-scoped authority context — MUST match the persisted region. */
  readonly caseId: string;
  readonly investigationId: string;
  readonly graphVersionId: string;
  /** Content-addressed persisted region id (from PR6 RegionAnalysis). */
  readonly regionId: string;
  /** Graph-hole policy version the region was analyzed under. */
  readonly regionPolicyVersion: string;
  /** Clock-resolved ISO request time (defaults to now when omitted). */
  readonly requestedAt?: string;
}

export interface TargetedReblockRunOutput {
  readonly record: TargetedReblockRunRecord;
}

/**
 * Run (or re-run) a deterministic, bounded targeted reblock for a persisted
 * region. Idempotent: an identical re-request returns the same run record.
 */
export async function runTargetedReblockForRegion(
  input: TargetedReblockRunInput,
): Promise<TargetedReblockRunOutput> {
  const {
    caseId,
    investigationId,
    graphVersionId,
    regionId,
    regionPolicyVersion,
    requestedAt = new Date().toISOString(),
  } = input;

  // 1. The persisted region is the ONLY admissible source of truth.
  const region = await graphHoleRegionAnalysisStore.findCompletedByRegionIdAndPolicy({
    caseId,
    graphVersionId,
    regionId,
    regionPolicyVersion,
  });
  if (!region) {
    throw new TargetedReblockError(
      'REGION_NOT_PERSISTED',
      `No persisted region analysis found for region ${regionId} (case ${caseId}, graphVersion ${graphVersionId}, regionPolicyVersion ${regionPolicyVersion})`,
    );
  }

  // 2. Operational guard — bounded repeats per (case, region, policy version).
  const priorRuns = await targetedReblockRunStore.countRunsForRegionVersion({
    caseId,
    regionId,
    regionPolicyVersion,
    policyVersion: TARGETED_REBLOCK_POLICY_VERSION,
  });
  if (priorRuns >= TARGETED_REBLOCK_MAX_OPERATIONS_PER_VERSION) {
    throw new TargetedReblockError(
      'OPERATION_BOUND_REACHED',
      `Targeted reblock bound reached: ${priorRuns} run(s) already durable for region ${regionId} (case ${caseId}, policy ${TARGETED_REBLOCK_POLICY_VERSION})`,
    );
  }

  // 3. Region membership reads (case-scoped; the pure core re-asserts scope).
  const seedObservationIds: string[] = [...region.seedObservationIds];
  const nodeObservationRows = await observationStore.listByEntityIds(region.nodeIds, {
    investigationId,
    caseId,
  });
  const nodeObservations: RegionObservation[] = nodeObservationRows.map((o) => ({
    id: o.id,
    ...(o.eventTime !== undefined ? { eventTime: o.eventTime } : {}),
    ...(o.observedAt !== undefined ? { observedAt: o.observedAt } : {}),
    ...(o.validityInterval !== undefined ? { validityInterval: o.validityInterval } : {}),
  }));

  // 4. Case-scoped candidate universe (the dedicated membership selector only
  //    admits candidates whose observationId is a resolved region member).
  const candidates = await entityMentionStore.listByCase(caseId, { investigationId });

  // 5. Pure deterministic core — no clock, no DB, no I/O.
  const resolution = resolveRegionMemberObservations({
    seedObservationIds,
    nodeObservations,
    temporalContext: region.temporalContext as TemporalInterval | null | undefined,
    maxRegionObservations: TARGETED_REBLOCK_POLICY.maxRegionObservations,
  });
  const { result, drafts } = blockTargetedRegion({
    caseId,
    graphVersionId,
    regionReference: {
      caseId,
      graphVersionId,
      regionId,
      regionPolicyVersion,
    },
    memberObservationIds: resolution.memberObservationIds,
    memberObservationBoundReached: resolution.boundReached,
    candidates,
    investigationId,
  });

  // 6. Finalize + persist the bounded pair universe (idempotent per pair).
  const nowIso = requestedAt;
  const entries: { identityKey: string; pair: import("@indago/contracts").CandidatePair }[] =
    [];
  for (const draft of drafts) {
    const pair = await finalizeCandidatePair({ draft, nowIso });
    entries.push({
      identityKey: buildCandidatePairIdentityKey({
        caseId: pair.caseId,
        leftCandidateId: pair.leftCandidateId,
        rightCandidateId: pair.rightCandidateId,
      }),
      pair,
    });
  }
  const ensured = await candidatePairStore.ensureCandidatePairs(entries);
  const finalizedPairs = entries.map((entry) => entry.pair);

  // 7. M-A09 handoff over the run's bounded pair set (never the whole case).
  const handoff = await handoffPairsToEntityResolution({
    caseId,
    investigationId,
    pairs: finalizedPairs,
    candidates,
  });

  // 8. Durable run record with END-TO-END counts (including resolution outcomes).
  const counts = {
    pairDraftCount: drafts.length,
    pairCreatedCount: ensured.created,
    pairReusedCount: ensured.skipped,
    resolverHandoffCount: handoff.handedOffPairs,
    resolverProposedCount: handoff.proposedHypotheses,
  };
  const persisted = await targetedReblockRunStore.persistRun({
    caseId,
    graphVersionId,
    investigationId,
    result,
    counts,
    requestedAt,
  });

  // 9. Audit ONCE, after durability, with the ACTUAL run id. Metadata only —
  //    never pair payloads or candidate text.
  await logAuditEvent({
    investigationId,
    action: 'TARGETED_REBLOCK_COMPLETED',
    actor: 'TARGETED_REBLOCK_PIPELINE',
    targetType: 'REBLOCK_RUN',
    targetId: persisted.record.runId,
    description: `Targeted reblock run ${persisted.record.runId} for region ${regionId} (case ${caseId}, graphVersion ${graphVersionId}): ${counts.pairCreatedCount} pairs created, ${counts.pairReusedCount} reused, ${counts.resolverProposedCount} hypothesis proposal(s)${
      persisted.record.truncated ? ', truncated bounds' : ''
    }`,
  });

  return { record: persisted.record };
}