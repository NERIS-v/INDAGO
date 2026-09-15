import { z } from 'zod';

// ============================================================================
// Next-Best-Evidence Selection Bounds Policy — V1 (Phase 5A-PR10 Freeze)
//
// Freezes the deterministic limits, deduplication semantics, and ranking order
// of PR10 selection. POLICY ONLY — no selection runtime is implemented here.
//
// Bounds discipline (mirrors graph-hole-policy.ts):
//   - Every bound has a ceiling the future runtime MUST NOT silently exceed.
//   - A bound being hit is reported as an explicit truncation/limit signal in
//     the selection result (NextBestEvidenceSelection result carries
//     `truncated`), never a silent drop.
// ============================================================================

/** Version of the PR10 selection bounds policy (PR10 owns this). */
export const NEXT_BEST_EVIDENCE_POLICY_VERSION = 'v1' as const;
export type NextBestEvidencePolicyVersion = typeof NEXT_BEST_EVIDENCE_POLICY_VERSION;

/** Maximum ranked evidence requests produced for one gap in one selection pass. */
export const MAX_EVIDENCE_REQUESTS_PER_GAP = 5;

/** Maximum gaps processed in one selection run. */
export const MAX_GAPS_PER_SELECTION_RUN = 10;

/**
 * Maximum candidate requests considered before ranking, per gap.
 * A higher number bounds any candidate-generation/expansion work; the bound
 * prevents unbounded abuse while keeping selection useful.
 */
export const MAX_CANDIDATE_REQUESTS_CONSIDERED_PER_GAP = 25;

/** The dedup rule for PR10 selection. */
export const NEXT_BEST_EVIDENCE_DEDUP_RULE = 'CANONICAL_EVIDENCE_REQUEST_IDENTITY' as const;

/**
 * Canonical inputs of the evidence-request identity (dedup + tie-break key).
 * NOT the description text.
 */
export const NextBestEvidenceDedupInputSchema = z.enum([
  'gapId',
  'evidenceType',
  'discriminatesAmongIds',
  'hypothesisIds',
]);
export type NextBestEvidenceDedupInput = z.infer<typeof NextBestEvidenceDedupInputSchema>;

export const NEXT_BEST_EVIDENCE_DEDUP_INPUTS: readonly NextBestEvidenceDedupInput[] = [
  'gapId',
  'evidenceType',
  'discriminatesAmongIds',
  'hypothesisIds',
];

/** Deterministic deduplication semantics (frozen). */
export const NextBestEvidenceSelectionBoundsSchema = z.object({
  version: z.literal(NEXT_BEST_EVIDENCE_POLICY_VERSION)
    .describe('PR10 selection bounds policy version.'),
  maxEvidenceRequestsPerGap: z.number().int().positive()
    .describe('Maximum ranked evidence requests produced for one gap in one selection pass.'),
  maxGapsPerSelectionRun: z.number().int().positive()
    .describe('Maximum gaps processed in one selection run.'),
  maxCandidateRequestsConsideredPerGap: z.number().int().positive()
    .describe('Maximum candidate requests considered before ranking, per gap.'),
  deduplicationRule: z.literal(NEXT_BEST_EVIDENCE_DEDUP_RULE)
    .describe('Deduplication key = canonical evidence-request identity (never description text).'),
  dedupIdentityInputs: z.array(NextBestEvidenceDedupInputSchema)
    .describe('Canonical inputs of the evidence-request identity. Deterministic and order-independent (ids sorted/deduped before canonicalization).'),
  rankingOrder: z.array(z.enum([
    'SCORE_DESC',
    'EXPECTED_INFORMATION_GAIN_DESC',
    'RELEVANCE_DESC',
    'FEASIBILITY_DESC',
    'CANONICAL_REQUEST_KEY_ASC',
  ])).length(5)
    .describe('Deterministic ranking/tie-breaking order (declared by EVIDENCE_UTILITY_POLICY_V1.rankOrder).'),
  truncatedWhenBoundHit: z.literal(true)
    .describe('A bound being hit is surfaced as `truncated` in the selection result, never a silent drop.'),
}).strict();
export type NextBestEvidenceSelectionBounds = z.infer<typeof NextBestEvidenceSelectionBoundsSchema>;

/** The single authoritative frozen V1 next-best-evidence bounds policy. */
export const NEXT_BEST_EVIDENCE_POLICY_V1: NextBestEvidenceSelectionBounds = {
  version: NEXT_BEST_EVIDENCE_POLICY_VERSION,
  maxEvidenceRequestsPerGap: MAX_EVIDENCE_REQUESTS_PER_GAP,
  maxGapsPerSelectionRun: MAX_GAPS_PER_SELECTION_RUN,
  maxCandidateRequestsConsideredPerGap: MAX_CANDIDATE_REQUESTS_CONSIDERED_PER_GAP,
  deduplicationRule: NEXT_BEST_EVIDENCE_DEDUP_RULE,
  dedupIdentityInputs: [...NEXT_BEST_EVIDENCE_DEDUP_INPUTS],
  rankingOrder: [
    'SCORE_DESC',
    'EXPECTED_INFORMATION_GAIN_DESC',
    'RELEVANCE_DESC',
    'FEASIBILITY_DESC',
    'CANONICAL_REQUEST_KEY_ASC',
  ],
  truncatedWhenBoundHit: true,
};