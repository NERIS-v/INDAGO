import { z } from 'zod';
import {
  InvestigationIdSchema,
  InvestigativeGapIdSchema,
  HypothesisIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';
import { EvidenceTypeSchema, type EvidenceType } from '../domain/evidence.js';
import { EvidenceUtilitySchema } from '../domain/evidence-request.js';
import { EVIDENCE_UTILITY_POLICY_VERSION } from './evidence-utility-policy.js';
import {
  NEXT_BEST_EVIDENCE_POLICY_VERSION,
  MAX_EVIDENCE_REQUESTS_PER_GAP,
  MAX_GAPS_PER_SELECTION_RUN,
} from './next-best-evidence-policy.js';
import { canonicalizeDeterministic } from './identity-canonicalization.js';

// ============================================================================
// Next-Best-Evidence Selection Contracts (Phase 5A-PR10 Freeze)
//
// PR10 distinguishes TWO levels (frozen):
//
//   NextBestEvidenceCandidate   — "What evidence should potentially be
//                                 requested?" A candidate request BEFORE
//                                 selection/acquisition/authorization.
//
//   NextBestEvidenceSelectionResult — "Which candidates were ranked/selected
//                                 for which GraphHole/gap?" A deterministic
//                                 RANKED SELECTION snapshot.
//
// A SelectionResult does NOT imply that evidence has been acquired, that a
// request has been authorized, that a lifecycle state exists, or that the
// (proposed) `recommendedEvidence` from PR7 analysis is canonical. It is a
// transient/analysis-level contract until the later persistence/lifecycle
// implementation stores requests.
//
// DISCRIMINATION TARGET (frozen):
//   `discriminatesAmongIds` references EXPLICITLY CONSIDERED competing
//   explanations. At selection level these are canonical hypothesis IDs
//   (HypothesisIdSchema). The PR7 analysis-level surface uses bounded-context
//   atomic-hypothesis derivedIds (analysisHypothesisIdRef) whose embedded id is
//   the same canonical hypothesis UUID. The LLM's recommendation is NOT
//   authoritative; selection-level identity + ranking are deterministic.
// ============================================================================

/**
 * Deterministic identity inputs of one candidate evidence request.
 * This is the dedup identity — NOT the description text.
 */
export interface CanonicalEvidenceRequestIdentityInput {
  readonly gapId: string;
  readonly evidenceType: EvidenceType;
  readonly discriminatesAmongIds: readonly string[];
  readonly hypothesisIds?: readonly string[] | undefined;
}

/**
 * Build the deterministic canonical identity key of a candidate evidence
 * request. Order-independent (hypothesis ids are deduped, then object keys and
 * string arrays are sorted by the frozen canonicalization rules). Same logical
 * request under the same gap/vocabulary/targets collapses to the same key.
 */
export function canonicalizeNextBestEvidenceRequest(
  input: CanonicalEvidenceRequestIdentityInput,
): string {
  return canonicalizeDeterministic({
    gapId: input.gapId,
    evidenceType: input.evidenceType,
    discriminatesAmongIds: [...new Set(input.discriminatesAmongIds)],
    hypothesisIds: [...new Set(input.hypothesisIds ?? [])],
  });
}

// ============================================================================
// Candidate evidence request
// ============================================================================

export const NextBestEvidenceCandidateSchema = z.object({
  canonicalRequestKey: z.string().min(1)
    .describe(
      'Deterministic dedup/identity key (canonicalizeNextBestEvidenceRequest over gapId, ' +
      'evidenceType, discriminatesAmongIds, hypothesisIds). NOT an EvidenceRequestId; ' +
      'no persistent id is created by this contract.',
    ),
  gapId: InvestigativeGapIdSchema
    .describe('The investigative gap this candidate request addresses.'),
  hypothesisIds: z.array(HypothesisIdSchema)
    .describe('Canonical hypotheses this evidence would inform.'),
  evidenceType: EvidenceTypeSchema
    .describe('Canonical evidence type (EvidenceTypeSchema — authoritative PR10 vocabulary).'),
  discriminatesAmongIds: z.array(HypothesisIdSchema)
    .describe(
      'Canonical hypothesis ids of the competing explanations this request would help ' +
      'distinguish (the discrimination target). ID-based; never free text.',
    ),
  utility: EvidenceUtilitySchema
    .describe('Utility record per EVIDENCE_UTILITY_POLICY_V1.'),
  rationale: z.string().min(1).max(5000)
    .describe('Why this evidence is needed (proposed rationale).'),
}).strict();
export type NextBestEvidenceCandidate = z.infer<typeof NextBestEvidenceCandidateSchema>;

// ============================================================================
// Per-gap ranked selection
// ============================================================================

export const NextBestEvidenceSelectionEntrySchema = z.object({
  rank: z.number().int().positive()
    .describe('Deterministic rank within the gap (1 = most useful), per EVIDENCE_UTILITY_POLICY_V1.rankOrder.'),
  candidateRequest: NextBestEvidenceCandidateSchema
    .describe('The candidate evidence request at this rank. PROPOSED — not acquired, not authorized.'),
}).strict();
export type NextBestEvidenceSelectionEntry = z.infer<typeof NextBestEvidenceSelectionEntrySchema>;

export const NextBestEvidencePerGapSelectionSchema = z.object({
  gapId: InvestigativeGapIdSchema,
  rankedRequests: z.array(NextBestEvidenceSelectionEntrySchema)
    .max(MAX_EVIDENCE_REQUESTS_PER_GAP)
    .describe(`Ranked candidate requests (max ${MAX_EVIDENCE_REQUESTS_PER_GAP} per gap, per NEXT_BEST_EVIDENCE_POLICY_V1).`),
  consideredCount: z.number().int().nonnegative()
    .describe('Number of candidate requests considered before ranking for this gap.'),
  truncated: z.boolean()
    .describe(
      'true when a bound was hit (candidate pool capped at ' +
      'maxCandidateRequestsConsideredPerGap or ranked list capped at maxEvidenceRequestsPerGap). ' +
      'Never a silent drop: truncation is always surfaced.',
    ),
}).strict();
export type NextBestEvidencePerGapSelection = z.infer<typeof NextBestEvidencePerGapSelectionSchema>;

// ============================================================================
// Selection result
// ============================================================================

export const NextBestEvidenceSelectionResultSchema = z.object({
  investigationId: InvestigationIdSchema,
  selections: z.array(NextBestEvidencePerGapSelectionSchema)
    .max(MAX_GAPS_PER_SELECTION_RUN)
    .describe(`Per-gap selections (max ${MAX_GAPS_PER_SELECTION_RUN} gaps per run, per NEXT_BEST_EVIDENCE_POLICY_V1).`),
  boundsPolicyVersion: z.literal(NEXT_BEST_EVIDENCE_POLICY_VERSION)
    .describe('Selection bounds policy version consumed.'),
  utilityPolicyVersion: z.literal(EVIDENCE_UTILITY_POLICY_VERSION)
    .describe('Evidence-utility policy version consumed for scoring/ranking.'),
  computedAt: ObservedTimeSchema
    .describe('When this ranked selection snapshot was produced.'),
  metadata: MetadataSchema.optional(),
}).strict();
export type NextBestEvidenceSelectionResult = z.infer<typeof NextBestEvidenceSelectionResultSchema>;