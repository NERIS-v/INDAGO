// ============================================================================
// PR14 classification semantics (categories, positives/negatives, ambiguity,
// single-label, priority bands)
// ============================================================================

import { describe, it, expect } from 'vitest';
import { GapClassificationResultSchema } from '@indago/contracts';
import { classifyGap } from '../src/index.js';
import {
  CASE_ID,
  ENTITY_A,
  ENTITY_B,
  HYP_COMPETING,
  HYP_SUPPORTING,
  NODE_A,
  NODE_B,
  OBSERVED_AT,
  OBS_LINK,
  OBS_OTHER,
  makeAtomic,
  makeHypothesisContext,
  makeInput,
  makeObservation,
} from './helpers.js';

const obsOnA = makeObservation(OBS_LINK, { entityIds: [ENTITY_A] });
const obsOnB = makeObservation(OBS_OTHER, { entityIds: [ENTITY_B] });

const endpointCovered = [obsOnA, obsOnB];
const highSignificance = { significance: 0.75, structuralScore: 0.6 };

describe('category positives (P1-P5)', () => {
  it('MISSING_DATA: question framed, no supporting observations, not clearly significant', () => {
    const result = classifyGap(makeInput({ observations: endpointCovered }));
    expect(result.type).toBe('MISSING_DATA');
    expect(result.status).toBe('CONFIDENT');
    expect(result.reasonCodes).toEqual(['QUESTION_IDENTIFIED', 'REQUIRED_INFORMATION_ABSENT']);
  });

  it('MISSING_INVESTIGATION: question not yet framed and investigation not concluded', () => {
    const result = classifyGap(
      makeInput({
        candidate: { expectedRelationshipType: null },
        observations: endpointCovered,
      }),
    );
    expect(result.type).toBe('MISSING_INVESTIGATION');
    expect(result.reasonCodes).toEqual(['INVESTIGATION_NOT_CONCLUDED']);
  });

  it('MISSING_INVESTIGATION: question identified but an alternative already provides comparison context', () => {
    const competing = makeAtomic(HYP_COMPETING, { referencedCanonicalEntityIds: [ENTITY_A, ENTITY_B] });
    const result = classifyGap(
      makeInput({
        candidate: { supportingObservationIds: [OBS_LINK] },
        observations: [obsOnA],
        hypothesisContext: makeHypothesisContext({ atomics: [competing] }),
      }),
    );
    expect(result.type).toBe('MISSING_INVESTIGATION');
    expect(result.reasonCodes).toEqual(['QUESTION_IDENTIFIED', 'INVESTIGATION_NOT_CONCLUDED']);
  });

  it('MISSING_COMPARISON: supporting evidence exists, no comparison baseline present', () => {
    const result = classifyGap(
      makeInput({
        candidate: { supportingObservationIds: [OBS_LINK] },
        observations: [obsOnA],
      }),
    );
    expect(result.type).toBe('MISSING_COMPARISON');
    expect(result.status).toBe('CONFIDENT');
    expect(result.reasonCodes).toEqual(['COMPARISON_BASELINE_ABSENT', 'QUESTION_IDENTIFIED']);
    expect(result.supportingReferences).toEqual({
      supportingObservationIds: [OBS_LINK],
      supportingHypothesisIds: [],
      structuralSignalIds: [NODE_A, NODE_B],
    });
  });

  it('INFRASTRUCTURE_GAP: region status LIMITED beats a would-be MISSING_DATA', () => {
    const result = classifyGap(
      makeInput({
        candidate: { supportingObservationIds: [] },
        region: { status: 'LIMITED' },
        observations: endpointCovered,
      }),
    );
    expect(result.type).toBe('INFRASTRUCTURE_GAP');
    expect(result.reasonCodes).toEqual(['REGION_REPRESENTATION_LIMITED']);
  });

  it('INFRASTRUCTURE_GAP: semantic retrieval truncation emits SOURCE_CATEGORY_UNAVAILABLE', () => {
    const base = makeInput({
      candidate: { supportingObservationIds: [] },
      observations: endpointCovered,
    });
    const truncatedRegion = {
      ...base.region,
      semanticExpansion: { ...base.region.semanticExpansion, providerTruncated: true },
    };
    const result = classifyGap({ ...base, region: truncatedRegion });
    expect(result.type).toBe('INFRASTRUCTURE_GAP');
    expect(result.reasonCodes).toContain('SOURCE_CATEGORY_UNAVAILABLE');
  });

  it('CONCEALMENT_CONSISTENT_PATTERN: strong expectation + endpoint context + zero direct-link evidence', () => {
    const result = classifyGap(
      makeInput({
        candidate: { ...highSignificance, supportingObservationIds: [] },
        observations: endpointCovered,
        hypothesisContext: makeHypothesisContext({ atomics: [] }),
      }),
    );
    expect(result.type).toBe('CONCEALMENT_CONSISTENT_PATTERN');
    expect(result.status).toBe('SUPPORTED');
    expect(result.reasonCodes).toEqual([
      'STRUCTURAL_EXPECTATION_STRONG',
      'ENDPOINT_EVIDENCE_PRESENT',
      'ABSENT_DIRECT_LINK_EVIDENCE',
      'CONCEALMENT_PATTERN_COMPATIBLE',
    ]);
    expect(result.supportingReferences.supportingObservationIds).toEqual([OBS_LINK, OBS_OTHER]);
  });
});

describe('category negatives (predicate guards)', () => {
  it('concealment does NOT fire when direct-link evidence exists (-> MISSING_COMPARISON)', () => {
    const result = classifyGap(
      makeInput({
        candidate: { ...highSignificance, supportingObservationIds: [OBS_LINK] },
        observations: [obsOnA, obsOnB],
        hypothesisContext: makeHypothesisContext({ atomics: [] }),
      }),
    );
    expect(result.type).toBe('MISSING_COMPARISON');
  });

  it('concealment does NOT fire when the expectation is not clearly significant (-> MISSING_DATA)', () => {
    const result = classifyGap(
      makeInput({
        candidate: { significance: 0.3, structuralScore: 0.4, supportingObservationIds: [] },
        observations: endpointCovered,
        hypothesisContext: makeHypothesisContext({ atomics: [] }),
      }),
    );
    expect(result.type).toBe('MISSING_DATA');
  });

  it('MISSING_DATA does NOT fire when no question was framed (-> MISSING_INVESTIGATION)', () => {
    const result = classifyGap(
      makeInput({
        candidate: { expectedRelationshipType: null, supportingHypothesisIds: [] },
        observations: endpointCovered,
      }),
    );
    expect(result.type).toBe('MISSING_INVESTIGATION');
  });

  it('MISSING_COMPARISON does NOT fire when a comparison baseline is present (-> MISSING_INVESTIGATION)', () => {
    const competing = makeAtomic(HYP_COMPETING, { referencedCanonicalEntityIds: [ENTITY_A, ENTITY_B] });
    const result = classifyGap(
      makeInput({
        candidate: { supportingObservationIds: [OBS_LINK] },
        observations: [obsOnA],
        hypothesisContext: makeHypothesisContext({ atomics: [competing] }),
      }),
    );
    expect(result.type).toBe('MISSING_INVESTIGATION');
  });

  it('INFRASTRUCTURE_GAP does NOT fire on a clean SATURATED region (-> MISSING_DATA)', () => {
    const result = classifyGap(makeInput({ observations: endpointCovered }));
    expect(result.type).toBe('MISSING_DATA');
  });

  it('MISSING_INVESTIGATION does NOT fire when the question is framed and data is absent (-> MISSING_DATA)', () => {
    const result = classifyGap(makeInput({ observations: endpointCovered }));
    expect(result.type).not.toBe('MISSING_INVESTIGATION');
    expect(result.type).toBe('MISSING_DATA');
  });
});

describe('ambiguity: contradictions are preserved, never collapsed', () => {
  it('candidate-level contradiction -> AMBIGUOUS, never MISSING_DATA / concealment', () => {
    const result = classifyGap(
      makeInput({
        candidate: {
          expectedRelationshipType: 'communication',
          supportingObservationIds: [],
          contradictingObservationIds: [OBS_OTHER],
        },
        observations: [obsOnA, obsOnB, obsOnB],
        hypothesisContext: makeHypothesisContext({ atomics: [] }),
      }),
    );
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.type).toBe('MISSING_INVESTIGATION');
    expect(result.reasonCodes).toEqual(['CONTRADICTION_PRESERVED']);
  });

  it('atomic-level contradiction is also preserved', () => {
    const conflicted = makeAtomic(HYP_SUPPORTING, {
      contradictingObservations: [OBS_OTHER],
    });
    const result = classifyGap(
      makeInput({
        observations: endpointCovered,
        hypothesisContext: makeHypothesisContext({ atomics: [conflicted] }),
      }),
    );
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.reasonCodes).toEqual(['CONTRADICTION_PRESERVED']);
    expect(result.type).toBe('MISSING_INVESTIGATION');
  });

  it('AMBIGUOUS + comparison-eligible path yields MISSING_COMPARISON', () => {
    const result = classifyGap(
      makeInput({
        candidate: {
          supportingObservationIds: [OBS_LINK],
          contradictingObservationIds: [OBS_OTHER],
        },
        observations: [obsOnA, obsOnB, obsOnB],
        hypothesisContext: makeHypothesisContext({ atomics: [] }),
      }),
    );
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.type).toBe('MISSING_COMPARISON');
  });
});

describe('single-label + mutual exclusion', () => {
  it('every category input fires exactly one type and every result binds to the contract', () => {
    const cases = [
      makeInput({ observations: endpointCovered }),
      makeInput({ candidate: { expectedRelationshipType: null }, observations: endpointCovered }),
      makeInput({
        candidate: { supportingObservationIds: [OBS_LINK] },
        observations: [obsOnA],
      }),
      makeInput({ region: { status: 'LIMITED' }, observations: endpointCovered }),
      makeInput({
        candidate: { ...highSignificance, supportingObservationIds: [] },
        observations: endpointCovered,
        hypothesisContext: makeHypothesisContext({ atomics: [] }),
      }),
    ];
    const types = cases.map((input) => {
      const result = classifyGap(input);
      expect(GapClassificationResultSchema.safeParse(result).success).toBe(true);
      expect(result.type).toBeDefined();
      return result.type;
    });
    expect(new Set(types).size).toBe(5);
    expect(types).toEqual([
      'MISSING_DATA',
      'MISSING_INVESTIGATION',
      'MISSING_COMPARISON',
      'INFRASTRUCTURE_GAP',
      'CONCEALMENT_CONSISTENT_PATTERN',
    ]);
  });
});

describe('priority bands + epistemic values (copied, never recomputed)', () => {
  it('maps significance to deterministic priority bands', () => {
    const expectPriority = (significance: number, priority: string) => {
      const result = classifyGap(
        makeInput({
          candidate: { significance, supportingObservationIds: [OBS_LINK] },
          observations: [obsOnA],
        }),
      );
      expect(result.priority).toBe(priority);
      expect(result.type).toBe('MISSING_COMPARISON');
    };
    expectPriority(0.9, 'CRITICAL');
    expectPriority(0.75, 'HIGH');
    expectPriority(0.6, 'MEDIUM');
    expectPriority(0.2, 'LOW');
  });

  it('copies frozen PR5 impact + expectedInformationValue verbatim', () => {
    const result = classifyGap(
      makeInput({
        candidate: { significance: 0.723606, expectedInformationValue: 0.25, supportingObservationIds: [OBS_LINK] },
        observations: [obsOnA],
      }),
    );
    expect(result.impact).toBe(0.723606);
    expect(result.expectedInformationValue).toBe(0.25);
  });
});

describe('epistemic safety of the concealment pattern', () => {
  it('is always SUPPORTED, never CONFIDENT', () => {
    for (const significance of [0.7, 0.85, 0.99]) {
      const result = classifyGap(
        makeInput({
          candidate: { significance, structuralScore: 0.9, supportingObservationIds: [] },
          observations: endpointCovered,
          hypothesisContext: makeHypothesisContext({ atomics: [] }),
        }),
      );
      expect(result.type).toBe('CONCEALMENT_CONSISTENT_PATTERN');
      expect(result.status).toBe('SUPPORTED');
    }
  });

  it('carries the pattern-compatible-only suggested action and no confirmation language', () => {
    const result = classifyGap(
      makeInput({
        candidate: { ...highSignificance, supportingObservationIds: [] },
        observations: endpointCovered,
        hypothesisContext: makeHypothesisContext({ atomics: [] }),
      }),
    );
    expect(result.suggestedActions).toEqual([
      'treat as pattern-compatible only; do not assert concealment',
    ]);
    expect(JSON.stringify(result).toLowerCase()).not.toMatch(/confirm|prove|intent|guilt/);
  });

  it('never leaks the relationship into a canonical assertion', () => {
    const result = classifyGap(
      makeInput({
        candidate: { ...highSignificance, supportingObservationIds: [] },
        observations: endpointCovered,
        hypothesisContext: makeHypothesisContext({ atomics: [] }),
      }),
    );
    expect(result.type).toBe('CONCEALMENT_CONSISTENT_PATTERN');
    expect(result.relatedEntityIds).toEqual([]);
    expect(result.relatedHypothesisIds).toEqual([]);
  });
});

describe('temporal semantics', () => {
  it('ignores createdAt/updatedAt/computedAt for classification identity', () => {
    const base = makeInput({ observations: endpointCovered });
    const moved = {
      ...base,
      observations: endpointCovered.map((o) => ({
        ...o,
        createdAt: { value: '2031-01-01T00:00:00.000Z', precision: 'exact' as const },
        updatedAt: { value: '2031-01-01T00:00:00.000Z', precision: 'exact' as const },
      })),
      computedAt: { value: '2031-01-01T00:00:00.000Z', precision: 'exact' as const },
    };
    const a = classifyGap(base);
    const b = classifyGap(moved);
    expect(a.type).toBe(b.type);
    expect(a.status).toBe(b.status);
    expect(a.reasonCodes).toEqual(b.reasonCodes);
    expect(a.contextSha256).toBe(b.contextSha256);
  });

  it('never treats a late-arriving observation as absence evidence', () => {
    const without = classifyGap(
      makeInput({
        candidate: { significance: 0.3, supportingObservationIds: [] },
        observations: endpointCovered,
        hypothesisContext: makeHypothesisContext({ atomics: [] }),
      }),
    );
    expect(without.type).toBe('MISSING_DATA');
    expect(without.reasonCodes).not.toContain('CONCEALMENT_PATTERN_COMPATIBLE');
  });
});