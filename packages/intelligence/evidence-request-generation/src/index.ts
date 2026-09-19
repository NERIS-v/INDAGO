// ============================================================================
// @indago/evidence-request-generation — candidate evidence request generation
//
// Phase 5A-PR17 runtime (policy FROZEN V1). Pure deterministic functions over a
// qualified Gap + its REAL PR14 classification + REAL PR15 competing
// explanations + (optionally) REAL PR16 ER-split analysis.
//
// Grounding discipline (policy §5): PR17 re-runs the REAL certified runtime for
// the SAME inputs and requires deterministic equality with the supplied
// PR14/15/16 results. Any divergence is a typed CONTEXT_MISMATCH — never
// silent, never fabricating.
//
// Bounded generation (policy §3): MAX_GENERATED_CANDIDATE_REQUESTS_PER_GAP (10),
// MAX_GENERATED_CANDIDATE_REQUESTS_PER_EXPLANATION_PAIR (5), and
// MAX_GENERATED_CANDIDATE_REQUESTS_PER_RUN (50). A bound being hit is reported
// as `truncated` in the result — never a silent drop.
//
// Identity + dedup (policy §4): REUSES PR10's frozen
// `canonicalizeNextBestEvidenceRequest` identity key. A candidate emitted here
// slots byte-identically into PR10's `NextBestEvidenceCandidateSchema`.
//
// PR17 PROPOSES candidates. It does NOT rank (PR18), does NOT score utility
// (PR18), does NOT acquire/persist/authorize (lifecycle PR), does NOT resolve
// entities, does NOT transform hypotheses, does NOT invoke LLMs.
// ============================================================================

import type { ObservedTime } from '@indago/contracts';
import type {
  GapClassificationInput,
  GapClassificationResult,
} from '@indago/gap-classification';
import type { CompetingExplanationSet } from '@indago/contracts';
import type {
  ErSplitExplanationInput,
  ErSplitExplanationSet,
} from '@indago/entity-split-analysis';

import { EVIDENCE_REQUEST_GENERATION_POLICY_VERSION } from './generation-policy.js';
import type { EvidenceRequestGenerationPolicyVersion } from './generation-policy.js';
import { groundChain } from './grounding.js';
import { generateCandidates } from './generate.js';
import type { ExistingEvidenceSummary, GenerationResult } from './generate.js';
import {
  EvidenceRequestGenerationError,
  EvidenceRequestGenerationErrorCodes,
} from './errors.js';

// ---- Typed failures ----
export { EvidenceRequestGenerationError, EvidenceRequestGenerationErrorCodes } from './errors.js';
export type { EvidenceRequestGenerationErrorCode } from './errors.js';

// ---- Frozen bounds policy (re-exported) ----
export {
  EVIDENCE_REQUEST_GENERATION_POLICY_VERSION,
  EVIDENCE_REQUEST_GENERATION_POLICY_V1,
  MAX_GENERATED_CANDIDATE_REQUESTS_PER_GAP,
  MAX_GENERATED_CANDIDATE_REQUESTS_PER_EXPLANATION_PAIR,
  MAX_GENERATED_CANDIDATE_REQUESTS_PER_RUN,
  MAX_P10_CONSIDER_CEILING,
  EVIDENCE_REQUEST_GENERATION_DEDUP_RULE,
} from './generation-policy.js';
export type {
  EvidenceRequestGenerationBounds,
  EvidenceRequestGenerationPolicyVersion,
  DiscriminationKind,
} from './generation-policy.js';

// ---- Identity ----
export { canonicalRequestKey, hypothesisIdsFromDerivedIds } from './identity.js';
export type { CandidateIdentityInput } from './identity.js';

// ---- Result types ----
export type {
  CandidateEvidenceRequest,
  GenerationResult,
  GenerationAccounting,
  TruncatedReason,
} from './generate.js';
export type { ExistingEvidenceSummary } from './generate.js';

/**
 * The authoritative, closed-world input to PR17. Every id belongs to one case;
 * all supplied results are REAL certified outputs and must bind to `context`
 * (re-verified by re-running PR14/PR15/PR16, policy §5).
 *
 * `competingExplanationSet` is REQUIRED (a valid empty set is legal and yields
 * an empty candidate result when there is no grounding signal). `erSplit` is
 * OPTIONAL — supply it only when PR16 ran; it carries both the PR16 input and
 * the real PR16 output.
 */
export interface EvidenceRequestGenerationInput {
  /** The PR14 closed-world package (single source of truth for case/version/hole). */
  readonly context: GapClassificationInput;
  /** The real PR14 output for `context.qualifiedCandidate` (re-run equality bound). */
  readonly gapClassification: GapClassificationResult;
  /** The real PR15 output for the same candidate (may be a valid empty set). */
  readonly competingExplanationSet: CompetingExplanationSet;
  /** The real PR16 analysis (input + output) for the same candidate (optional). */
  readonly erSplit?: {
    readonly input: ErSplitExplanationInput;
    readonly set: ErSplitExplanationSet;
  };
  /** Existing evidence summaries for the deterministic exact-coverage exclusion (optional). */
  readonly knownEvidence?: readonly ExistingEvidenceSummary[];
  /** The investigative gap UUID this candidate set addresses (PR10 seam). */
  readonly gapId: string;
  /** PR17 policy version consumed ('v1'); anything else -> UNSUPPORTED_POLICY. */
  readonly policyVersion: EvidenceRequestGenerationPolicyVersion;
  /** Caller-supplied system time. NOT used as domain evidence (M-A12). */
  readonly computedAt: ObservedTime;
}

/**
 * Generate the bounded, deterministic, grounded set of candidate evidence
 * requests for one gap (policy §1–§12). Pure function; no LLM, no ranking, no
 * lifecycle, no persistence, no acquisition.
 *
 * Throws a typed EvidenceRequestGenerationError on invalid input / unsupported
 * policy / grounding mismatch. A genuine absence of grounded explanation signal
 * returns a VALID empty result (INSUFFICIENT_CONTEXT semantics).
 */
export function generateCandidateEvidenceRequests(
  input: EvidenceRequestGenerationInput,
): GenerationResult {
  if (input === null || typeof input !== 'object') {
    throwInvalid('input must be an object');
  }
  if (input.policyVersion !== EVIDENCE_REQUEST_GENERATION_POLICY_VERSION) {
    throw new EvidenceRequestGenerationError(
      EvidenceRequestGenerationErrorCodes.UNSUPPORTED_POLICY,
      `unsupported policyVersion: ${String(input.policyVersion)}`,
    );
  }
  if (
    input.computedAt === null ||
    typeof input.computedAt !== 'object' ||
    typeof (input.computedAt as { value?: unknown }).value !== 'string'
  ) {
    throwInvalid('computedAt is required (caller-supplied, no wall clock)');
  }
  if (typeof input.gapId !== 'string' || input.gapId.length === 0) {
    throwInvalid('gapId is required');
  }

  const evidence = groundChain({
    context: input.context,
    gapClassification: input.gapClassification,
    competingExplanationSet: input.competingExplanationSet,
    erSplit: input.erSplit,
    computedAt: input.computedAt,
  });

  return generateCandidates({
    gapId: input.gapId,
    evidence,
    knownEvidence: input.knownEvidence,
    computedAt: input.computedAt,
  });
}

function throwInvalid(message: string): never {
  throw new EvidenceRequestGenerationError(EvidenceRequestGenerationErrorCodes.INVALID_INPUT, message);
}