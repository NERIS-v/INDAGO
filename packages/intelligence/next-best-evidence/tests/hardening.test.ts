// ============================================================================
// PR10 production-hardening tests (final pass)
//
//   Test A  — computedAt is REQUIRED; missing/malformed values fail typed at
//             the orchestration boundary (no wall-clock fallback).
//   Test B  — same valid input + same timestamp ⇒ identical complete output.
//   Test C  — different timestamps ⇒ the ONLY difference is the computedAt
//             field (candidate order, utility, rankings, accounting and
//             provenance identical; ranking is timestamp-independent).
//   Test D  — the deterministic selection path performs zero wall-clock reads.
//   Metadata determinism — the complete serialized result (not merely ranked
//             candidate ids) is invariant under input shuffling; provenance
//             carries no input-order-dependent field.
//   Frozen rank-order audit — each step of EVIDENCE_UTILITY_RANK_ORDER is
//             consumed in order; recommendationIndex never breaks a tie.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { selectNextBestEvidence } from '../src/orchestrate.js';
import {
  NextBestEvidenceError,
  NEXT_BEST_EVIDENCE_ERROR_CODE,
} from '../src/errors.js';
import type {
  ComputedEvidenceUtility,
  EvidenceUtilityComponents,
} from '../src/components.js';
import {
  compareRankedCandidates,
  deduplicateAndRank,
  type RankedEvidenceCandidate,
} from '../src/dedup.js';
import type { ScoredCandidate } from '../src/dedup.js';
import {
  gapInput,
  analysisFixture,
  recommendation,
  INVESTIGATION_ID,
  GAP_ID,
  H1,
  H2,
  H3,
  relDerived,
  atomicsFixture,
  observationsFixture,
} from './fixtures.js';

const TS_A = '2026-01-01T00:00:00.000Z';
const TS_B = '2026-06-15T12:30:45.123Z';

/** Three recommendations including an exact canonical-identity duplicate. */
const BASE_RECS = [
  recommendation('DOCUMENT', [relDerived(H1), relDerived(H2)], { rationale: 'r1' }),
  recommendation('TESTIMONY', [relDerived(H3)], { rationale: 'r2' }),
  recommendation('DOCUMENT', [relDerived(H2), relDerived(H1)], { rationale: 'r3 (duplicate of r1)' }),
];

function baseInput() {
  return {
    investigationId: INVESTIGATION_ID,
    gaps: [
      gapInput({
        analysis: analysisFixture(BASE_RECS),
      }),
    ],
  };
}

function run(input: Parameters<typeof selectNextBestEvidence>[0], computedAt: string) {
  return selectNextBestEvidence(input, { computedAt });
}

describe('Test A — computedAt is REQUIRED at the orchestration boundary', () => {
  const input = baseInput();

  it('fails typed when the options object is omitted entirely', () => {
    try {
      selectNextBestEvidence(input, undefined as never);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(NextBestEvidenceError);
      expect((error as NextBestEvidenceError).code)
        .toBe(NEXT_BEST_EVIDENCE_ERROR_CODE.INVALID_INPUT);
      expect((error as NextBestEvidenceError).details)
        .toMatchObject({ reason: 'MISSING_COMPUTED_AT' });
    }
  });

  it('fails typed when computedAt is undefined or empty', () => {
    for (const missing of [undefined, '']) {
      try {
        selectNextBestEvidence(input, { computedAt: missing } as never);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(NextBestEvidenceError);
        expect((error as NextBestEvidenceError).code)
          .toBe(NEXT_BEST_EVIDENCE_ERROR_CODE.INVALID_INPUT);
        expect((error as NextBestEvidenceError).details)
          .toMatchObject({ reason: 'MISSING_COMPUTED_AT' });
      }
    }
  });

  it('fails typed for malformed / non-ISO-8601-UTC timestamps', () => {
    const malformed = [
      '2026-01-01',                       // date only
      '2026-01-01T00:00:00',              // no zone
      '2026-01-01T00:00:00.000',          // no zone, millis
      '2026-01-01T00:00:00+05:30',        // offset instead of Z (not UTC)
      'not-a-timestamp',
    ];
    for (const ts of malformed) {
      try {
        selectNextBestEvidence(input, { computedAt: ts });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(NextBestEvidenceError);
        expect((error as NextBestEvidenceError).code)
          .toBe(NEXT_BEST_EVIDENCE_ERROR_CODE.INVALID_INPUT);
        expect((error as NextBestEvidenceError).details)
          .toMatchObject({ reason: 'INVALID_COMPUTED_AT', value: ts });
      }
    }
  });

  it('fails typed for a non-string computedAt (fail-closed)', () => {
    try {
      selectNextBestEvidence(input, { computedAt: 12345 as never });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(NextBestEvidenceError);
      expect((error as NextBestEvidenceError).code)
        .toBe(NEXT_BEST_EVIDENCE_ERROR_CODE.INVALID_INPUT);
      expect((error as NextBestEvidenceError).details)
        .toMatchObject({ reason: 'MISSING_COMPUTED_AT' });
    }
  });
});

describe('Test B — same input + same timestamp ⇒ identical complete output', () => {
  it('produces structurally and byte-identical results on repeated execution', () => {
    const a = run(baseInput(), TS_A);
    const b = run(baseInput(), TS_A);
    expect(a).toStrictEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('Test C — different timestamps change ONLY computedAt', () => {
  it('keeps candidate order, utility, rankings, accounting and provenance identical', () => {
    const a = run(baseInput(), TS_A);
    const b = run(baseInput(), TS_B);

    expect(a.computedAt.value).toBe(TS_A);
    expect(b.computedAt.value).toBe(TS_B);
    expect(a.computedAt.precision).toBe('exact');

    const { computedAt: _computedAtA, ...restA } = a;
    const { computedAt: _computedAtB, ...restB } = b;
    expect(restA).toStrictEqual(restB);
    expect(JSON.stringify(restA)).toBe(JSON.stringify(restB));
  });
});

describe('Test D — no hidden wall clock in the deterministic selection path', () => {
  it('performs zero wall-clock reads during a fixed-timestamp run', () => {
    const input = baseInput();
    const baseline = run(input, TS_A);

    const RealDate = globalThis.Date;
    const touched = () => {
      throw new Error('wall clock accessed by the deterministic selection core');
    };
    const TrappedDate: DateConstructor = new Proxy(RealDate, {
      construct() {
        throw new Error('new Date() used by the deterministic selection core');
      },
      apply() {
        throw new Error('Date() called by the deterministic selection core');
      },
      get(target, prop, receiver) {
        if (prop === 'now') return touched;
        return Reflect.get(target, prop, receiver);
      },
    });

    try {
      globalThis.Date = TrappedDate;
      const fresh = run(input, TS_A);
      expect(fresh).toStrictEqual(baseline);
    } finally {
      globalThis.Date = RealDate;
    }
  });
});

describe('metadata determinism (complete serialized output, not just ranked ids)', () => {
  it('emits provenance with exactly { gapId, rank, canonicalRequestKey } and no recommendationIndex', () => {
    const result = run(baseInput(), TS_A);
    const provenance = (result.metadata?.customFields as Record<string, unknown>).provenance as
      Array<Record<string, unknown>>;

    expect(provenance).toHaveLength(2);
    for (const entry of provenance) {
      expect(Object.keys(entry).sort()).toEqual(['canonicalRequestKey', 'gapId', 'rank']);
      expect(entry.rank).toBeGreaterThanOrEqual(1);
      expect(typeof entry.canonicalRequestKey).toBe('string');
    }
  });

  it('keeps the complete JSON-serialized result (selections + selectionRun + gapSummaries + provenance) byte-stable under input shuffling', () => {
    const baseline = run(baseInput(), TS_A);
    const baselineJson = JSON.stringify(baseline);

    const shuffledRecs = run({
      investigationId: INVESTIGATION_ID,
      gaps: [gapInput({
        analysis: analysisFixture([...BASE_RECS].reverse()),
      })],
    }, TS_A);
    expect(JSON.stringify(shuffledRecs)).toBe(baselineJson);

    const shuffledContext = run({
      investigationId: INVESTIGATION_ID,
      gaps: [gapInput({
        hypothesisContext: [...atomicsFixture()].reverse(),
        analysis: analysisFixture(BASE_RECS),
      })],
    }, TS_A);
    expect(JSON.stringify(shuffledContext)).toBe(baselineJson);

    const shuffledObservations = run({
      investigationId: INVESTIGATION_ID,
      gaps: [gapInput({
        observations: [...observationsFixture()].reverse(),
        analysis: analysisFixture(BASE_RECS),
      })],
    }, TS_A);
    expect(JSON.stringify(shuffledObservations)).toBe(baselineJson);
  });
});

describe('frozen rank-order audit (EVIDENCE_UTILITY_RANK_ORDER)', () => {
  function utility(over: Partial<ComputedEvidenceUtility>): ComputedEvidenceUtility {
    return {
      expectedInformationGain: 0.5,
      eig: 0.5,
      relevance: 0.5,
      feasibility: 0.5,
      cost: 0.4,
      score: 0.5,
      ...over,
    };
  }

  function candidate(over: Partial<RankedEvidenceCandidate> & { utility: ComputedEvidenceUtility }): RankedEvidenceCandidate {
    return {
      canonicalRequestKey: 'canonical-key',
      gapId: GAP_ID,
      hypothesisIds: [],
      evidenceType: 'DOCUMENT',
      discriminatesAmongIds: [],
      rationale: 'rationale',
      recommendationIndex: 0,
      ...over,
    };
  }

  it('resolves by SCORE_DESC first', () => {
    const high = candidate({ utility: utility({ score: 0.9 }) });
    const low = candidate({ utility: utility({ score: 0.8 }) });
    expect(compareRankedCandidates(high, low)).toBeLessThan(0);
    expect(compareRankedCandidates(low, high)).toBeGreaterThan(0);
  });

  it('falls through to EXPECTED_INFORMATION_GAIN_DESC when scores tie', () => {
    const highEig = candidate({ utility: utility({ score: 0.5, eig: 0.9, expectedInformationGain: 0.9 }) });
    const lowEig = candidate({ utility: utility({ score: 0.5, eig: 0.4, expectedInformationGain: 0.4 }) });
    expect(compareRankedCandidates(highEig, lowEig)).toBeLessThan(0);
    expect(compareRankedCandidates(lowEig, highEig)).toBeGreaterThan(0);
  });

  it('falls through to RELEVANCE_DESC when score and EIG tie', () => {
    const highRel = candidate({ utility: utility({ score: 0.5, eig: 0.5, expectedInformationGain: 0.5, relevance: 0.8 }) });
    const lowRel = candidate({ utility: utility({ score: 0.5, eig: 0.5, expectedInformationGain: 0.5, relevance: 0.2 }) });
    expect(compareRankedCandidates(highRel, lowRel)).toBeLessThan(0);
  });

  it('falls through to FEASIBILITY_DESC when score, EIG and relevance tie', () => {
    const highFeas = candidate({ utility: utility({ score: 0.5, eig: 0.5, expectedInformationGain: 0.5, relevance: 0.5, feasibility: 0.8 }) });
    const lowFeas = candidate({ utility: utility({ score: 0.5, eig: 0.5, expectedInformationGain: 0.5, relevance: 0.5, feasibility: 0.2 }) });
    expect(compareRankedCandidates(highFeas, lowFeas)).toBeLessThan(0);
  });

  it('falls through to CANONICAL_REQUEST_KEY_ASC as the final frozen step', () => {
    const keyA = candidate({ utility: utility({}), canonicalRequestKey: 'a-key' });
    const keyB = candidate({ utility: utility({}), canonicalRequestKey: 'b-key' });
    expect(compareRankedCandidates(keyA, keyB)).toBeLessThan(0);
    expect(compareRankedCandidates(keyB, keyA)).toBeGreaterThan(0);
  });

  it('never consults recommendationIndex for a tie (returns 0 for otherwise identity/utility-identical candidates)', () => {
    const zeroIndex = candidate({ recommendationIndex: 0, utility: utility({}) });
    const fortyTwoIndex = candidate({ recommendationIndex: 42, utility: utility({}) });
    expect(compareRankedCandidates(zeroIndex, fortyTwoIndex)).toBe(0);
  });
});

describe('duplicate ordering — fully identical candidates stay stable', () => {
  function scored(over: Partial<ScoredCandidate>): ScoredCandidate {
    return {
      recommendationIndex: 0,
      evidenceType: 'DOCUMENT',
      rationale: 'same rationale',
      targetUuids: [H1],
      utility: {
        expectedInformationGain: 0.5,
        eig: 0.5,
        relevance: 0.5,
        feasibility: 0.5,
        cost: 0.4,
        score: 0.5,
      },
      ...over,
    };
  }

  it('yields byte-identical dedup output regardless of the order of fully identical candidates', () => {
    const a = scored({ recommendationIndex: 0 });
    const b = scored({ recommendationIndex: 1 });
    const forward = deduplicateAndRank(GAP_ID, [a, b]);
    const reversed = deduplicateAndRank(GAP_ID, [b, a]);
    expect(forward).toStrictEqual(reversed);
    expect(forward.ranked).toHaveLength(1);
    expect(forward.ranked[0]?.rationale).toBe('same rationale');
  });

  it('resolves a same-identity rationale tie lexicographically (input-order-independent winner)', () => {
    const apple = scored({ rationale: 'apple', recommendationIndex: 0 });
    const zebra = scored({ rationale: 'zebra', recommendationIndex: 1 });
    expect(deduplicateAndRank(GAP_ID, [zebra, apple]).ranked[0]?.rationale).toBe('apple');
    expect(deduplicateAndRank(GAP_ID, [apple, zebra]).ranked[0]?.rationale).toBe('apple');
  });
});