import { z } from 'zod';
import { MAX_CANDIDATE_REQUESTS_CONSIDERED_PER_GAP } from './next-best-evidence-policy.js';

// ============================================================================
// Candidate Evidence Request Generation Bounds Policy — V1 (Phase 5A-PR17 Freeze)
//
// Freezes the deterministic limits of PR17 **generation** of candidate evidence
// requests. This is the generator of the seam that PR10's frozen
// `selectNextBestEvidence` CONSUMES (`input.gaps[].candidateRequests`). PR17
// PROPOSES candidates; it does NOT rank (PR18), does NOT score utility, does NOT
// acquire, does NOT persist, does NOT authorize, does NOT resolve entities, does
// NOT invoke LLMs.
//
// Bounds discipline (identical to next-best-evidence-policy.ts):
//   - Every bound has a ceiling a future runtime MUST NOT silently exceed.
//     PR17 generation bounds are deliberately STRICTER than or EQUAL to the
//     PR10 consumer's `consider` ceiling so that generation can never widen the
//     selection's own bound (see §3 parity in
//     docs/architecture/pr17-evidence-request-generation.md).
//   - A bound being hit is surfaced as an explicit `truncated` signal in the
//     generation result — NEVER a silent drop.
//
// Identity discipline (content-addressed, deterministic):
//   - Candidate identity REUSES the frozen PR10 identity function
//     `canonicalizeNextBestEvidenceRequest` (canonicalizeDeterministic over
//     gapId + evidenceType + discriminatesAmongIds + hypothesisIds). PR17 does
//     NOT define a parallel identity key. Byte-identical ground truth => the
//     same canonical key as PR10's consumer expects.
// ============================================================================

/** Version of the PR17 generation bounds policy (PR17 owns this). */
export const EVIDENCE_REQUEST_GENERATION_POLICY_VERSION = 'v1' as const;
export type EvidenceRequestGenerationPolicyVersion =
  typeof EVIDENCE_REQUEST_GENERATION_POLICY_VERSION;

/** Total candidate evidence requests generated across a run of PR17. */
export const MAX_GENERATED_CANDIDATE_REQUESTS_PER_GAP = 10;

/** Candidate evidence requests generated for one explanation pair (discrimination target). */
export const MAX_GENERATED_CANDIDATE_REQUESTS_PER_EXPLANATION_PAIR = 5;

/** Maximum total candidate evidence requests generated in one run. */
export const MAX_GENERATED_CANDIDATE_REQUESTS_PER_RUN = 50;

/**
 * Ceiling of the PR10 consumer's candidate-request consideration per gap
 * (frozen by PR10). PR17 generation per-gap MUST NOT exceed the consumer's own
 * consider ceiling — generation is the stricter side of the pair. If this
 * invariant is ever violated it is a CONTEXT_MISMATCH surfaced typed-failure,
 * never a silent overflow (PR10 owns the consume-side bound).
 */
export const MAX_P10_CONSIDER_CEILING = MAX_CANDIDATE_REQUESTS_CONSIDERED_PER_GAP;

/** Dedup rule: canonical identity function from PR10, never text. */
export const EVIDENCE_REQUEST_GENERATION_DEDUP_RULE =
  'CANONICAL_NEXT_BEST_EVIDENCE_REQUEST_IDENTITY' as const;

/** Successful generation result bounds policy (frozen V1). */
export const EvidenceRequestGenerationBoundsSchema = z.object({
  version: z.literal(EVIDENCE_REQUEST_GENERATION_POLICY_VERSION)
    .describe('PR17 candidate evidence request generation policy version.'),
  maxGeneratedCandidateRequestsPerGap: z.literal(MAX_GENERATED_CANDIDATE_REQUESTS_PER_GAP)
    .describe('Maximum candidate requests generated for one gap in one run.'),
  maxGeneratedCandidateRequestsPerExplanationPair: z.literal(MAX_GENERATED_CANDIDATE_REQUESTS_PER_EXPLANATION_PAIR)
    .describe('Maximum candidate requests generated for one explanation pair (discrimination target).'),
  maxGeneratedCandidateRequestsPerRun: z.literal(MAX_GENERATED_CANDIDATE_REQUESTS_PER_RUN)
    .describe('Maximum total candidate requests generated in one run.'),
  p10ConsiderCeiling: z.literal(MAX_P10_CONSIDER_CEILING)
    .describe('Frozen PR10 consumer consider-ceiling; PR17 generation must never exceed it.'),
  deduplicationRule: z.literal(EVIDENCE_REQUEST_GENERATION_DEDUP_RULE)
    .describe('Identity = canonicalizeNextBestEvidenceRequest (PR10 frozen), never description text.'),
  truncatedWhenBoundHit: z.literal(true)
    .describe('A bound being hit is surfaced as `truncated` in the generation result, never a silent drop.'),
}).strict();
export type EvidenceRequestGenerationBounds = z.infer<typeof EvidenceRequestGenerationBoundsSchema>;

/** The single authoritative frozen V1 evidence-request-generation bounds policy. */
export const EVIDENCE_REQUEST_GENERATION_POLICY_V1: EvidenceRequestGenerationBounds = {
  version: EVIDENCE_REQUEST_GENERATION_POLICY_VERSION,
  maxGeneratedCandidateRequestsPerGap: MAX_GENERATED_CANDIDATE_REQUESTS_PER_GAP,
  maxGeneratedCandidateRequestsPerExplanationPair: MAX_GENERATED_CANDIDATE_REQUESTS_PER_EXPLANATION_PAIR,
  maxGeneratedCandidateRequestsPerRun: MAX_GENERATED_CANDIDATE_REQUESTS_PER_RUN,
  p10ConsiderCeiling: MAX_P10_CONSIDER_CEILING,
  deduplicationRule: EVIDENCE_REQUEST_GENERATION_DEDUP_RULE,
  truncatedWhenBoundHit: true,
};
