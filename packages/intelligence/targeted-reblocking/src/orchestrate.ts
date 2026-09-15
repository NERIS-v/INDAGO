// ============================================================================
// Targeted Reblocking — deterministic core orchestration (Phase 5A-PR11)
//
// The PURE pipeline. No clock, no random, no DB, no network. All collections
// canonicalized. The output record (runId, identityKey, accounting,
// provenance) is contracts-schema-validated before it leaves the core.
//
//   runTargetedReblock (convenience)   → member resolution + core
//   blockTargetedRegion (core)         → selector → bounds → M-A08 → identity
//
// Reuse is deliberate and total:
//   - M-A08 blockCandidates is reused VERBATIM (never duplicated)
//   - @indago/contracts zod schemas validate every output
//   - @indago/graph-hole-region / @indago/contracts canonicalization reuse
//     the exact identity primitives used by region + candidate pair identity
// ============================================================================

import {
  TARGETED_REBLOCK_MEMBERSHIP_RULE,
  TargetedReblockResultSchema,
  type TargetedReblockRegionReference,
} from '@indago/contracts';
import { blockCandidates, type BlockingCandidate } from '@indago/ingestion';
import { boundCandidates, boundPairDrafts } from './bounds.js';
import {
  buildTargetedReblockIdentityKey,
  targetedReblockRunId,
} from './identity.js';
import {
  resolveRegionMemberObservations,
} from './member-observations.js';
import { TARGETED_REBLOCK_POLICY } from './policy.js';
import {
  assertRegionReferenceInScope,
  parseRegionReference,
} from './region-reference.js';
import { selectCandidatesForRegion } from './region-selector.js';
import type {
  RegionObservation,
  TargetedReblockCoreOutput,
  TargetedReblockPolicy,
} from './types.js';

export interface BlockTargetedRegionInput {
  /** Operation context — MUST equal the region reference's own scoping. */
  readonly caseId: string;
  readonly graphVersionId: string;
  /** Authoritative persisted region reference (contract-validated here). */
  readonly regionReference: TargetedReblockRegionReference;
  /** Resolved region member observation ids (already bounded). */
  readonly memberObservationIds: readonly string[];
  /** true when the member set was truncated by the observation bound. */
  readonly memberObservationBoundReached?: boolean;
  /** Case-scoped candidate universe loaded from the DB stores. */
  readonly candidates: readonly BlockingCandidate[];
  /** Operation-scoped investigation (embedded in M-A08 pair drafts). */
  readonly investigationId?: string;
  /** OPTIONAL bound overrides — frozen V1 policy used when omitted. */
  readonly policy?: Partial<
    Pick<TargetedReblockPolicy, 'maxCandidates' | 'maxPairs'>
  >;
}

/**
 * The deterministic core: region-membership selection → bounded candidate
 * universe → M-A08 blockCandidates → bounded pair drafts → content-addressed
 * run identity. Returns a schema-validated result plus the M-A08 pair drafts
 * (persistence is the platform caller's job).
 */
export function blockTargetedRegion(
  input: BlockTargetedRegionInput,
): TargetedReblockCoreOutput {
  const regionRef = parseRegionReference(input.regionReference);
  assertRegionReferenceInScope(regionRef, {
    caseId: input.caseId,
    graphVersionId: input.graphVersionId,
  });

  const policy: TargetedReblockPolicy = {
    ...TARGETED_REBLOCK_POLICY,
    ...input.policy,
  };

  // 1. Region membership selection (the ONLY rule that admits candidates).
  const selection = selectCandidatesForRegion({
    memberObservationIds: input.memberObservationIds,
    candidates: input.candidates,
  });

  // 2. Candidate universe bound (deterministic, surfaced).
  const bound = boundCandidates({
    selectedCandidates: selection.selectedCandidates,
    maxCandidates: policy.maxCandidates,
  });

  // 3. Reuse M-A08 verbatim. Same-case guarantee holds: blockCandidates is
  //    only ever given a single case's candidates here.
  const blocking = blockCandidates({
    candidates: bound.processedCandidates,
    caseId: input.caseId,
    investigationId: input.investigationId,
  });

  // 4. Hard pair bound (deterministic, surfaced).
  const pairs = boundPairDrafts({
    drafts: blocking.drafts,
    maxPairs: policy.maxPairs,
  });

  // 5. Content-addressed run identity over the PROCESSED (selected) universe.
  const selectedCandidateIds = bound.processedCandidates.map((c) => c.id);
  const identityKey = buildTargetedReblockIdentityKey({
    caseId: input.caseId,
    graphVersionId: input.graphVersionId,
    regionId: regionRef.regionId,
    regionPolicyVersion: regionRef.regionPolicyVersion,
    policyVersion: policy.version,
    selectedCandidateIds,
  });
  const runId = targetedReblockRunId(identityKey);

  const memberObservationIds = [...new Set(input.memberObservationIds)].sort();

  const result = TargetedReblockResultSchema.parse({
    runId,
    identityKey,
    selectedCandidateIds,
    memberObservationIds,
    accounting: {
      policyVersion: policy.version,
      regionReference: regionRef,
      membershipRule: TARGETED_REBLOCK_MEMBERSHIP_RULE,
      regionObservationCount: memberObservationIds.length,
      regionObservationBoundReached: input.memberObservationBoundReached ?? false,
      candidateUniverseRequested: input.candidates.length,
      candidateUniverseEligible: selection.eligibleCount,
      candidateUniverseProcessed: bound.processedCandidates.length,
      candidateUniverseTruncated: bound.truncatedCount,
      candidateBoundReached: bound.truncatedCount > 0,
      pairsGenerated: blocking.metrics.uniquePairsAfterUnion,
      pairsTruncated: pairs.truncated,
      blockingMetrics: {
        blocksGenerated: blocking.metrics.blocksGenerated,
        blocksSkippedOversized: blocking.metrics.blocksSkippedOversized,
        rejectedSameObservation: blocking.metrics.rejectedSameObservation,
      },
    },
    provenance: {
      runId,
      policyVersion: policy.version,
      membershipRule: TARGETED_REBLOCK_MEMBERSHIP_RULE,
      selectedCandidateIds,
      memberObservationIds,
    },
  });

  return { result, drafts: pairs.drafts };
}

export interface RunTargetedReblockInput {
  /** Operation context — MUST equal the region reference's own scoping. */
  readonly caseId: string;
  readonly graphVersionId: string;
  /** Authoritative persisted region reference (contract-validated here). */
  readonly regionReference: TargetedReblockRegionReference;
  /** Authoritative region seed observations from the persisted region record. */
  readonly seedObservationIds: readonly string[];
  /** Observations referencing at least one region node (case-scoped). */
  readonly nodeObservations: readonly RegionObservation[];
  /** Authoritative region temporal context (persisted region record). */
  readonly temporalContext?: import('@indago/contracts').TemporalInterval | null;
  /** Case-scoped candidate universe loaded from the DB stores. */
  readonly candidates: readonly BlockingCandidate[];
  /** Operation-scoped investigation (embedded in M-A08 pair drafts). */
  readonly investigationId?: string;
  /** OPTIONAL bound overrides — frozen V1 policy when omitted. */
  readonly policy?: Partial<
    Pick<
      TargetedReblockPolicy,
      'maxRegionObservations' | 'maxCandidates' | 'maxPairs'
    >
  >;
}

/**
 * Convenience wrapper: resolve region member observations, then run the
 * deterministic core. This is the ENTRY POINT pure callers (tests, docs)
 * use; the platform service prefers the split calls to keep member
 * resolution adjacent to its own case-scoped DB reads.
 */
export function runTargetedReblock(
  input: RunTargetedReblockInput,
): TargetedReblockCoreOutput {
  const policy: Pick<TargetedReblockPolicy, 'maxRegionObservations'> = {
    maxRegionObservations: TARGETED_REBLOCK_POLICY.maxRegionObservations,
    ...(input.policy?.maxRegionObservations !== undefined
      ? { maxRegionObservations: input.policy.maxRegionObservations }
      : {}),
  };

  const resolution = resolveRegionMemberObservations({
    seedObservationIds: input.seedObservationIds,
    nodeObservations: input.nodeObservations,
    temporalContext: input.temporalContext,
    maxRegionObservations: policy.maxRegionObservations,
  });

  return blockTargetedRegion({
    caseId: input.caseId,
    graphVersionId: input.graphVersionId,
    regionReference: input.regionReference,
    memberObservationIds: resolution.memberObservationIds,
    memberObservationBoundReached: resolution.boundReached,
    candidates: input.candidates,
    policy: input.policy,
  });
}