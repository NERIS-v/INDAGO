import { z } from 'zod';
import {
  CaseIdSchema,
  GraphVersionIdSchema,
  InvestigationIdSchema,
} from '../common/ids.js';

// ============================================================================
// Targeted Reblocking Contracts (Phase 5A-PR11)
//
// Deterministic, bounded orchestration layer that re-runs M-A08 blocking
// restricted to a targeted candidate region identified by a persisted
// GraphHoleRegionAnalysis record.
//
// PURPOSE:
//   After graph-hole analysis identifies a suspicious local region, re-run
//   entity blocking only for that region instead of a case-wide blocking pass.
//
// NON-GOALS:
//   - This is NOT a new blocking algorithm (M-A08 blockCandidates is reused)
//   - This is NOT entity resolution (M-A09 decides what pairs mean)
//   - This does NOT mutate canonical graph state
//   - This does NOT auto-accept entity hypotheses
//   - This does NOT bypass M-A09 authority boundaries
//
// AUTHORITY:
//   Region membership is derived from the authoritative persisted PR6
//   GraphHoleRegionAnalysis record. PR11 trusts only persisted data,
//   never client-supplied membership claims.
//
// IDEMPOTENCY:
//   - CandidatePair idempotency preserved (content-addressed pair identity)
//   - TargetedReblockRun record idempotent (identityKey @unique)
//   - EntityHypothesis lifecycle preserved via M-A09 upsert semantics
//
// DETERMINISM:
//   No clock, no random, no Map/Set iteration order dependence.
//   All sets sorted; all orderings canonical (id asc or pair-key asc).
// ============================================================================

// ============================================================================
// Policy Version
// ============================================================================

export const TARGETED_REBLOCK_POLICY_VERSION = 'v1' as const;
export type TargetedReblockPolicyVersion = typeof TARGETED_REBLOCK_POLICY_VERSION;

// ============================================================================
// §13 Bounds Policy — Frozen V1 constants
//
// Rationale for each bound:
//
// maxRegionObservations: region membership is derived from seedObservationIds ∪
//   node-scoped observations. A region with >500 observations is pathological;
//   the bound prevents unbounded DB reads of observations + candidates.
//
// maxCandidates: blockCandidates is O(N + generatedPairs) with
//   maxBlockSize=50. 200 candidates limits the worst-case universe while
//   remaining meaningful for targeted reblocking (not too small).
//
// maxPairs: 200 candidates → at most ~19,900 possible pairs, but bounded
//   by maxBlockSize=50 per block (200 candidates worst-case ≈ 3,675 pairs
//   across all passes). 5,000 is a conservative hard cap surfaced on
//   truncation.
//
// maxOperationsPerVersion: operational guard against repeated targeted
//   reblock submissions per (caseId, graphVersionId) pair. Enforced at
//   the service boundary; not a pure-function concept.
// ============================================================================

export const TARGETED_REBLOCK_MAX_REGION_OBSERVATIONS = 500 as const;
export const TARGETED_REBLOCK_MAX_CANDIDATES = 200 as const;
export const TARGETED_REBLOCK_MAX_PAIRS = 5_000 as const;
export const TARGETED_REBLOCK_MAX_OPERATIONS_PER_VERSION = 50 as const;

// ============================================================================
// Membership Rule — V1 frozen contract
// ============================================================================

export const TARGETED_REBLOCK_MEMBERSHIP_RULE = 'REGION_OBSERVATION_MEMBERSHIP_V1' as const;

export const TargetedReblockMembershipRuleSchema = z
  .literal(TARGETED_REBLOCK_MEMBERSHIP_RULE)
  .describe(
    'Region membership = candidate.observationId ∈ regionMemberObservationIds. ' +
    'regionMemberObservationIds = seedObservationIds ∪ { observations where ' +
    'entityIds ∩ region.nodeIds ≠ ∅ } filtered to region temporalContext when present. ' +
    'Candidates sorted by id asc. Case isolation enforced by DB-level scoping.',
  );
export type TargetedReblockMembershipRule = z.infer<typeof TargetedReblockMembershipRuleSchema>;

// ============================================================================
// Region Reference — content-addressed reference to a persisted PR6 region
// ============================================================================

/** SHA-256 hex region identifier (64 chars) or equivalent content-addressed id. */
export const TargetedReblockRegionIdSchema = z.string().min(1).max(256)
  .describe('Content-addressed region identifier (SHA-256 hex of the canonical region identity).');
export type TargetedReblockRegionId = z.infer<typeof TargetedReblockRegionIdSchema>;

export const TargetedReblockRegionReferenceSchema = z.object({
  caseId: CaseIdSchema,
  graphVersionId: GraphVersionIdSchema,
  regionId: TargetedReblockRegionIdSchema,
  regionPolicyVersion: z.string().min(1).max(64)
    .describe('Graph-hole policy version used by the region (must match persisted record).'),
}).strict();
export type TargetedReblockRegionReference = z.infer<typeof TargetedReblockRegionReferenceSchema>;

// ============================================================================
// Run Identity
// ============================================================================

export const TargetedReblockRunIdSchema = z.string().min(1).max(256)
  .describe('Content-addressed run identifier (SHA-256 hex of the canonical run identity).');
export type TargetedReblockRunId = z.infer<typeof TargetedReblockRunIdSchema>;

// ============================================================================
// Accounting — deterministic counts from a targeted reblock run
// ============================================================================

export const TargetedReblockAccountingSchema = z.object({
  policyVersion: z.literal(TARGETED_REBLOCK_POLICY_VERSION),
  regionReference: TargetedReblockRegionReferenceSchema,
  membershipRule: TargetedReblockMembershipRuleSchema,
  regionObservationCount: z.number().int().nonnegative()
    .describe('Member observation count after resolution + truncation.'),
  regionObservationBoundReached: z.boolean()
    .describe('true when observation set exceeded MAX_REGION_OBSERVATIONS.'),
  candidateUniverseRequested: z.number().int().nonnegative()
    .describe('Total candidates loaded from the DB for the member observations.'),
  candidateUniverseEligible: z.number().int().nonnegative()
    .describe('Candidates passing the region-membership selector (observationId ∈ member set).'),
  candidateUniverseProcessed: z.number().int().nonnegative()
    .describe('Candidates actually fed to M-A08 blockCandidates (after truncation bound).'),
  candidateUniverseTruncated: z.number().int().nonnegative()
    .describe('eligible − processed (> 0 when maxCandidates bound was reached).'),
  candidateBoundReached: z.boolean()
    .describe('true when candidateUniverseProcessed < candidateUniverseEligible.'),
  pairsGenerated: z.number().int().nonnegative()
    .describe('Unique candidate pairs generated by M-A08 (pre-persistence).'),
  pairsTruncated: z.boolean()
    .describe('true when pairsGenerated exceeded MAX_PAIRS (pairs after truncation fed to persistence).'),
  blockingMetrics: z.object({
    blocksGenerated: z.number().int().nonnegative(),
    blocksSkippedOversized: z.number().int().nonnegative(),
    rejectedSameObservation: z.number().int().nonnegative(),
  }).strict()
    .describe('Bounded M-A08 blocking metrics surfaced for audit.'),
}).strict();
export type TargetedReblockAccounting = z.infer<typeof TargetedReblockAccountingSchema>;

// ============================================================================
// Counts — post-persistence + handoff counts (only known at service boundary)
// ============================================================================

export const TargetedReblockCountsSchema = z.object({
  pairDraftCount: z.number().int().nonnegative()
    .describe('Pair drafts generated by M-A08 (pre-persistence).'),
  pairCreatedCount: z.number().int().nonnegative()
    .describe('Pairs newly written to durable CandidatePair store.'),
  pairReusedCount: z.number().int().nonnegative()
    .describe('Pairs already present (idempotent no-op).'),
  resolverHandoffCount: z.number().int().nonnegative()
    .describe('Pairs handed to the M-A09 resolution boundary.'),
  resolverProposedCount: z.number().int().nonnegative()
    .describe('Fresh EntityHypothesis proposals resulting from the handoff.'),
}).strict();
export type TargetedReblockCounts = z.infer<typeof TargetedReblockCountsSchema>;

// ============================================================================
// Provenance — traceable audit trail for a targeted reblock run
// ============================================================================

export const TargetedReblockProvenanceSchema = z.object({
  runId: TargetedReblockRunIdSchema,
  policyVersion: z.literal(TARGETED_REBLOCK_POLICY_VERSION),
  membershipRule: TargetedReblockMembershipRuleSchema,
  selectedCandidateIds: z.array(z.string().min(1).max(256))
    .describe('Sorted candidate ids processed by M-A08.'),
  memberObservationIds: z.array(z.string().min(1).max(256))
    .describe('Sorted observation ids forming the region membership boundary.'),
}).strict();
export type TargetedReblockProvenance = z.infer<typeof TargetedReblockProvenanceSchema>;

// ============================================================================
// Result — deterministic output from the pure core (pre-persistence)
// ============================================================================

export const TargetedReblockResultSchema = z.object({
  runId: TargetedReblockRunIdSchema,
  identityKey: z.string().min(1)
    .describe('Canonical identity string for the run record (idempotency key).'),
  selectedCandidateIds: z.array(z.string().min(1).max(256))
    .describe('Region-member candidate ids processed (sorted, deduped).'),
  memberObservationIds: z.array(z.string().min(1).max(256))
    .describe('Region member observation ids (sorted, deduped, bounded).'),
  accounting: TargetedReblockAccountingSchema,
  provenance: TargetedReblockProvenanceSchema,
}).strict();
export type TargetedReblockResult = z.infer<typeof TargetedReblockResultSchema>;

// ============================================================================
// Persisted Run Record Shape (platform service returns this after persist+handoff)
// ============================================================================

export const TargetedReblockRunRecordSchema = z.object({
  id: z.string().min(1)
    .describe('Row id (deterministic UUID).'),
  runId: TargetedReblockRunIdSchema,
  identityKey: z.string().min(1),
  caseId: CaseIdSchema,
  investigationId: InvestigationIdSchema.optional(),
  graphVersionId: GraphVersionIdSchema,
  regionId: TargetedReblockRegionIdSchema,
  regionPolicyVersion: z.string().min(1).max(64),
  policyVersion: z.literal(TARGETED_REBLOCK_POLICY_VERSION),
  requestedAt: z.string().min(1)
    .describe('Caller-supplied ISO observed time.'),
  accounting: TargetedReblockAccountingSchema,
  counts: TargetedReblockCountsSchema,
  provenance: TargetedReblockProvenanceSchema,
  truncated: z.boolean()
    .describe('true if any truncation occurred in observation set or candidate universe.'),
  createdAt: z.string().min(1)
    .describe('ISO observed time (may differ from requestedAt for audit).'),
}).strict();
export type TargetedReblockRunRecord = z.infer<typeof TargetedReblockRunRecordSchema>;
