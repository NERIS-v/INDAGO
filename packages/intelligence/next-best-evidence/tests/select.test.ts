// ============================================================================
// End-to-end PR10 selection tests (evaluation Cases A–J)
//
//   A  complete green path — utility derivation + ranking correctness
//   B  targetless recommendation -> EIG 0 (fail-closed, still ranked low)
//   C  unresolvable references -> candidate dropped with accounting
//   D  existing-evidence exclusion (exact type + full coverage only)
//   E  dedup collapse (canonical identity) observed in accounting
//   F  per-gap bounds (25 candidate cap, 5 ranked cap) surfaced as truncated
//   G  per-run bounds (10 gaps) surfaced as runTruncated
//   H  upstream gate failures are typed and deterministic
//   I  temporal-fit participates in relevance/utility deterministically
//   J  byte-determinism across recomputation and input shuffling
// ============================================================================

import { describe, expect, it } from 'vitest';
import { NextBestEvidenceSelectionResultSchema } from '@indago/contracts';
import type { RecommendedEvidence } from '@indago/graph-hole-analysis';
import { selectForGap } from '../src/select.js';
import { selectNextBestEvidence } from '../src/orchestrate.js';
import { NextBestEvidenceError, NEXT_BEST_EVIDENCE_ERROR_CODE } from '../src/errors.js';
import { normalizeScore } from '../src/determinism.js';
import {
  gapInput,
  analysisFixture,
  recommendation,
  rawCandidateFixture,
  validatedFixture,
  decisionFixture,
  atomicsFixture,
  observationsFixture,
  INVESTIGATION_ID,
  GAP_ID,
  H1,
  H2,
  H3,
  INVENTED_H,
  OBS1,
  relDerived,
} from './fixtures.js';
import type { Pr10AtomicHypothesis } from '../src/types.js';

const determinismResult = (input: Parameters<typeof selectNextBestEvidence>[0]) =>
  selectNextBestEvidence(input, { computedAt: '2026-01-01T00:00:00.000Z' });

describe('Case A — complete green path', () => {
  it('derives utility, ranks deterministically and satisfies the frozen schema', () => {
    const input = gapInput({
      analysis: analysisFixture([
        recommendation('DOCUMENT', [relDerived(H1), relDerived(H2)]),
      ]),
    });

    const core = selectForGap(input);
    expect(core.rankedRequests).toHaveLength(1);
    const r = core.rankedRequests[0]!;

    expect(r.evidenceType).toBe('DOCUMENT');
    expect(r.discriminatesAmongIds).toEqual([H1, H2]);
    expect(r.hypothesisIds).toEqual([H1, H2]);
    expect(r.utility.eig).toBe(r.utility.expectedInformationGain);
    expect(r.utility.eig).toBeGreaterThan(0);
    expect(r.utility.score).toBeGreaterThan(0);

    // Hand-computed frozen composition for this input.
    const eig = normalizeScore(0.5 * (2 / 3) + 0.3 * 0.5 + 0.2 * 0.5);
    expect(r.utility.eig).toBe(eig);
    const relevance = normalizeScore(0.45 * 1 + 0.25 * (2 / 3) + 0.2 * 1 + 0.1 * 0.5); // temporal fit neutral (both atomics lack a scope)
    expect(r.utility.relevance).toBe(relevance);
    expect(r.utility.feasibility).toBe(0.64); // DOCUMENT baseline, neutral availability
    const score = normalizeScore(0.4 * eig + 0.25 * relevance + 0.2 * 0.64 + 0.15 * (1 - r.utility.cost));
    expect(r.utility.score).toBe(score);
    expect(score).toBe(0.6635);

    expect(core.accounting.unresolvedReferenceDrops).toBe(0);
    expect(core.accounting.existingEvidenceExclusions).toBe(0);
    expect(core.accounting.truncated).toBe(false);
  });
});

describe('Case B — targetless recommendation', () => {
  it('yields EIG 0 yet is kept (fail-closed EIG, never invented discrimination)', () => {
    const targetless = recommendation('DOCUMENT', []);
    const input = gapInput({ analysis: analysisFixture([targetless]) });

    const core = selectForGap(input);
    expect(core.rankedRequests).toHaveLength(1);
    expect(core.rankedRequests[0]?.utility.eig).toBe(0);
    expect(core.rankedRequests[0]?.discriminatesAmongIds).toEqual([]);
  });
});

describe('Case C — unresolvable references drop the candidate (fail-closed)', () => {
  it('drops a recommendation whose target partially resolves', () => {
    const input = gapInput({
      analysis: analysisFixture([
        recommendation('DOCUMENT', [relDerived(H1), relDerived(INVENTED_H)]),
      ]),
    });

    const core = selectForGap(input);
    expect(core.rankedRequests).toHaveLength(0);
    expect(core.accounting.unresolvedReferenceDrops).toBe(1);
    expect(core.accounting.distinctCandidates).toBe(0);
  });
});

describe('Case D — existing-evidence exclusion', () => {
  const existing = [{ evidenceType: 'DOCUMENT' as const, hypothesisIds: [H1, H2] }];

  it('excludes only on exact type AND full coverage', () => {
    const sameType = gapInput({
      analysis: analysisFixture([recommendation('DOCUMENT', [relDerived(H1), relDerived(H2)])]),
      existingEvidence: existing,
    });
    const core = selectForGap(sameType);
    expect(core.rankedRequests).toHaveLength(0);
    expect(core.accounting.existingEvidenceExclusions).toBe(1);
  });

  it('keeps when the type differs', () => {
    const otherType = gapInput({
      analysis: analysisFixture([recommendation('TESTIMONY', [relDerived(H1), relDerived(H2)])]),
      existingEvidence: existing,
    });
    expect(selectForGap(otherType).rankedRequests).toHaveLength(1);
  });

  it('keeps on partial coverage', () => {
    const partial = gapInput({
      analysis: analysisFixture([recommendation('DOCUMENT', [relDerived(H1), relDerived(H2), relDerived(H3)])]),
      existingEvidence: existing,
    });
    expect(selectForGap(partial).rankedRequests).toHaveLength(1);
    expect(selectForGap(partial).accounting.existingEvidenceExclusions).toBe(0);
  });
});

describe('Case E — dedup via canonical identity', () => {
  it('collapses equivalent recommendations, preserving the deterministic winner', () => {
    const first = recommendation('DOCUMENT', [relDerived(H1), relDerived(H2)], { rationale: 'first rationale' });
    const second = recommendation('DOCUMENT', [relDerived(H2), relDerived(H1)], { rationale: 'second rationale' });
    const input = gapInput({ analysis: analysisFixture([first, second]) });

    const core = selectForGap(input);
    expect(core.rankedRequests).toHaveLength(1);
    expect(core.accounting.deduplicatedCandidates).toBe(1);
    expect(core.accounting.distinctCandidates).toBe(1);
    expect(core.rankedRequests[0]?.rationale).toBe('first rationale');
  });

  it('keeps recommendations with distinct targets separate', () => {
    const input = gapInput({
      analysis: analysisFixture([
        recommendation('DOCUMENT', [relDerived(H1)]),
        recommendation('DOCUMENT', [relDerived(H2)]),
      ]),
    });
    const core = selectForGap(input);
    expect(core.rankedRequests).toHaveLength(2);
    expect(core.accounting.deduplicatedCandidates).toBe(0);
  });
});

describe('Case F — per-gap bounds surfaced, never silent', () => {
  const types = ['DOCUMENT', 'RECORD', 'TESTIMONY', 'PHYSICAL', 'DIGITAL', 'FINANCIAL', 'COMMUNICATION', 'OTHER'] as const;
  const targetSets: readonly (readonly string[])[] = [
    [relDerived(H1)],
    [relDerived(H2)],
    [relDerived(H1), relDerived(H2)],
  ];

  it('caps candidate consideration at 25 and ranked output at 5', () => {
    const recs: RecommendedEvidence[] = [];
    for (let i = 0; i < 30; i += 1) {
      recs.push({
        evidenceType: types[i % 8]!,
        rationale: `rec-${i}`,
        supportingObservationIds: [OBS1],
        discriminatesAmongIds: [...targetSets[i % 3]!],
      });
    }

    const core = selectForGap(gapInput({ analysis: analysisFixture(recs) }));

    expect(core.accounting.recommendationsSeen).toBe(25);
    expect(core.accounting.candidatesRanked).toBe(5);
    expect(core.rankedRequests).toHaveLength(5);
    expect(core.accounting.truncated).toBe(true);
    expect(core.accounting.distinctCandidates).toBeGreaterThanOrEqual(5);

    // Rank order is monotone (score desc).
    for (let i = 1; i < core.rankedRequests.length; i += 1) {
      expect(core.rankedRequests[i - 1]!.utility.score)
        .toBeGreaterThanOrEqual(core.rankedRequests[i]!.utility.score);
    }
  });
});

describe('Case G — per-run gaps bound', () => {
  it('processes at most 10 of 11 gaps and surfaces runTruncated', () => {
    const manyGaps = Array.from({ length: 11 }, (_, i) =>
      gapInput({
        gapId: `${GAP_ID.slice(0, -1)}${(i + 1).toString(16)}`,
        analysis: analysisFixture([recommendation('DOCUMENT', [relDerived(H1)])]),
      }),
    );

    const result = determinismResult({ investigationId: INVESTIGATION_ID, gaps: manyGaps });

    expect(result.selections).toHaveLength(10);
    const runInfo = (result.metadata?.customFields as Record<string, unknown>).selectionRun as {
      gapsRequested: number;
      gapsProcessed: number;
      runTruncated: boolean;
    };
    expect(runInfo.gapsRequested).toBe(11);
    expect(runInfo.gapsProcessed).toBe(10);
    expect(runInfo.runTruncated).toBe(true);
  });
});

describe('Case H — gate failures are typed and deterministic', () => {
  it('throws a deterministic NextBestEvidenceError with the failing gap id', () => {
    const bad = decisionFixture({ nextStatus: 'REJECTED' });
    const input = { investigationId: INVESTIGATION_ID, gaps: [gapInput({ decision: bad })] };

    try {
      determinismResult(input);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(NextBestEvidenceError);
      expect((error as NextBestEvidenceError).code).toBe(NEXT_BEST_EVIDENCE_ERROR_CODE.GATE_NOT_SATISFIED);
      expect((error as NextBestEvidenceError).message).toContain(GAP_ID);
    }
  });
});

describe('Case I — temporal fit contributes deterministically', () => {
  function scopedAnalysis(candidateScope: { validFrom: string; validTo: string }): ReturnType<typeof gapInput> {
    const candidate = rawCandidateFixture() as unknown as {
      rawCandidate: { temporalScope?: unknown };
    };
    candidate.rawCandidate.temporalScope = {
      validFrom: { value: candidateScope.validFrom, precision: 'exact' },
      validTo: { value: candidateScope.validTo, precision: 'exact' },
      precision: 'exact',
      semantics: 'observed',
    };

    const context: Pr10AtomicHypothesis[] = atomicsFixture().map((atomic, index) =>
      index === 0
        ? { ...atomic, temporalScope: {
            validFrom: { value: '2020-01-01T00:00:00.000Z', precision: 'exact' },
            validTo: { value: '2020-12-31T00:00:00.000Z', precision: 'exact' },
            precision: 'exact',
            semantics: 'observed',
          } }
        : atomic,
    );

    return gapInput({
      candidate: candidate as never,
      hypothesisContext: context,
      analysis: analysisFixture([recommendation('DOCUMENT', [relDerived(H1)])]),
    });
  }

  it('overlapping temporal scope outranks a disjoint one, all else equal', () => {
    const overlapping = selectForGap(scopedAnalysis({ validFrom: '2020-03-01T00:00:00.000Z', validTo: '2020-09-01T00:00:00.000Z' }));
    const disjoint = selectForGap(scopedAnalysis({ validFrom: '2026-01-01T00:00:00.000Z', validTo: '2026-12-31T00:00:00.000Z' }));

    const overlapRelevance = overlapping.rankedRequests[0]!.utility.relevance;
    const disjointRelevance = disjoint.rankedRequests[0]!.utility.relevance;

    expect(overlapRelevance).toBeGreaterThan(disjointRelevance);
    expect(overlapping.rankedRequests[0]!.utility.score).toBeGreaterThan(disjoint.rankedRequests[0]!.utility.score);
  });
});

describe('Case J — byte-determinism across recomputation and input shuffling', () => {
  const baseRecommendations = [
    recommendation('DOCUMENT', [relDerived(H1), relDerived(H2)], { rationale: 'r1' }),
    recommendation('TESTIMONY', [relDerived(H3)], { rationale: 'r2' }),
    recommendation('DOCUMENT', [relDerived(H2), relDerived(H1)], { rationale: 'r3 (duplicate of r1)' }),
  ];

  const baseInput = () =>
    gapInput({ analysis: analysisFixture(baseRecommendations) });

  it('returns byte-identical results on recomputation', () => {
    expect(determinismResult({ investigationId: INVESTIGATION_ID, gaps: [baseInput()] }))
      .toEqual(determinismResult({ investigationId: INVESTIGATION_ID, gaps: [baseInput()] }));
  });

  it('is invariant to hypothesis-context order and recommendation order', () => {
    const baseline = determinismResult({ investigationId: INVESTIGATION_ID, gaps: [baseInput()] });

    const shuffledContextRecs = determinismResult({
      investigationId: INVESTIGATION_ID,
      gaps: [gapInput({
        hypothesisContext: [...atomicsFixture()].reverse(),
        analysis: analysisFixture(baseRecommendations),
      })],
    });
    expect(shuffledContextRecs).toEqual(baseline);

    const reversedRecs = determinismResult({
      investigationId: INVESTIGATION_ID,
      gaps: [gapInput({ analysis: analysisFixture([...baseRecommendations].reverse()) })],
    });
    expect(reversedRecs).toEqual(baseline);

    const shuffledObs = determinismResult({
      investigationId: INVESTIGATION_ID,
      gaps: [gapInput({ analysis: analysisFixture(baseRecommendations), observations: [...observationsFixture()].reverse() })],
    });
    expect(shuffledObs).toEqual(baseline);
  });

  it('produces a result that strictly satisfies the frozen selection result schema', () => {
    const result = determinismResult({ investigationId: INVESTIGATION_ID, gaps: [baseInput()] });
    expect(() => NextBestEvidenceSelectionResultSchema.parse(result)).not.toThrow();
    expect(result.utilityPolicyVersion).toBe('v1');
    expect(result.boundsPolicyVersion).toBe('v1');
  });
});