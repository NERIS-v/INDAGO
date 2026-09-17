// ============================================================================
// Competing Explanation Input (Phase 5A-PR15)
//
// The caller hands the generator EXACTLY ONE case's PR14 closed-world package
// (the same shape the classifier itself consumes) plus the REAL PR14 result
// for that candidate. PR15 NEVER reaches beyond this data: no database-wide
// retrieval, no semantic search, no graph traversal, no tool calls, no LLM.
//
// Context integrity is enforced by RE-RUNNING the deterministic classifier
// inside PR15 and requiring the recomputed classification to equal the
// supplied `gapClassification` (policy §7 — CONTEXT_MISMATCH otherwise).
//
// `computedAt` is a CALLER-SUPPLIED timestamp (policy §0/§37): the generator
// contains NO clock, NO random ids, NO environment state.
// ============================================================================

import type { ObservedTime } from '@indago/contracts';
import type {
  GapClassificationInput,
  GapClassificationResult,
} from '@indago/gap-classification';
import type { CompetingExplanationPolicyVersion } from '@indago/contracts';

/**
 * The authoritative, closed-world input to the competing-explanation
 * generator. `gapClassification` is the REAL PR14 result for
 * `context.qualifiedCandidate`; it MUST match the deterministic recomputation
 * performed inside the generator.
 */
export interface CompetingExplanationInput {
  /** The PR14 closed-world package (case, version, candidate, region, in-scope nodes/edges/observations, PR3 context). */
  readonly context: GapClassificationInput;
  /** The real PR14 output for `context.qualifiedCandidate` (bound by contextSha256/graphHoleId). */
  readonly gapClassification: GapClassificationResult;
  /** Competing-explanation policy version consumed ('v1'); anything else -> UNSUPPORTED_POLICY. */
  readonly competingExplanationPolicyVersion: CompetingExplanationPolicyVersion;
  /** Caller-supplied system time. NOT used as domain evidence (M-A12). */
  readonly computedAt: ObservedTime;
}