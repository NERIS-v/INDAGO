// ============================================================================
// PR17 adversarial + typed-failure surface (policy §10)
//
// PR17 fails CLOSED on any grounding divergence (CONTEXT_MISMATCH), never
// silently. Unsupported policy and malformed input are typed. INSUFFICIENT
// CONTEXT is a valid empty result, never an error.
// ============================================================================

import { describe, it, expect } from 'vitest';

import {
  generateCandidateEvidenceRequests,
  EvidenceRequestGenerationError,
  EvidenceRequestGenerationErrorCodes,
} from '../src/index.js';
import { makePr17Input, makeWorld, CASE_ID, GRAPH_VERSION_ID } from './helpers.js';

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    expect('no throw').toBe('throws');
  } catch (err) {
    expect(err).toBeInstanceOf(EvidenceRequestGenerationError);
    expect((err as EvidenceRequestGenerationError).code).toBe(code);
  }
}

describe('PR17 — unsupported policy', () => {
  it('rejects a non-v1 policyVersion with UNSUPPORTED_POLICY', () => {
    expectCode(
      () => generateCandidateEvidenceRequests({ ...makePr17Input(), policyVersion: 'v2' as never }),
      EvidenceRequestGenerationErrorCodes.UNSUPPORTED_POLICY,
    );
  });
});

describe('PR17 — invalid input', () => {
  it('rejects a missing computedAt with INVALID_INPUT', () => {
    const input = makePr17Input();
    expectCode(
      () => generateCandidateEvidenceRequests({ ...input, computedAt: undefined as never }),
      EvidenceRequestGenerationErrorCodes.INVALID_INPUT,
    );
  });

  it('rejects a missing gapId with INVALID_INPUT', () => {
    const input = makePr17Input();
    expectCode(
      () => generateCandidateEvidenceRequests({ ...input, gapId: '' as never }),
      EvidenceRequestGenerationErrorCodes.INVALID_INPUT,
    );
  });
});

describe('PR17 — grounding: CONTEXT_MISMATCH', () => {
  it('rejects a PR15 set that no longer matches the recomputed set', () => {
    const input = makePr17Input();
    const tampered = { ...input.competingExplanationSet, graphHoleId: 'another-hole' };
    expectCode(
      () => generateCandidateEvidenceRequests({ ...input, competingExplanationSet: tampered }),
      EvidenceRequestGenerationErrorCodes.CONTEXT_MISMATCH,
    );
  });

  it('rejects a PR16 set with an invented explanation id', () => {
    const input = makePr17Input();
    if (!input.erSplit) {
      expect(true).toBe(true);
      return;
    }
    const tampered = {
      ...input.erSplit,
      set: {
        ...input.erSplit.set,
        explanations: input.erSplit.set.explanations.map((e, i) =>
          i === 0 ? { ...e, explanationId: 'f'.repeat(64) } : e,
        ),
      },
    };
    expectCode(
      () => generateCandidateEvidenceRequests({ ...input, erSplit: tampered }),
      EvidenceRequestGenerationErrorCodes.CONTEXT_MISMATCH,
    );
  });

  it('rejects a PR16 input whose case differs from the top-level context', () => {
    const input = makePr17Input();
    if (!input.erSplit) {
      expect(true).toBe(true);
      return;
    }
    const tampered = {
      ...input.erSplit,
      input: {
        ...input.erSplit.input,
        context: { ...input.erSplit.input.context, caseId: CASE_ID === 'x' ? 'y' : 'some-other-case' },
      },
    };
    expectCode(
      () => generateCandidateEvidenceRequests({ ...input, erSplit: tampered }),
      EvidenceRequestGenerationErrorCodes.CONTEXT_MISMATCH,
    );
  });
});

describe('PR17 — INSUFFICIENT_CONTEXT is a valid empty result', () => {
  it('returns an empty candidate set (not an error) when there is no grounding signal', () => {
    const world = makeWorld({ observations: [], hypothesisContext: emptyHypCtx(), includeErSplit: false });
    const result = generateCandidateEvidenceRequests({
      gapId: '550e8400-e29b-41d4-a716-446655440500',
      context: world.context,
      gapClassification: world.gapClassification,
      competingExplanationSet: world.competingExplanationSet,
      policyVersion: 'v1',
      computedAt: { value: '2024-07-01T00:00:00.000Z', precision: 'exact' },
    });
    expect(result.candidateRequests).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});

function emptyHypCtx() {
  return {
    policyVersion: 'v1',
    caseId: CASE_ID,
    graphVersionId: GRAPH_VERSION_ID,
    atomicOrder: { evidenceSupport: 'desc', structuralRelevance: 'desc', derivedHypothesisId: 'asc' },
    atomic: [],
    groups: [],
    accounting: {
      inputRelationHypotheses: 0,
      inputEntityHypotheses: 0,
      atomicHypotheses: 0,
      components: 0,
      groups: 0,
      truncatedGroups: 0,
      isolatedAtomics: 0,
      totalCanonicalNodesAcrossGroups: 0,
    },
  };
}