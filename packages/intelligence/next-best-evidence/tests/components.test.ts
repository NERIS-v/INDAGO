// ============================================================================
// Utility component derivation tests (PR10 §9–§13, frozen formula §10)
// ============================================================================

import { describe, expect, it } from 'vitest';
import { EVIDENCE_UTILITY_POLICY_V1 } from '@indago/contracts';
import {
  computeExpectedInformationGain,
  computeEvidenceRelevance,
  computeEvidenceFeasibility,
  computeEvidenceCost,
  computeEvidenceUtility,
  type EvidenceUtilityComponents,
} from '../src/components.js';
import { normalizeScore } from '../src/determinism.js';
import {
  NextBestEvidenceError,
  NEXT_BEST_EVIDENCE_ERROR_CODE,
} from '../src/errors.js';
import { H1, H2, H3, INVENTED_H } from './fixtures.js';

const UTILITY_COMPONENTS = ['expectedInformationGain', 'relevance', 'feasibility', 'cost'] as const;
type UtilityComponentName = (typeof UTILITY_COMPONENTS)[number];

const VALID_UTILITY = { expectedInformationGain: 0.5, relevance: 0.5, feasibility: 0.5, cost: 0.5 };

function utilityErrorCode(input: EvidenceUtilityComponents): NextBestEvidenceError | null {
  try {
    computeEvidenceUtility(input);
  } catch (error) {
    if (error instanceof NextBestEvidenceError) return error;
    throw error;
  }
  return null;
}

describe('frozen utility policy integrity', () => {
  it('weights sum to exactly 1.0 and are in [0,1]', () => {
    const w = EVIDENCE_UTILITY_POLICY_V1.weights;
    expect(w.expectedInformationGain + w.relevance + w.feasibility + w.effectiveCost).toBe(1);
    expect(w.expectedInformationGain).toBe(0.4);
    expect(w.relevance).toBe(0.25);
    expect(w.feasibility).toBe(0.2);
    expect(w.effectiveCost).toBe(0.15);
  });
});

describe('computeExpectedInformationGain', () => {
  const all = [H1, H2, H3];

  it('is exactly 0 without an explicit discrimination target (fail-closed)', () => {
    expect(computeExpectedInformationGain({ targetUuids: [], allCompetingUuids: all, signalsByUuid: new Map() })).toBe(0);
  });

  it('treats a target with zero supplied signals as full uncertainty + unresolved', () => {
    const eig = computeExpectedInformationGain({
      targetUuids: [INVENTED_H],
      allCompetingUuids: all,
      signalsByUuid: new Map(),
    });
    expect(eig).toBe(0.666667); // 0.5*(1/3) + 0.3*1 + 0.2*1
  });

  it('blends breadth, uncertainty and unresolved signals deterministically', () => {
    const signals = new Map([
      [H1, { supporting: 1, contradicting: 0 }],
      [H2, { supporting: 0, contradicting: 0 }],
      [H3, { supporting: 1, contradicting: 0 }],
    ]);
    // H1: uncertainty 0, resolved. H2: uncertainty 1, unresolved.
    const eig = computeExpectedInformationGain({ targetUuids: [H1, H2], allCompetingUuids: all, signalsByUuid: signals });
    const expected = normalizeScore(0.5 * (2 / 3) + 0.3 * 0.5 + 0.2 * 0.5);
    expect(eig).toBe(expected);
  });
});

describe('computeEvidenceRelevance', () => {
  it('is 0 for a targetless request', () => {
    expect(computeEvidenceRelevance({
      targetUuids: [],
      gapExpectationUuids: [H1],
      allCompetingUuids: [H1, H2],
      groundedObservationCount: 1,
      totalCandidateObservationRefs: 1,
      perTargetTemporalFit: [],
    })).toBe(0);
  });

  it('treats ungrounded observation assertions conservatively', () => {
    const relevance = computeEvidenceRelevance({
      targetUuids: [H1],
      gapExpectationUuids: [H1],
      allCompetingUuids: [H1, H2],
      groundedObservationCount: 0,
      totalCandidateObservationRefs: 5,
      perTargetTemporalFit: [],
    });
    const expected = normalizeScore(0.45 * 1 + 0.25 * 0.5 + 0.2 * 0 + 0.1 * 0);
    expect(relevance).toBe(expected);
  });
});

describe('feasibility and cost baselines', () => {
  it('applies the neutral missing-data default (never maximum)', () => {
    expect(computeEvidenceFeasibility('DOCUMENT')).toBe(0.64); // 0.7*0.7 + 0.3*0.5
    expect(computeEvidenceCost('DOCUMENT')).toBe(0.43); // 0.7*0.4 + 0.3*0.5
  });

  it('blends caller-supplied availability/accessibility deterministically', () => {
    expect(computeEvidenceFeasibility('DOCUMENT', new Map([['DOCUMENT', 1]]))).toBe(0.79);
    expect(computeEvidenceCost('DIGITAL', new Map([['DIGITAL', 1]]))).toBe(0.245);
    expect(computeEvidenceCost('DIGITAL', new Map([['DIGITAL', 0]]))).toBe(0.545);
  });
});

describe('computeEvidenceUtility (frozen formula)', () => {
  it('maximizes score when cost is zero', () => {
    const utility = computeEvidenceUtility({ expectedInformationGain: 1, relevance: 1, feasibility: 1, cost: 0 });
    expect(utility.score).toBe(1);
    expect(utility.eig).toBe(utility.expectedInformationGain);
  });

  it('inverts cost exactly (effectiveCost = 1 - cost)', () => {
    const utility = computeEvidenceUtility({ expectedInformationGain: 1, relevance: 1, feasibility: 1, cost: 1 });
    expect(utility.score).toBe(0.85); // no cost component contribution
  });

  it('recomputes score from validated components following round6 precision', () => {
    const utility = computeEvidenceUtility({ expectedInformationGain: 0.583333, relevance: 0.816667, feasibility: 0.64, cost: 0.43 });
    const score = normalizeScore(0.4 * 0.583333 + 0.25 * 0.816667 + 0.2 * 0.64 + 0.15 * 0.57);
    expect(utility.score).toBe(0.651);
    expect(score).toBeGreaterThan(0.65);
  });

  it('throws a typed NAN_OR_INFINITE_COMPONENT error on non-finite components (never silently produces NaN)', () => {
    const first = utilityErrorCode({ expectedInformationGain: Number.NaN, relevance: 1, feasibility: 1, cost: 0 });
    expect(first).not.toBeNull();
    expect(first!.code).toBe(NEXT_BEST_EVIDENCE_ERROR_CODE.NAN_OR_INFINITE_COMPONENT);
    expect(first!.details).toMatchObject({
      component: 'expectedInformationGain',
      value: Number.NaN,
      expected: 'finite number in [0, 1]',
      category: 'NAN_OR_INFINITE',
    });

    const second = utilityErrorCode({ expectedInformationGain: Number.POSITIVE_INFINITY, relevance: 1, feasibility: 1, cost: 0 });
    expect(second).not.toBeNull();
    expect(second!.code).toBe(NEXT_BEST_EVIDENCE_ERROR_CODE.NAN_OR_INFINITE_COMPONENT);
  });

  it('throws a typed OUT_OF_RANGE_COMPONENT error on out-of-range components', () => {
    const high = utilityErrorCode({ expectedInformationGain: 1.5, relevance: 1, feasibility: 1, cost: 0 });
    expect(high).not.toBeNull();
    expect(high!.code).toBe(NEXT_BEST_EVIDENCE_ERROR_CODE.OUT_OF_RANGE_COMPONENT);
    expect(high!.details).toMatchObject({
      component: 'expectedInformationGain',
      value: 1.5,
      expected: '[0, 1]',
      category: 'OUT_OF_RANGE',
    });

    const low = utilityErrorCode({ expectedInformationGain: 1, relevance: -0.1, feasibility: 1, cost: 0 });
    expect(low).not.toBeNull();
    expect(low!.code).toBe(NEXT_BEST_EVIDENCE_ERROR_CODE.OUT_OF_RANGE_COMPONENT);
    expect(low!.details).toMatchObject({ component: 'relevance', value: -0.1 });
  });
});

describe('adversarial utility component validation (fail-closed, typed)', () => {
  for (const component of UTILITY_COMPONENTS) {
    describe(`component: ${component}`, () => {
      const base = (over: Partial<Record<UtilityComponentName, number>>): EvidenceUtilityComponents =>
        ({ ...VALID_UTILITY, ...over });

      for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        it(`rejects non-finite ${String(value)} with NAN_OR_INFINITE_COMPONENT`, () => {
          const error = utilityErrorCode(base({ [component]: value } as Partial<Record<UtilityComponentName, number>>));
          expect(error).not.toBeNull();
          expect(error!.code).toBe(NEXT_BEST_EVIDENCE_ERROR_CODE.NAN_OR_INFINITE_COMPONENT);
          expect(error!.details).toMatchObject({
            component,
            value,
            expected: 'finite number in [0, 1]',
            category: 'NAN_OR_INFINITE',
          });
        });
      }

      for (const value of [-0.000001, 1.000001]) {
        it(`rejects out-of-range ${value} with OUT_OF_RANGE_COMPONENT`, () => {
          const error = utilityErrorCode(base({ [component]: value } as Partial<Record<UtilityComponentName, number>>));
          expect(error).not.toBeNull();
          expect(error!.code).toBe(NEXT_BEST_EVIDENCE_ERROR_CODE.OUT_OF_RANGE_COMPONENT);
          expect(error!.details).toMatchObject({
            component,
            value,
            expected: '[0, 1]',
            category: 'OUT_OF_RANGE',
          });
        });
      }

      it(`accepts the 0 boundary for ${component}`, () => {
        const util = computeEvidenceUtility(base({ [component]: 0 }));
        expect(util[component]).toBe(0);
      });

      it(`accepts the 1 boundary for ${component}`, () => {
        const util = computeEvidenceUtility(base({ [component]: 1 }));
        expect(util[component]).toBe(1);
      });
    });
  }
});

describe('EIG alias consistency (frozen: eig === expectedInformationGain)', () => {
  const valid = { expectedInformationGain: 0.583333, relevance: 0.8, feasibility: 0.6, cost: 0.4 };

  it('accepts a matching eig alias', () => {
    const util = computeEvidenceUtility({ ...valid, eig: 0.583333 });
    expect(util.eig).toBe(0.583333);
    expect(util.expectedInformationGain).toBe(0.583333);
  });

  it('rejects a divergent eig alias with DIVERGENT_EIG_ALIAS (never silently overrides)', () => {
    const error = utilityErrorCode({ ...valid, eig: 0.9 });
    expect(error).not.toBeNull();
    expect(error!.code).toBe(NEXT_BEST_EVIDENCE_ERROR_CODE.DIVERGENT_EIG_ALIAS);
    expect(error!.details).toMatchObject({
      expectedInformationGain: 0.583333,
      eig: 0.9,
      expected: 'eig === expectedInformationGain',
    });
  });

  it('rejects a divergent eig even when canonical components are valid', () => {
    expect(utilityErrorCode({ ...VALID_UTILITY, eig: 0.499999 })?.code)
      .toBe(NEXT_BEST_EVIDENCE_ERROR_CODE.DIVERGENT_EIG_ALIAS);
  });
});

describe('score integrity (externally supplied score is never trusted)', () => {
  it('recomputes the final score from validated components via the frozen formula', () => {
    const components: EvidenceUtilityComponents = {
      expectedInformationGain: 0.583333,
      relevance: 0.816667,
      feasibility: 0.64,
      cost: 0.43,
    };
    const tampered = computeEvidenceUtility({ ...components, score: 1, eig: 0.583333 } as EvidenceUtilityComponents);
    expect(tampered.score).not.toBe(1);
    expect(tampered.score).toBe(normalizeScore(0.4 * 0.583333 + 0.25 * 0.816667 + 0.2 * 0.64 + 0.15 * 0.57));
  });
});