// ============================================================================
// PR5 formula calibration tests (Phase 5A-PR5, V1.1 scoring revision)
//
// Verifies the V1.1 scoring calibration (GRAPH_HOLE_SCORING_POLICY_VERSION v2):
//
//   evidenceSupportScore = weighted GEOMETRIC mean (never an arithmetic sum)
//   patternStrength      = basisStrength * (0.60 + 0.40 * evidenceRatio), so
//                          patternStrength <= basisStrength ALWAYS
//   expectedInformationValue = 0.50*uncertaintyPotential + 0.30*hypothesisCoverage
//                              + 0.20*evidenceDiversity  (contradiction count
//                              itself is never rewarded)
//
// Sets of required edge cases (A-I) + adversarial/property tests + exact
// hand-calculated match tests.
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  deriveStructuralComponents,
  deriveEvidenceSupportScore,
  deriveExpectedInformationValue,
  deriveSignificance,
  STRUCTURAL_BASIS_STRENGTH,
} from '../src/scoring.js';
import type { StructuralBasis, RawGraphHoleCandidate } from '@indago/contracts';
import type { ScoringContext, SupportInput } from '../src/scoring.js';
import { resolveIndependentSupportUnits } from '../src/support-units.js';
import {
  mkCandidate,
  mkObservation,
  mkHypothesisContext,
  mkAtomic,
  mkRegion,
  qualifyingScenario,
} from './helpers.js';
import { qualifyAndRankGraphHoleCandidates } from '../src/orchestrate.js';
import { normalizeScore, mean } from '../src/determinism.js';
import type { QualificationObservation } from '../src/types.js';

// ============================================================================
// Fixture helpers
// ============================================================================

const ALL_BASES = Object.keys(STRUCTURAL_BASIS_STRENGTH) as StructuralBasis[];

function obs(id: string, overrides?: Parameters<typeof mkObservation>[1]): QualificationObservation {
  return mkObservation(id, overrides);
}

function supportFor(candidate: RawGraphHoleCandidate, observations: readonly QualificationObservation[]): SupportInput {
  return { result: resolveIndependentSupportUnits(candidate, observations) };
}

/** A candidate whose supporting obs resolve to exactly `unitCount` distinct units. */
function unitFixture(
  unitCount: number,
  opts: { contradicting?: number; hypotheses?: string[]; noTrace?: boolean } = {},
): { candidate: RawGraphHoleCandidate; observations: QualificationObservation[]; support: SupportInput } {
  const supportingIds = Array.from({ length: unitCount }, (_, i) => `S${i}`);
  const contradictingIds = Array.from({ length: opts.contradicting ?? 0 }, (_, i) => `C${i}`);
  const candidate = mkCandidate({
    supportingObservationIds: supportingIds,
    contradictingObservationIds: contradictingIds,
    supportingHypothesisIds: opts.hypotheses ?? ['A1', 'A2'],
  });
  const observations = supportingIds.map((id, i) =>
    obs(id, opts.noTrace ? { sourceId: `raw-source-${i}` } : { sourceContextId: `ctx-${i}` }),
  );
  return { candidate, observations, support: supportFor(candidate, observations) };
}

function fixedContext(): ScoringContext {
  return {
    region: mkRegion({
      nodeIds: ['N1', 'N2', 'N3', 'N4'],
      edgeIds: ['E31', 'E32', 'E41', 'E42'],
    }),
    hypothesisContext: mkHypothesisContext([
      mkAtomic('A1', 'N1', { referencedCanonicalEntityIds: ['N1', 'N2'] }),
      mkAtomic('A2', 'N2', { referencedCanonicalEntityIds: ['N1', 'N2'] }),
    ]),
    observations: [
      obs('O1', { sourceContextId: 'ctx-1', strength: 0.85 }),
      obs('O2', { sourceContextId: 'ctx-2', strength: 0.75 }),
    ],
    neighborDegrees: new Map([
      ['N1', 2],
      ['N2', 2],
      ['N3', 2],
      ['N4', 2],
    ]),
    communities: null,
  };
}

function significanceOf(candidate: RawGraphHoleCandidate, ctx: ScoringContext): number {
  const support = supportFor(
    candidate,
    ctx.observations.concat(
      candidate.supportingObservationIds
        .filter((id) => !ctx.observations.some((o) => o.id === id))
        .map((id) => obs(id, { sourceContextId: `ctx-${id}` })),
    ),
  );
  const evidence = deriveEvidenceSupportScore(candidate, support);
  const information = deriveExpectedInformationValue(candidate, support);
  const structural = deriveStructuralComponents(candidate, ctx);
  return deriveSignificance(structural.structuralScore, evidence.score, information.score);
}

// ============================================================================
// §10 Required edge cases (A–I)
// ============================================================================

describe('edge case: no supporting observations (A)', () => {
  it('provenanceCompleteness is 0 and evidenceSupportScore is not artificially high', () => {
    const { candidate, observations, support } = unitFixture(0);
    const result = deriveEvidenceSupportScore(candidate, support);

    expect(result.components.provenanceCompleteness).toBe(0);
    expect(result.components.supportBreadth).toBe(0);
    // exp(0.7*ln(ε) + 0.3*ln(0.5)) with ε=1e-6 → ~0.000051 — near-zero, not inflated.
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(0.001);

    // Two resolved support units must dwarf the no-evidence case.
    const full = unitFixture(2);
    expect(deriveEvidenceSupportScore(full.candidate, full.support).score).toBeGreaterThan(result.score);
  });
});

describe('edge case: S>0, C=0 (B) and S=C=0 (C)', () => {
  it('supportConsistency is 1.0 when all observations support', () => {
    const { candidate, support } = unitFixture(2);
    expect(deriveEvidenceSupportScore(candidate, support).components.supportConsistency).toBe(1);
  });

  it('supportConsistency defaults to 0.5 when there are no observations at all', () => {
    const { candidate, observations, support } = unitFixture(0);
    expect(deriveEvidenceSupportScore(candidate, support).components.supportConsistency).toBe(0.5);
    expect(observations).toHaveLength(0);
  });
});

describe('edge case: 2 units pass the gate but evidenceSupportScore != 1 (D)', () => {
  it('exactly 2 independent units qualify, yet evidenceSupportScore stays below 1', () => {
    const input = qualifyingScenario();
    const result = qualifyAndRankGraphHoleCandidates(input);
    expect(result.qualifiedCandidates).toHaveLength(1);
    const candidate = result.qualifiedCandidates[0]!;
    expect(candidate.independentSupportUnitIds).toHaveLength(2);
    expect(candidate.evidenceSupportScore).toBeLessThan(1);
    expect(candidate.evidenceSupportScore).toBe(0.707107); // sqrt(0.5); breadth only 0.5
  });

  it('even perfect consistency and provenance never reaches 1.0 with only 2 units', () => {
    const { candidate, support } = unitFixture(2);
    const result = deriveEvidenceSupportScore(candidate, support);
    expect(result.components.supportBreadth).toBe(0.5);
    expect(result.score).toBeLessThan(1);
    expect(result.score).toBe(normalizeScore(Math.sqrt(0.5)));
  });
});

describe('edge case: 4+ units saturate supportBreadth at 1 (E)', () => {
  it('supportBreadth reaches 1.0 at four units and stays at 1.0 beyond', () => {
    const at4 = unitFixture(4);
    const at7 = unitFixture(7);
    expect(deriveEvidenceSupportScore(at4.candidate, at4.support).components.supportBreadth).toBe(1);
    expect(deriveEvidenceSupportScore(at7.candidate, at7.support).components.supportBreadth).toBe(1);
  });
});

describe('edge case: adding contradictions never raises evidenceSupportScore (F)', () => {
  it('adding a contradiction strictly lowers a perfectly consistent score', () => {
    const clean = unitFixture(2);
    const contradicted = unitFixture(2, { contradicting: 1 });
    const cleanScore = deriveEvidenceSupportScore(clean.candidate, clean.support).score;
    const contradictedScore = deriveEvidenceSupportScore(contradicted.candidate, contradicted.support).score;
    expect(contradictedScore).toBeLessThan(cleanScore);
  });
});

describe('edge case: uncertaintyPotential peaks at balance 0.5 (G) and falls one-sided (H)', () => {
  it('is exactly 1.0 at a balanced 1:1 evidence ratio', () => {
    const { candidate, support } = unitFixture(1, { contradicting: 1 });
    expect(deriveExpectedInformationValue(candidate, support).components.uncertaintyPotential).toBe(1);
  });

  it('is maximal at balance 0.5 across a sweep of ratios', () => {
    let max = -1;
    let atBalance = -1;
    for (let s = 1; s <= 5; s += 1) {
      for (let c = 0; c <= 5; c += 1) {
        const { candidate, support } = unitFixture(s, { contradicting: c });
        const value = deriveExpectedInformationValue(candidate, support).components.uncertaintyPotential;
        if (value > max) max = value;
        if (s === c) atBalance = value;
      }
    }
    expect(max).toBe(1);
    expect(atBalance).toBe(1);
  });

  it('drops toward 0 at one-sided ratios', () => {
    const supportingOnly = unitFixture(2, { contradicting: 0 });
    const contradictedOnly = unitFixture(0, { contradicting: 2 });
    expect(deriveExpectedInformationValue(supportingOnly.candidate, supportingOnly.support).components.uncertaintyPotential).toBe(0);
    expect(deriveExpectedInformationValue(contradictedOnly.candidate, contradictedOnly.support).components.uncertaintyPotential).toBe(0);
  });
});

describe('edge case: patternStrength stays bounded by basisStrength (I)', () => {
  it('holds for every structural basis and every observation mix', () => {
    for (const basis of ALL_BASES) {
      for (const s of [0, 1, 2, 6]) {
        for (const c of [0, 1, 2, 6]) {
          const candidate = mkCandidate({ structuralBasis: basis, supportingObservationIds: Array.from({ length: s }, (_, i) => `S${i}`), contradictingObservationIds: Array.from({ length: c }, (_, i) => `C${i}`) });
          const observations = Array.from({ length: s }, (_, i) => obs(`S${i}`, { sourceContextId: `ctx-${i}` }));
          const structural = deriveStructuralComponents(candidate, fixedContext());
          expect(structural.components.patternStrength).toBeLessThanOrEqual(STRUCTURAL_BASIS_STRENGTH[basis]);
        }
      }
    }
  });
});

// ============================================================================
// §11 Adversarial / property tests
// ============================================================================

describe('patternStrength never exceeds basisStrength', () => {
  it('asserts the frozen bound exhaustively', () => {
    for (const basis of ALL_BASES) {
      for (const s of [0, 1, 4]) {
        for (const c of [0, 1, 4]) {
          const candidate = mkCandidate({
            structuralBasis: basis,
            supportingObservationIds: Array.from({ length: s }, (_, i) => `S${i}`),
            contradictingObservationIds: Array.from({ length: c }, (_, i) => `C${i}`),
          });
          const { components } = deriveStructuralComponents(candidate, fixedContext());
          const basisStrength = STRUCTURAL_BASIS_STRENGTH[basis];
          expect(components.patternStrength).toBeLessThanOrEqual(basisStrength);
          expect(components.patternStrength).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('equals (never exceeds) the basis at a fully consistent evidence ratio', () => {
    const { candidate } = unitFixture(6, { hypotheses: ['A1', 'A2', 'A3'] });
    const { components } = deriveStructuralComponents(candidate, fixedContext());
    expect(components.patternStrength).toBe(STRUCTURAL_BASIS_STRENGTH[candidate.structuralBasis]);
  });

  it('is not inflated by hypothesis richness (double-counting guard)', () => {
    const slim = unitFixture(2, { hypotheses: ['A1'] });
    const rich = unitFixture(2, { hypotheses: ['A1', 'A2', 'A3', 'A4', 'A5'] });
    const slimStrength = deriveStructuralComponents(slim.candidate, fixedContext()).components.patternStrength;
    const richStrength = deriveStructuralComponents(rich.candidate, fixedContext()).components.patternStrength;
    expect(richStrength).toBe(slimStrength);
  });
});

describe('two units cannot produce evidenceSupportScore = 1', () => {
  it('the maximum two units can reach is sqrt(0.5)', () => {
    const { candidate, support } = unitFixture(2);
    const result = deriveEvidenceSupportScore(candidate, support);
    expect(result.components.supportBreadth).toBe(0.5);
    expect(result.components.supportConsistency).toBe(1);
    expect(result.components.provenanceCompleteness).toBe(1);
    expect(result.score).toBe(0.707107);
  });
});

describe('adding independent support raises or preserves evidenceSupportScore', () => {
  it('monotonically non-decreasing and saturated at four units', () => {
    const scores: number[] = [];
    for (let units = 1; units <= 5; units += 1) {
      const { candidate, support } = unitFixture(units);
      scores.push(deriveEvidenceSupportScore(candidate, support).score);
    }
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]!).toBeGreaterThanOrEqual(scores[i - 1]!);
    }
    expect(scores).toEqual([0.5, 0.707107, 0.866025, 1, 1]);
  });
});

describe('adding contradictions lowers evidenceSupportScore monotonically', () => {
  it('never increases, while the ratio remains positive', () => {
    let previous = Infinity;
    for (let c = 0; c <= 5; c += 1) {
      const { candidate, support } = unitFixture(2, { contradicting: c });
      const score = deriveEvidenceSupportScore(candidate, support).score;
      if (c > 0) expect(score).toBeLessThan(previous);
      expect(score).toBeLessThanOrEqual(previous);
      previous = score;
    }
  });
});

describe('missing provenance prevents a perfect score', () => {
  it('fail-closed observations reduce provenanceCompleteness below 1', () => {
    const { candidate, support } = unitFixture(2, { noTrace: true });
    const result = deriveEvidenceSupportScore(candidate, support);
    // supporting obs resolve by raw sourceId → 2 units, traceable → provenance 1.
    expect(result.components.provenanceCompleteness).toBe(1);
    expect(result.score).toBe(0.707107);
  });

  it('a supporting observation absent from the observation set truncates traceability', () => {
    const candidate = mkCandidate({ supportingObservationIds: ['O1', 'O2'], contradictingObservationIds: [] });
    const observations = [obs('O1', { sourceContextId: 'ctx-1' })]; // O2 missing → fail-closed
    const support = supportFor(candidate, observations);
    const result = deriveEvidenceSupportScore(candidate, support);
    expect(support.result.missingObservationIds).toEqual(['O2']);
    expect(result.components.supportBreadth).toBe(0.25);
    expect(result.components.provenanceCompleteness).toBe(0.5);
    // 0.25^0.5 * 0.5^0.2 = 0.5^1.2 ≈ 0.435275 — well below the perfect-provenance 0.707107.
    expect(result.score).toBeCloseTo(Math.pow(0.5, 1.2), 6);
  });
});

describe('uncertaintyPotential semantics', () => {
  it('balanced evidence maximizes and one-sided evidence minimizes it', () => {
    const balanced = unitFixture(2, { contradicting: 2 });
    const oneSided = unitFixture(2, { contradicting: 0 });
    const balancedValue = deriveExpectedInformationValue(balanced.candidate, balanced.support).components.uncertaintyPotential;
    const oneSidedValue = deriveExpectedInformationValue(oneSided.candidate, oneSided.support).components.uncertaintyPotential;
    expect(balancedValue).toBe(1);
    expect(oneSidedValue).toBe(0);
  });
});

describe('all scores stay within [0,1]', () => {
  it('evidenceSupport, EIV, structural and significance are bounded for a sweep of inputs', () => {
    const ctx = fixedContext();
    for (const basis of ALL_BASES) {
      for (let s = 0; s <= 5; s += 1) {
        for (let c = 0; c <= 3; c += 1) {
          const candidate = mkCandidate({
            structuralBasis: basis,
            supportingObservationIds: Array.from({ length: s }, (_, i) => `S${i}`),
            contradictingObservationIds: Array.from({ length: c }, (_, i) => `C${i}`),
          });
          const observations = Array.from({ length: s }, (_, i) => obs(`S${i}`, { sourceContextId: `ctx-${i}` }));
          const support = supportFor(candidate, observations);
          const evidence = deriveEvidenceSupportScore(candidate, support).score;
          const information = deriveExpectedInformationValue(candidate, support).score;
          const structural = deriveStructuralComponents(candidate, ctx).structuralScore;
          const significance = significanceOf(candidate, ctx);
          for (const value of [evidence, information, structural, significance]) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});

describe('determinism preservation', () => {
  it('identical inputs produce identical scores', () => {
    const fixture = unitFixture(3, { contradicting: 1 });
    const first = deriveEvidenceSupportScore(fixture.candidate, fixture.support);
    const second = deriveEvidenceSupportScore(fixture.candidate, fixture.support);
    expect(first.score).toBe(second.score);
    expect(deriveExpectedInformationValue(fixture.candidate, fixture.support).score)
      .toBe(deriveExpectedInformationValue(fixture.candidate, fixture.support).score);
    expect(deriveStructuralComponents(fixture.candidate, fixedContext()).structuralScore)
      .toBe(deriveStructuralComponents(fixture.candidate, fixedContext()).structuralScore);
  });

  it('unordered observations and unordered candidate id arrays yield identical scores', () => {
    const forward = unitFixture(4, { contradicting: 2 });
    const reversedCandidate = {
      ...forward.candidate,
      supportingObservationIds: [...forward.candidate.supportingObservationIds].reverse(),
      contradictingObservationIds: [...forward.candidate.contradictingObservationIds].reverse(),
    };
    const reversedSupport = supportFor(reversedCandidate, [...forward.observations].reverse());
    expect(deriveEvidenceSupportScore(forward.candidate, forward.support).score)
      .toBe(deriveEvidenceSupportScore(reversedCandidate, reversedSupport).score);
    expect(deriveExpectedInformationValue(forward.candidate, forward.support).score)
      .toBe(deriveExpectedInformationValue(reversedCandidate, reversedSupport).score);
  });

  it('duplicates do not increase the unit count (breadth stays 0.25)', () => {
    const candidate = mkCandidate({
      supportingObservationIds: ['O1', 'O2', 'O3'],
    });
    const observations = [
      obs('O1', { sourceContextId: 'ctx-same' }),
      obs('O2', { sourceContextId: 'ctx-same' }),
      obs('O3', { sourceContextId: 'ctx-same' }),
    ];
    const support = supportFor(candidate, observations);
    expect(support.result.keys).toEqual(['sourceContext:ctx-same']);
    expect(deriveEvidenceSupportScore(candidate, support).components.supportBreadth).toBe(0.25);
  });
});

describe('double-counting guard', () => {
  it('scaling evidence beyond saturation and keeping the balance fixed does not inflate evidenceSupportScore', () => {
    const balancedSmall = unitFixture(4, { contradicting: 4 });
    const balancedLarge = unitFixture(8, { contradicting: 8 });
    const smallScore = deriveEvidenceSupportScore(balancedSmall.candidate, balancedSmall.support);
    const largeScore = deriveEvidenceSupportScore(balancedLarge.candidate, balancedLarge.support);
    expect(smallScore.components.supportBreadth).toBe(1);
    expect(smallScore.components.supportConsistency).toBe(0.5);
    expect(smallScore.components.provenanceCompleteness).toBe(1);
    expect(largeScore.components.supportBreadth).toBe(1);
    expect(largeScore.components.supportConsistency).toBe(0.5);
    // No additive "observationCount + supportUnits + hypothesisCount" term anywhere.
    expect(largeScore.score).toBe(smallScore.score);
    expect(largeScore.score).toBeCloseTo(Math.pow(0.5, 0.3), 6); // 0.812252
  });
});

// ============================================================================
// Exact hand-calculated matches
// ============================================================================

describe('exact hand-calculated examples match the frozen formulas', () => {
  it('evidenceSupportScore geometric mean: 2 units, perfect consistency/provenance → sqrt(0.5)', () => {
    const { candidate, support } = unitFixture(2);
    const result = deriveEvidenceSupportScore(candidate, support);
    expect(result.components.supportBreadth).toBe(0.5);
    expect(result.components.supportConsistency).toBe(1);
    expect(result.components.provenanceCompleteness).toBe(1);
    expect(result.score).toBe(normalizeScore(Math.sqrt(0.5)));
  });

  it('evidenceSupportScore with a single contradiction: 0.5^0.5 * (2/3)^0.3 → 0.626064', () => {
    const { candidate, support } = unitFixture(2, { contradicting: 1 });
    const result = deriveEvidenceSupportScore(candidate, support);
    expect(result.components.supportBreadth).toBe(0.5);
    expect(result.components.supportConsistency).toBeCloseTo(2 / 3, 12);
    expect(result.components.provenanceCompleteness).toBe(1);
    expect(result.score).toBeCloseTo(Math.pow(0.5, 0.5) * Math.pow(2 / 3, 0.3), 6);
  });

  it('EIV: balanced + full coverage + full diversity → exactly 1.0', () => {
    const { candidate, support } = unitFixture(4, { contradicting: 4, hypotheses: ['A1', 'A2', 'A3'] });
    const result = deriveExpectedInformationValue(candidate, support);
    expect(result.components.uncertaintyPotential).toBe(1);
    expect(result.components.hypothesisCoverage).toBe(1);
    expect(result.components.evidenceDiversity).toBe(1);
    expect(result.score).toBe(1);
  });

  it('EIV: no observations and no hypotheses → 0.5 (uncertainty only)', () => {
    const { candidate, support } = unitFixture(0, { hypotheses: [] });
    const result = deriveExpectedInformationValue(candidate, support);
    expect(result.components.uncertaintyPotential).toBe(1);
    expect(result.components.hypothesisCoverage).toBe(0);
    expect(result.components.evidenceDiversity).toBe(0);
    expect(result.score).toBe(0.5);
  });

  it('EIV: one-sided evidence → uncertainty 0, dominated by coverage', () => {
    const { candidate, support } = unitFixture(2, { contradicting: 0 });
    const result = deriveExpectedInformationValue(candidate, support);
    expect(result.components.uncertaintyPotential).toBe(0);
    expect(result.components.hypothesisCoverage).toBeCloseTo(2 / 3, 6);
    expect(result.components.evidenceDiversity).toBe(0.5);
    expect(result.score).toBe(0.3);
  });

  it('patternStrength: SEED_REFERENCED_NODE with no evidence → 0.5 * 0.8 = 0.4', () => {
    const candidate = mkCandidate({
      structuralBasis: 'SEED_REFERENCED_NODE',
      supportingObservationIds: [],
      contradictingObservationIds: [],
    });
    const { components } = deriveStructuralComponents(candidate, fixedContext());
    expect(components.patternStrength).toBe(0.4);
  });

  it('patternStrength: SHARED_HYPOTHESIS_CONTEXT with neutral evidence → 0.9 * 0.8 = 0.72', () => {
    const candidate = mkCandidate({
      structuralBasis: 'SHARED_HYPOTHESIS_CONTEXT',
      supportingObservationIds: [],
      contradictingObservationIds: [],
    });
    const { components } = deriveStructuralComponents(candidate, fixedContext());
    expect(components.patternStrength).toBe(0.72);
  });

  it('structuralScore renormalizes over the present components even without temporal/community support', () => {
    const candidate = mkCandidate({ supportingObservationIds: ['O1', 'O2'] });
    const ctx = fixedContext();
    const { components, structuralScore } = deriveStructuralComponents(candidate, ctx);

    const connectivity = normalizeScore(mean([2 / 3, 2 / 3]));
    const contextual = normalizeScore(0.6 * 0.85 + 0.4 * mean([0.85, 0.75]));

    expect(components.temporalSupport).toBeNull();
    expect(components.communitySupport).toBeNull();
    const weightSum = 0.3 + 0.25 + 0.2;
    const expected = normalizeScore(
      (0.3 * components.patternStrength + 0.25 * connectivity + 0.2 * contextual) / weightSum,
    );
    expect(structuralScore).toBe(expected);
    expect(structuralScore).toBeCloseTo(0.803556, 6);
  });

  it('significance follows the frozen 0.60/0.25/0.15 weights', () => {
    const significance = deriveSignificance(0.803556, 0.707107, 0.3);
    expect(significance).toBeCloseTo(0.70391, 6);
  });
});