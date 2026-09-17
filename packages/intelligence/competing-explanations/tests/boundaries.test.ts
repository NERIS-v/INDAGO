import { describe, expect, it } from 'vitest';
import {
  CompetingExplanationError,
  CompetingExplanationErrorCodes,
  computeExplanationId,
  dedupeByExplanationId,
  explanationIdentityFor,
  generateCompetingExplanations,
} from '../src/index.js';
import type { CompetingExplanationInput, ExplanationSetContext } from '../src/index.js';
import {
  CASE_ID,
  CANDIDATE_A,
  ENTITY_A,
  ENTITY_B,
  GRAPH_VERSION_ID,
  HYP_SUPPORTING,
  NODE_A,
  NODE_B,
  OBSERVED_AT,
  OBS_LINK,
  OBS_OTHER,
  makeAtomic,
  makeCompetingInput,
  makeHypothesisContext,
  makeInput,
  makeObservation,
} from './helpers.js';

function expectErrorCode(act: () => void, code: string): void {
  try {
    act();
  } catch (err) {
    expect(err).toBeInstanceOf(CompetingExplanationError);
    expect((err as CompetingExplanationError).code).toBe(code);
    return;
  }
  throw new Error(`expected CompetingExplanationError with code ${code}, but no error was thrown`);
}

// ============================================================================
// PR15 boundary tests (policy §7 — typed failures, deterministic identity)
// ============================================================================

describe('generateCompetingExplanations — invalid input surfaces typed INVALID_INPUT', () => {
  it('rejects a null input', () => {
    expectErrorCode(
      () => generateCompetingExplanations(null as unknown as CompetingExplanationInput),
      CompetingExplanationErrorCodes.INVALID_INPUT,
    );
  });

  it('rejects a package missing the policy version', () => {
    const base = makeCompetingInput({
      candidate: { supportingHypothesisIds: [HYP_SUPPORTING] },
      hypothesisContext: makeHypothesisContext({ atomics: [makeAtomic(HYP_SUPPORTING)] }),
    });
    const broken = { ...base };
    delete (broken as { competingExplanationPolicyVersion?: string }).competingExplanationPolicyVersion;
    expectErrorCode(
      () => generateCompetingExplanations(broken),
      CompetingExplanationErrorCodes.INVALID_INPUT,
    );
  });

  it('rejects a package missing gapClassification', () => {
    const broken = {
      context: makeInput({ candidate: { supportingHypothesisIds: [HYP_SUPPORTING] } }),
      competingExplanationPolicyVersion: 'v1',
      computedAt: OBSERVED_AT,
    } as unknown as CompetingExplanationInput;
    expectErrorCode(
      () => generateCompetingExplanations(broken),
      CompetingExplanationErrorCodes.INVALID_INPUT,
    );
  });
});

describe('generateCompetingExplanations — policy version guard', () => {
  it('rejects unsupported policy versions with UNSUPPORTED_POLICY', () => {
    const base = makeCompetingInput({
      candidate: { supportingHypothesisIds: [HYP_SUPPORTING] },
      hypothesisContext: makeHypothesisContext({ atomics: [makeAtomic(HYP_SUPPORTING)] }),
    });
    expectErrorCode(
      () =>
        generateCompetingExplanations({
          ...base,
          competingExplanationPolicyVersion: 'v2' as 'v1',
        }),
      CompetingExplanationErrorCodes.UNSUPPORTED_POLICY,
    );
  });
});

describe('generateCompetingExplanations — context binding (CONTEXT_MISMATCH)', () => {
  function missingData(): CompetingExplanationInput {
    return makeCompetingInput({
      candidate: { supportingHypothesisIds: [HYP_SUPPORTING] },
      hypothesisContext: makeHypothesisContext({ atomics: [makeAtomic(HYP_SUPPORTING)] }),
    });
  }

  it('rejects a classification whose type does not match the recomputed one', () => {
    const primaryCtx = missingData(); // recomputes to MISSING_DATA
    const other = makeCompetingInput({
      candidate: { supportingObservationIds: [OBS_LINK] },
      observations: [makeObservation(OBS_LINK, { entityIds: [ENTITY_A, ENTITY_B] })],
    }); // recomputes to MISSING_COMPARISON
    expect(other.gapClassification.type).toBe('MISSING_COMPARISON');

    expectErrorCode(
      () => generateCompetingExplanations({ ...primaryCtx, gapClassification: other.gapClassification }),
      CompetingExplanationErrorCodes.CONTEXT_MISMATCH,
    );
  });

  it('rejects a classification bound to a different graph hole', () => {
    const primaryCtx = missingData();
    const differentHole = makeCompetingInput({
      candidate: {
        candidateId: 'candidate-sha-b',
        supportingHypothesisIds: [HYP_SUPPORTING],
      },
      hypothesisContext: makeHypothesisContext({ atomics: [makeAtomic(HYP_SUPPORTING)] }),
    });
    expectErrorCode(
      () => generateCompetingExplanations({ ...primaryCtx, gapClassification: differentHole.gapClassification }),
      CompetingExplanationErrorCodes.CONTEXT_MISMATCH,
    );
  });

  it('rejects an unqualified candidate (mapped from PR14 QUALIFIED_CANDIDATE_REQUIRED)', () => {
    const input = missingData();
    (input.context.qualifiedCandidate as { qualified: boolean }).qualified = false;
    expectErrorCode(
      () => generateCompetingExplanations(input),
      CompetingExplanationErrorCodes.CONTEXT_MISMATCH,
    );
  });
});

describe('generateCompetingExplanations — pure, reproducible, non-mutating', () => {
  it('returns byte-identical sets for repeated calls on the same frozen input', () => {
    const input = makeCompetingInput({
      candidate: {
        expectedRelationshipType: 'financial',
        supportingObservationIds: [OBS_LINK],
      },
      observations: [
        makeObservation(OBS_LINK, { entityIds: [ENTITY_A, ENTITY_B] }),
        makeObservation(OBS_OTHER, { entityIds: [ENTITY_A, ENTITY_B] }),
      ],
      hypothesisContext: makeHypothesisContext({ atomics: [makeAtomic(HYP_SUPPORTING)] }),
    });
    const snapshot = JSON.stringify(input);

    const first = generateCompetingExplanations(input);
    const second = generateCompetingExplanations(input);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(input)).toBe(snapshot); // no mutation of the input package
  });
});

describe('content-addressed identity + dedupe (policy §8/§15)', () => {
  const ctx: ExplanationSetContext = {
    caseId: CASE_ID,
    graphVersionId: GRAPH_VERSION_ID,
    graphHoleId: CANDIDATE_A,
    classificationType: 'MISSING_DATA',
    expectedRelationshipType: 'communication',
    policyVersion: 'v1',
  };
  const draft = {
    explanationType: 'MISSING_DATA_EXPLANATION' as const,
    basis: 'REQUIRED_INFORMATION_ABSENT' as const,
    supportingObservationIds: [OBS_LINK, OBS_OTHER],
    contradictingObservationIds: [],
    supportingHypothesisIds: [HYP_SUPPORTING],
    contradictingHypothesisIds: [],
    structuralSignalIds: [NODE_A, NODE_B],
  };

  it('is a 64-char hex content address', () => {
    const id = computeExplanationId(explanationIdentityFor(draft, ctx));
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is input-order independent', () => {
    const idA = computeExplanationId(explanationIdentityFor(draft, ctx));
    const idReordered = computeExplanationId(
      explanationIdentityFor({ ...draft, supportingObservationIds: [OBS_OTHER, OBS_LINK] }, ctx),
    );
    expect(idReordered).toBe(idA);
  });

  it('changes when the support set differs', () => {
    const idA = computeExplanationId(explanationIdentityFor(draft, ctx));
    const idDropped = computeExplanationId(
      explanationIdentityFor({ ...draft, supportingObservationIds: [OBS_LINK] }, ctx),
    );
    expect(idDropped).not.toBe(idA);
  });

  it('changes when the classification the set binds to differs', () => {
    const idA = computeExplanationId(explanationIdentityFor(draft, ctx));
    const idBoundElsewhere = computeExplanationId(
      explanationIdentityFor(draft, { ...ctx, classificationType: 'MISSING_COMPARISON' }),
    );
    expect(idBoundElsewhere).not.toBe(idA);
  });

  it('collapses duplicate identities (first occurrence wins)', () => {
    const candidates = [
      { explanationId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', order: 1 },
      { explanationId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', order: 2 },
      { explanationId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', order: 3 },
    ];
    const distinct = dedupeByExplanationId(candidates);
    expect(distinct).toEqual([candidates[0], candidates[2]]);
  });
});