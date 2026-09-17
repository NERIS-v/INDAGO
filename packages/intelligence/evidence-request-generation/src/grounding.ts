// ============================================================================
// Grounding (Phase 5A-PR17, policy §5)
//
// PR17 does NOT trust opaque downstream ids. Before generating anything it
// re-runs the REAL certified runtime for the SAME closed-world inputs and
// requires deterministic equality with the supplied PR14/15/16 results. Any
// divergence is a typed CONTEXT_MISMATCH — never silent, never fabricating.
//
//  1. re-runs the REAL PR14 classifier (classifyGap) on the context and
//     requires equality on graphHoleId + contextSha256 + type + status +
//     reasonCodes;
//  2. re-runs the REAL PR15 generator (generateCompetingExplanations) and
//     requires equality on the set-level digest + classification projection +
//     explanation ids/types;
//  3. re-runs the REAL PR16 generator (generateErSplitExplanations) and
//     requires equality on case/version/hole + contextSha256 + explanation
//     ids/statuses.
// ============================================================================

import { classifyGap, GapClassificationError } from '@indago/gap-classification';
import type {
  GapClassificationInput,
  GapClassificationResult,
} from '@indago/gap-classification';
import {
  generateCompetingExplanations,
  CompetingExplanationError,
} from '@indago/competing-explanations';
import type { CompetingExplanationSet } from '@indago/contracts';
import {
  generateErSplitExplanations,
  ErSplitExplanationError,
} from '@indago/entity-split-analysis';
import type {
  ErSplitExplanationInput,
  ErSplitExplanationSet,
} from '@indago/entity-split-analysis';
import type { ObservedTime } from '@indago/contracts';

import { EvidenceRequestGenerationError, EvidenceRequestGenerationErrorCodes } from './errors.js';

function toGenError(label: string, err: unknown): EvidenceRequestGenerationError {
  const code =
    err instanceof EvidenceRequestGenerationError
      ? err.code
      : err instanceof GapClassificationError ||
          err instanceof CompetingExplanationError ||
          err instanceof ErSplitExplanationError
        ? err.code === 'UNSUPPORTED_POLICY'
          ? EvidenceRequestGenerationErrorCodes.UNSUPPORTED_POLICY
          : err.code === 'CONTEXT_MISMATCH' ||
              err.code === 'QUALIFIED_CANDIDATE_REQUIRED' ||
              err.code === 'INVALID_REFERENCE'
            ? EvidenceRequestGenerationErrorCodes.CONTEXT_MISMATCH
            : EvidenceRequestGenerationErrorCodes.INVALID_INPUT
        : EvidenceRequestGenerationErrorCodes.INVALID_INPUT;
  return new EvidenceRequestGenerationError(
    code,
    `${label}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

function assertClassificationEqual(
  recomputed: GapClassificationResult,
  supplied: GapClassificationResult,
): void {
  if (
    recomputed.graphHoleId !== supplied.graphHoleId ||
    recomputed.contextSha256 !== supplied.contextSha256 ||
    recomputed.type !== supplied.type ||
    recomputed.status !== supplied.status ||
    recomputed.reasonCodes.length !== supplied.reasonCodes.length ||
    recomputed.reasonCodes.some((code, i) => code !== supplied.reasonCodes[i])
  ) {
    throw new EvidenceRequestGenerationError(
      EvidenceRequestGenerationErrorCodes.CONTEXT_MISMATCH,
      'PR14 re-run equality failed: the supplied gapClassification does not bind to the context',
    );
  }
}

export interface GroundedEvidence {
  readonly context: GapClassificationInput;
  readonly gapClassification: GapClassificationResult;
  readonly competingExplanationSet: CompetingExplanationSet;
  /** Present only when the caller supplied a PR16 analysis that also passed. */
  readonly erSplit: ErSplitExplanationSet | undefined;
}

/**
 * Re-run the certified PR14/PR15/PR16 chain and require equality with the
 * supplied results. Returns the grounded inputs used for generation. Throws a
 * typed EvidenceRequestGenerationError on any divergence.
 */
export function groundChain(input: {
  readonly context: GapClassificationInput;
  readonly gapClassification: GapClassificationResult;
  readonly competingExplanationSet: CompetingExplanationSet;
  readonly erSplit?: { readonly input: ErSplitExplanationInput; readonly set: ErSplitExplanationSet };
  readonly computedAt: ObservedTime;
}): GroundedEvidence {
  if (
    input === null ||
    typeof input !== 'object' ||
    input.context === null ||
    typeof input.context !== 'object' ||
    input.gapClassification === null ||
    typeof input.gapClassification !== 'object' ||
    input.competingExplanationSet === null ||
    typeof input.competingExplanationSet !== 'object'
  ) {
    throw new EvidenceRequestGenerationError(
      EvidenceRequestGenerationErrorCodes.INVALID_INPUT,
      'context, gapClassification and competingExplanationSet are required',
    );
  }

  // 1) PR14 re-run.
  let recomputed: GapClassificationResult;
  try {
    recomputed = classifyGap(input.context);
  } catch (err) {
    throw toGenError('PR14 re-run failed', err);
  }
  assertClassificationEqual(recomputed, input.gapClassification);

  // 2) PR15 re-run.
  let competing: CompetingExplanationSet;
  try {
    competing = generateCompetingExplanations({
      context: input.context,
      gapClassification: input.gapClassification,
      competingExplanationPolicyVersion: 'v1',
      computedAt: input.computedAt,
    });
  } catch (err) {
    throw toGenError('PR15 re-run failed', err);
  }
  if (!competingSetsEqual(competing, input.competingExplanationSet)) {
    throw new EvidenceRequestGenerationError(
      EvidenceRequestGenerationErrorCodes.CONTEXT_MISMATCH,
      'PR15 re-run equality failed: the supplied competingExplanationSet does not match the recomputed set',
    );
  }

  // 3) PR16 re-run (optional).
  let erSplit: ErSplitExplanationSet | undefined;
  if (input.erSplit !== undefined) {
    const es = input.erSplit;
    if (es === null || typeof es !== 'object' || es.input === null || es.set === null) {
      throw new EvidenceRequestGenerationError(
        EvidenceRequestGenerationErrorCodes.INVALID_INPUT,
        'erSplit must carry both input and set',
      );
    }
    // The PR16 closed-world input must reference the SAME case/version and the
    // SAME PR14/PR15 outputs as the top-level chain (policy §5).
    if (
      es.input.context.caseId !== input.context.caseId ||
      es.input.context.graphVersionId !== input.context.graphVersionId
    ) {
      throw new EvidenceRequestGenerationError(
        EvidenceRequestGenerationErrorCodes.CONTEXT_MISMATCH,
        'PR16 input context case/version differs from the top-level context',
      );
    }
    assertClassificationEqual(es.input.gapClassification, input.gapClassification);
    if (
      es.input.competingExplanationSet !== undefined &&
      !competingSetsEqual(es.input.competingExplanationSet, input.competingExplanationSet)
    ) {
      throw new EvidenceRequestGenerationError(
        EvidenceRequestGenerationErrorCodes.CONTEXT_MISMATCH,
        'PR16 input competingExplanationSet differs from the top-level competingExplanationSet',
      );
    }
    let recomputedEr: ErSplitExplanationSet;
    try {
      recomputedEr = generateErSplitExplanations(es.input);
    } catch (err) {
      throw toGenError('PR16 re-run failed', err);
    }
    if (!erSplitSetsEqual(recomputedEr, es.set)) {
      throw new EvidenceRequestGenerationError(
        EvidenceRequestGenerationErrorCodes.CONTEXT_MISMATCH,
        'PR16 re-run equality failed: the supplied erSplit set does not match the recomputed set',
      );
    }
    erSplit = recomputedEr;
  }

  return {
    context: input.context,
    gapClassification: input.gapClassification,
    competingExplanationSet: input.competingExplanationSet,
    erSplit,
  };
}

/** Byte-stable set-level equality of two PR15 sets (excludes computedAt). */
function competingSetsEqual(a: CompetingExplanationSet, b: CompetingExplanationSet): boolean {
  if (
    a.caseId !== b.caseId ||
    a.graphVersionId !== b.graphVersionId ||
    a.graphHoleId !== b.graphHoleId ||
    a.contextSha256 !== b.contextSha256 ||
    a.classification.type !== b.classification.type ||
    a.classification.status !== b.classification.status ||
    a.classification.classificationPolicyVersion !== b.classification.classificationPolicyVersion ||
    a.explanations.length !== b.explanations.length
  ) {
    return false;
  }
  const aIds = a.explanations.map((e) => e.explanationId).sort();
  const bIds = b.explanations.map((e) => e.explanationId).sort();
  if (aIds.some((id, i) => id !== bIds[i])) return false;
  const aTypes = new Map(a.explanations.map((e) => [e.explanationId, e.type]));
  const bTypes = new Map(b.explanations.map((e) => [e.explanationId, e.type]));
  for (const [id, t] of aTypes) {
    if (bTypes.get(id) !== t) return false;
  }
  return true;
}

/** Byte-stable set-level equality of two PR16 sets (excludes generatedAt). */
function erSplitSetsEqual(a: ErSplitExplanationSet, b: ErSplitExplanationSet): boolean {
  if (
    a.caseId !== b.caseId ||
    a.graphVersionId !== b.graphVersionId ||
    a.graphHoleId !== b.graphHoleId ||
    a.contextSha256 !== b.contextSha256 ||
    a.explanations.length !== b.explanations.length
  ) {
    return false;
  }
  const aIds = a.explanations.map((e) => e.explanationId).sort();
  const bIds = b.explanations.map((e) => e.explanationId).sort();
  if (aIds.some((id, i) => id !== bIds[i])) return false;
  const aStatus = new Map(a.explanations.map((e) => [e.explanationId, e.explanationStatus]));
  const bStatus = new Map(b.explanations.map((e) => [e.explanationId, e.explanationStatus]));
  for (const [id, s] of aStatus) {
    if (bStatus.get(id) !== s) return false;
  }
  return true;
}