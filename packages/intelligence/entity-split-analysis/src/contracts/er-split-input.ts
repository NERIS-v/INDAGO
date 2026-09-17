// ============================================================================
// ER-Split Explanation Input (Phase 5A-PR16)
//
// The caller hands the generator EXACTLY ONE case's PR14 closed-world package
// (the same shape the classifier itself consumes) plus:
//   - the REAL PR14 result for that candidate (required),
//   - the REAL PR15 competing-explanation set for that candidate (optional,
//     gating/association only — PR16 never modifies it),
//   - the bounded M-A08 CandidatePair slice, M-A09 EntityHypothesis slice and
//     the M-A07 EntityMentionCandidate universe those pairs reference
//     (READ-ONLY reuse — PR16 never writes hypothesis/pair/canonical state).
//
// PR16 NEVER reaches beyond this data: no database-wide retrieval, no semantic
// search, no graph traversal, no tool calls, no LLM.
//
// Context integrity is enforced by RE-RUNNING the deterministic classifier
// inside PR16 and requiring equality with the supplied `gapClassification`
// (policy §7 — CONTEXT_MISMATCH otherwise). The PR15 set binds when its
// embedded classification projection equals the recomputed one.
//
// `computedAt` is a CALLER-SUPPLIED timestamp (policy §0): the generator
// contains NO clock, NO random ids, NO environment state.
// ============================================================================

import type { ObservedTime } from '@indago/contracts';
import type {
  CandidatePair,
  CompetingExplanationSet,
  EntityHypothesis,
  EntityMentionCandidate,
  ErSplitExplanationPolicyVersion,
} from '@indago/contracts';
import type {
  GapClassificationInput,
  GapClassificationResult,
} from '@indago/gap-classification';

/**
 * The authoritative, closed-world input to the ER-split explanation generator.
 * `gapClassification` is the REAL PR14 result for `context.qualifiedCandidate`;
 * it MUST match the deterministic recomputation performed inside the generator.
 * All candidate/hypothesis ids belong to the same (caseId, graphVersionId).
 */
export interface ErSplitExplanationInput {
  /** The PR14 closed-world package (case, version, candidate, region, in-scope nodes/edges/observations, PR3 context). */
  readonly context: GapClassificationInput;
  /** The real PR14 output for `context.qualifiedCandidate` (bound by classification digest/graphHoleId). */
  readonly gapClassification: GapClassificationResult;
  /** The real PR15 output for the same candidate (optional; gating/association only). */
  readonly competingExplanationSet?: CompetingExplanationSet;
  /** Bounded M-A08 pair slice this analysis is restricted to (read-only; ≤ MAX_CANDIDATE_PAIRS_PER_QUERY). */
  readonly candidatePairs: readonly CandidatePair[];
  /** Bounded M-A09 hypothesis slice this analysis is restricted to (read-only; ≤ MAX_ENTITY_HYPOTHESES_PER_QUERY). */
  readonly entityHypotheses: readonly EntityHypothesis[];
  /** M-A07 universe every referenced candidate id must resolve to (read-only). */
  readonly candidateUniverse: readonly EntityMentionCandidate[];
  /** ER-split policy version consumed ('v1'); anything else -> UNSUPPORTED_POLICY. */
  readonly erSplitPolicyVersion: ErSplitExplanationPolicyVersion;
  /** Caller-supplied system time. NOT used as domain evidence (M-A12). */
  readonly computedAt: ObservedTime;
}