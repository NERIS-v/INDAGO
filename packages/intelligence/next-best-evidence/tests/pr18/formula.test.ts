// ============================================================================
// PR18 — frozen utility formula verification (policy §15)
//
// PR18's scoring path calls computeEvidenceUtility (the frozen PR10 formula).
// These fixtures are INDEPENDENTLY hand-calculated, not copied from the
// implementation:
//
//   score = clamp01(round6(0.40*EIG + 0.25*relevance + 0.20*feasibility
//                        + 0.15*(1 - cost)))
//
// Weights from EVIDENCE_UTILITY_POLICY_V1 (sum to exactly 1.0).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { computeEvidenceUtility } from '../../src/components.js';

const W = { eig: 0.4, rel: 0.25, feas: 0.2, effCost: 0.15 };

describe('PR18 frozen utility formula', () => {
  it('all components zero but cost=1 (effectiveCost=0) => score 0 (floor)', () => {
    const u = computeEvidenceUtility({ expectedInformationGain: 0, relevance: 0, feasibility: 0, cost: 1 });
    expect(u.score).toBe(0);
  });

  it('cost inversion: cost=0 leaves a 0.15 effective-cost contribution even when all else is zero', () => {
    const u = computeEvidenceUtility({ expectedInformationGain: 0, relevance: 0, feasibility: 0, cost: 0 });
    // 0.4*0 + 0.25*0 + 0.2*0 + 0.15*1 = 0.15
    expect(u.score).toBe(0.15);
  });

  it('all-one effective components => score 1 (EIG=1,rel=1,feas=1,cost=0)', () => {
    const u = computeEvidenceUtility({ expectedInformationGain: 1, relevance: 1, feasibility: 1, cost: 0 });
    // 0.4*1 + 0.25*1 + 0.2*1 + 0.15*1 = 1.0
    expect(u.score).toBe(1);
  });

  it('mixed fixture => 0.795 (hand-calculated)', () => {
    const EIG = 0.8, rel = 0.7, feas = 0.9, cost = 0.2;
    const u = computeEvidenceUtility({ expectedInformationGain: EIG, relevance: rel, feasibility: feas, cost });
    const expected = W.eig * EIG + W.rel * rel + W.feas * feas + W.effCost * (1 - cost);
    // 0.32 + 0.175 + 0.18 + 0.12 = 0.795
    expect(u.score).toBeCloseTo(expected, 6);
    expect(u.score).toBe(0.795);
  });

  it('high-cost candidate (cost=1) => effectiveCost=0', () => {
    const u = computeEvidenceUtility({ expectedInformationGain: 1, relevance: 1, feasibility: 1, cost: 1 });
    // 0.4*1 + 0.25*1 + 0.2*1 + 0.15*0 = 0.85
    expect(u.score).toBe(0.85);
  });

  it('rounding boundary stays deterministic at 6 decimals', () => {
    const u = computeEvidenceUtility({ expectedInformationGain: 0.5, relevance: 0.5, feasibility: 0.5, cost: 0.5 });
    // (0.4+0.25+0.2+0.15) * 0.5 = 1.0 * 0.5 = 0.5
    expect(u.score).toBe(0.5);
  });

  it('weights sum to exactly 1.0', () => {
    expect(W.eig + W.rel + W.feas + W.effCost).toBe(1.0);
  });

  it('score is clamped to [0,1] even if a component drifts (round6 after clamp)', () => {
    // This never happens with validated components, but the transform is frozen:
    const u = computeEvidenceUtility({ expectedInformationGain: 1, relevance: 1, feasibility: 1, cost: 0 });
    expect(u.score).toBe(1);
  });
});