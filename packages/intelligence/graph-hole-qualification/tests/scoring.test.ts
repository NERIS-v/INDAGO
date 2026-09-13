import { describe, expect, it } from 'vitest';
import { STRUCTURAL_BASIS_STRENGTH } from '../src/scoring.js';
import {
  deriveStructuralComponents,
  deriveEvidenceSupportScore,
  deriveExpectedInformationValue,
  deriveSignificance,
} from '../src/scoring.js';
import type { RawGraphHoleCandidate, StructuralBasis } from '@indago/contracts';
import type { HypothesisContext } from '@indago/hypothesis-context';
import type { GraphHoleRegion } from '@indago/graph-hole-region';
import type { QualificationObservation, QualificationInput } from '../src/types.js';
import { mkRegion, mkObservation, mkCandidate, mkHypothesisContext, mkAtomic, mkNode, CASE_ID, VERSION_ID } from './helpers.js';
import { normalizeScore, mean, round6 } from '../src/determinism.js';
import type { ScoringContext, SupportInput } from '../src/scoring.js';
import type { SupportUnitResolutionResult } from '../src/support-units.js';
import { resolveIndependentSupportUnits } from '../src/support-units.js';

const N1 = 'NODE1';
const N2 = 'NODE2';
const N3 = 'NODE3';
const N4 = 'NODE4';
const E31 = 'E31';
const E32 = 'E32';
const E41 = 'E41';
const E42 = 'E42';

const REGION_NODES = [N1, N2, N3, N4];
const REGION_EDGES = [E31, E32, E41, E42];

function makeCandidate(overrides?: Partial<RawGraphHoleCandidate>): RawGraphHoleCandidate {
  return mkCandidate({ nodeIds: [N1, N2], observedEdgeIds: REGION_EDGES, ...overrides });
}

function makeContext(opts: {
  communities?: ReadonlyMap<string, string>;
  temporalContext?: TemporalInterval | null;
} = {}): ScoringContext {
  return {
    region: mkRegion({ nodeIds: REGION_NODES, edgeIds: REGION_EDGES, temporalContext: opts.temporalContext }),
    hypothesisContext: mkHypothesisContext([
      mkAtomic('A1', N1, { referencedCanonicalEntityIds: [N1, N2] }),
      mkAtomic('A2', N2, { referencedCanonicalEntityIds: [N1, N2] }),
    ]),
    observations: [
      mkObservation('O1', { sourceContextId: 'ctx-1', strength: 0.85 }),
      mkObservation('O2', { sourceContextId: 'ctx-2', strength: 0.75 }),
    ],
    neighborDegrees: new Map([
      [N1, 2],
      [N2, 2],
      [N3, 2],
      [N4, 2],
    ]),
    communities: opts.communities ?? null,
  };
}

function makeSupportInput(candidate: RawGraphHoleCandidate): SupportInput {
  const obs = [
    mkObservation('O1', { sourceContextId: 'ctx-1' }),
    mkObservation('O2', { sourceContextId: 'ctx-2' }),
  ];
  return { result: resolveIndependentSupportUnits(candidate, obs) };
}

import type { TemporalInterval } from '@indago/contracts';

describe('structural basis strength mapping', () => {
  it('uses frozen values from the documentation', () => {
    expect(STRUCTURAL_BASIS_STRENGTH.SHARED_HYPOTHESIS_CONTEXT).toBe(0.9);
    expect(STRUCTURAL_BASIS_STRENGTH.EXPECTED_PATH_BROKEN).toBe(0.85);
    expect(STRUCTURAL_BASIS_STRENGTH.CHAIN_EXPECTED_CONTINUATION).toBe(0.8);
    expect(STRUCTURAL_BASIS_STRENGTH.OBSERVED_NEIGHBOR_CONTEXT).toBe(0.75);
    expect(STRUCTURAL_BASIS_STRENGTH.TEMPORAL_DISCONTINUITY).toBe(0.7);
    expect(STRUCTURAL_BASIS_STRENGTH.CROSS_COMMUNITY_HYPOTHESIS_CONTEXT).toBe(0.65);
    expect(STRUCTURAL_BASIS_STRENGTH.HYPOTHESIS_REFERENCED_NODE).toBe(0.6);
    expect(STRUCTURAL_BASIS_STRENGTH.SEED_REFERENCED_NODE).toBe(0.5);
  });
});

describe('deriveStructuralComponents', () => {
  it('derives patternStrength bounded below the basis strength', () => {
    const ctx = makeContext();
    const candidate = makeCandidate();
    const { components, structuralScore } = deriveStructuralComponents(candidate, ctx);

    // patternStrength = basis * (0.60 + 0.40 * evidenceRatio); S=2, C=0 → ratio 1.0:
    // 0.9 * 1.0 = 0.9 (never exceeds the 0.9 basis strength)
    expect(components.patternStrength).toBe(0.9);
    expect(components.patternStrength).toBeLessThanOrEqual(STRUCTURAL_BASIS_STRENGTH[candidate.structuralBasis]!);

    // connectivity: nodeCount 4, maxPossibleDegree = 3; N1 & N2 each degree 2 → density 2/3
    const expectedConnectivity = normalizeScore(mean([(2/3), (2/3)]));
    expect(components.connectivitySupport).toBe(expectedConnectivity);

    // contextual: 0.6*mean(evidenceSupport of atomics) + 0.4*mean(obs strengths)
    const atomicMean = mean([0.85, 0.85]);
    const obsMean = mean([0.85, 0.75]);
    const expectedContextual = normalizeScore(0.6 * atomicMean + 0.4 * obsMean);
    expect(components.contextualSupport).toBe(expectedContextual);

    // temporal and community absent → renormalize
    expect(components.temporalSupport).toBeNull();
    expect(components.communitySupport).toBeNull();

    // structural score: renormalize over patternStrength, connectivitySupport, contextualSupport
    const weightSum = 0.30 + 0.25 + 0.20;
    const expectedStructural = normalizeScore(
      (0.30 * components.patternStrength +
       0.25 * components.connectivitySupport +
       0.20 * components.contextualSupport) / weightSum,
    );
    expect(structuralScore).toBe(expectedStructural);
  });

  it('includes temporal support when candidate temporalScope is provided', () => {
    const candidate = makeCandidate({
      temporalScope: { validFrom: { value: '2020-01-01', precision: 'day' }, validTo: { value: '2020-12-31', precision: 'day' }, precision: 'day', semantics: 'inferred' },
    });
    const ctx = makeContext();
    const { components } = deriveStructuralComponents(candidate, ctx);
    expect(components.temporalSupport).toBeGreaterThanOrEqual(0);
    expect(components.temporalSupport).toBeLessThanOrEqual(1);
  });

  it('derives communitySupport when communities supplied', () => {
    const communities = new Map([
      [N1, 'COMM-A'],
      [N2, 'COMM-B'],
      [N3, 'COMM-A'],
      [N4, 'COMM-B'],
    ]);
    const ctx = makeContext({ communities });
    const { components } = deriveStructuralComponents(makeCandidate(), ctx);
    // N1 and N2 are in different communities (cross-community)
    expect(components.communitySupport).toBe(normalizeScore(0.9));
  });

  it('returns null community when communities is null', () => {
    const ctx = makeContext({ communities: null });
    const { components } = deriveStructuralComponents(makeCandidate(), ctx);
    expect(components.communitySupport).toBeNull();
  });

  it('returns same-community score when candidate nodes share one community', () => {
    const communities = new Map([
      [N1, 'COMM-X'],
      [N2, 'COMM-X'],
      [N3, 'COMM-X'],
      [N4, 'COMM-X'],
    ]);
    const ctx = makeContext({ communities });
    const { components } = deriveStructuralComponents(makeCandidate(), ctx);
    expect(components.communitySupport).toBe(normalizeScore(0.3));
  });

  it('penalizes contradiction > support on pattern strength', () => {
    const candidate = makeCandidate({
      supportingObservationIds: ['O1'],
      contradictingObservationIds: ['X1', 'X2', 'X3'],
    });
    const ctx = makeContext();
    const { components: withContradictions } = deriveStructuralComponents(candidate, ctx);

    const candidate2 = makeCandidate({
      supportingObservationIds: ['O1'],
      contradictingObservationIds: [],
    });
    const { components: noContradictions } = deriveStructuralComponents(candidate2, ctx);

    expect(withContradictions.patternStrength).toBeLessThan(noContradictions.patternStrength);
  });
});

describe('deriveEvidenceSupportScore', () => {
  it('uses the frozen geometric-mean formula and is deterministic', () => {
    const candidate = makeCandidate();
    const supportInput = makeSupportInput(candidate);
    const result = deriveEvidenceSupportScore(candidate, supportInput);

    // supportBreadth: min(2, 4) / 4 = 0.5
    expect(result.components.supportBreadth).toBe(0.5);

    // supportConsistency: 2 / (2+0) = 1.0
    expect(result.components.supportConsistency).toBe(1.0);

    // provenanceCompleteness: both supporting observations traceable → 2/2 = 1.0
    expect(result.components.provenanceCompleteness).toBe(1.0);

    // exp(0.50*ln(0.5) + 0.30*ln(1) + 0.20*ln(1)) = 0.5^0.5 ≈ 0.707107
    const expected = normalizeScore(Math.sqrt(0.5));
    expect(result.score).toBe(expected);
  });
});

describe('deriveExpectedInformationValue', () => {
  it('uses the frozen V1.1 formula and is deterministic', () => {
    const candidate = makeCandidate();
    const result = deriveExpectedInformationValue(candidate, makeSupportInput(candidate));

    // supportBalance 2/2 = 1.0 → uncertaintyPotential 0 (one-sided)
    expect(result.components.uncertaintyPotential).toBe(0);
    expect(result.components.hypothesisCoverage).toBeCloseTo(2 / 3, 6);
    expect(result.components.evidenceDiversity).toBe(0.5);

    const expected = normalizeScore(0.3 * (2 / 3) + 0.2 * 0.5);
    expect(result.score).toBe(expected);
  });
});

describe('deriveSignificance', () => {
  it('computes frozen weighted sum and is byte-stable', () => {
    const sig = deriveSignificance(0.82, 0.60, 0.42);
    const expected = normalizeScore(0.60 * 0.82 + 0.25 * 0.60 + 0.15 * 0.42);
    expect(sig).toBe(expected);
  });
});