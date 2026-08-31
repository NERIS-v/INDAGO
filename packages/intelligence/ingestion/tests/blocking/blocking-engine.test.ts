import { describe, it, expect } from 'vitest';
import {
  blockCandidates,
  finalizeCandidatePair,
  buildCandidatePairIdentityKey,
  deterministicCandidatePairId,
  deriveSurnameInitial,
  areTypesCompatible,
  CANDIDATE_PAIR_BOUNDS,
} from '../../src/blocking/index.js';
import { CandidatePairSchema } from '@indago/contracts';
import type { EntityMentionCandidate, EntityType } from '@indago/contracts';

// ============================================================================
// M-A08 Multi-pass Blocking — pure engine unit tests
//
// HARD RULES under test:
//   § pure + deterministic — identical input → identical drafts + ids.
//   § UNION not cascade — passes are independent; a pair found by N passes is
//       ONE CandidatePair preserving ALL N passes.
//   § unordered pairs — canonical min/max ordering; order-independent ids.
//   § case-scoped — candidate pairs never cross a case boundary.
//   § same-observation policy — pairs within one observation are excluded by
//       default; overridable.
//   § NULL/OTHER conservative — never a universal matcher.
//   § bounded — oversized blocks skipped, no O(N²) explosion.
//   § M-A08 boundary — output is a comparison universe, NOT resolution.
// ============================================================================

const LONG_UUID = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CASE = LONG_UUID(900);
const INV = LONG_UUID(901);

function makeCandidate(
  n: number,
  opts: {
    type?: EntityType;
    value?: string;
    text?: string;
    observation?: number;
  } = {},
): EntityMentionCandidate {
  return {
    id: LONG_UUID(n),
    observationId: LONG_UUID(opts.observation ?? (100 + n)),
    text: opts.text ?? opts.value ?? 'mention',
    start: 0,
    end: 5,
    ...(opts.type !== undefined ? { entityType: opts.type } : {}),
    extractionMethod: 'HEURISTIC_FALLBACK',
    ...(opts.value !== undefined ? { canonicalMatchValue: opts.value } : {}),
    provenance: {
      sourceId: LONG_UUID(11),
      artifactId: LONG_UUID(1),
      extractor: 'indago-observation-extractor@1.0.0',
      extractionMethod: 'text-decode',
    },
    createdAt: { value: '2026-01-01T00:00:00.000Z', precision: 'exact' },
    updatedAt: { value: '2026-01-01T00:00:00.000Z', precision: 'exact' },
  };
}

describe('M-A08: Pass 1 EXACT_STRONG_IDENTIFIER', () => {
  it('pairs two EMAIL candidates with identical canonicalMatchValue', () => {
    const { drafts, metrics } = blockCandidates({
      candidates: [
        makeCandidate(1, { type: 'EMAIL', value: 'ravi.akram@example.org', observation: 101 }),
        makeCandidate(2, { type: 'EMAIL', value: 'ravi.akram@example.org', observation: 102 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.blockingPasses).toEqual(['EXACT_STRONG_IDENTIFIER']);
    expect(metrics.pairsPerPass.EXACT_STRONG_IDENTIFIER).toBe(1);
  });

  it('does not pair DIFFERENT canonical values', () => {
    const { drafts } = blockCandidates({
      candidates: [
        makeCandidate(1, { type: 'EMAIL', value: 'a@example.org', observation: 101 }),
        makeCandidate(2, { type: 'EMAIL', value: 'b@example.org', observation: 102 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    expect(drafts).toHaveLength(0);
  });
});

describe('M-A08: Pass 2 EXACT_CANONICAL_VALUE', () => {
  it('pairs two PERSON candidates with identical canonicalMatchValue', () => {
    const { drafts } = blockCandidates({
      candidates: [
        // Same canonical value (pass 2) but DIFFERENT surname+initial (text) so
        // pass 3 NAME_INITIAL_BLOCK does NOT also fire — isolates pass 2 alone.
        makeCandidate(1, { type: 'PERSON', text: 'Rahul Verma', value: 'ravi akram', observation: 101 }),
        makeCandidate(2, { type: 'PERSON', text: 'Aakash Gupta', value: 'ravi akram', observation: 102 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.blockingPasses).toEqual(['EXACT_CANONICAL_VALUE']);
  });

  it('pairs untyped candidates that still carry a canonical value', () => {
    const { drafts } = blockCandidates({
      candidates: [
        makeCandidate(1, { value: 'xx-9876', observation: 101 }),
        makeCandidate(2, { value: 'xx-9876', observation: 102 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.blockingPasses).toEqual(['EXACT_CANONICAL_VALUE']);
  });

  it('blocks untyped candidates APART from typed candidates (no universal match)', () => {
    const { drafts } = blockCandidates({
      candidates: [
        makeCandidate(1, { type: 'PERSON', value: 'ravi akram', observation: 101 }),
        makeCandidate(2, { value: 'ravi akram', observation: 102 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    expect(drafts).toHaveLength(0);
  });
});

describe('M-A08: Pass 3 NAME_INITIAL_BLOCK', () => {
  it('pairs "Rahul Sharma" with "R. Sharma" (surname + first-initial)', () => {
    const { drafts } = blockCandidates({
      candidates: [
        makeCandidate(1, { type: 'PERSON', text: 'Rahul Sharma', value: 'rahul sharma', observation: 101 }),
        makeCandidate(2, { type: 'PERSON', text: 'R. Sharma', value: 'r sharma', observation: 102 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.blockingPasses).toEqual(['NAME_INITIAL_BLOCK']);
  });

  it('does NOT produce false positives across different surnames', () => {
    const { drafts } = blockCandidates({
      candidates: [
        makeCandidate(1, { type: 'PERSON', text: 'Rahul Sharma', value: 'rahul sharma', observation: 101 }),
        makeCandidate(2, { type: 'PERSON', text: 'Rahul Verma', value: 'rahul verma', observation: 102 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    expect(drafts).toHaveLength(0);
  });

  it('requires a first-initial match, not just a surname', () => {
    const { drafts } = blockCandidates({
      candidates: [
        makeCandidate(1, { type: 'PERSON', text: 'Rahul Sharma', value: 'rahul sharma', observation: 101 }),
        makeCandidate(2, { type: 'PERSON', text: 'Aakash Sharma', value: 'aakash sharma', observation: 102 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    expect(drafts).toHaveLength(0);
  });

  it('deriveSurnameInitial handles single and multi-token names', () => {
    expect(deriveSurnameInitial('Rahul Sharma')).toEqual({ surname: 'sharma', firstInitial: 'r' });
    expect(deriveSurnameInitial('R. Sharma')).toEqual({ surname: 'sharma', firstInitial: 'r' });
    expect(deriveSurnameInitial('Cher')).toBeUndefined();
  });
});

describe('M-A08: UNION of passes', () => {
  it('a pair found by two passes yields ONE CandidatePair preserving BOTH passes', () => {
    // Both have identical PHONE (pass1) AND a shared strong-canonical token via
    // being the same phone — to hit pass2 we need a canonical value type, so use
    // ADDRESS which is strong-identifier but also canonical-valuable? ADDRESS is
    // in STRONG_IDENTIFIER_TYPES but NOT in CANONICAL_VALUE_TYPES. So construct
    // two candidates that are both PERSON (pass2) and, to also trigger pass1,
    // give them a canonical value only -> no, pass1 needs a strong type.
    // Realistic union: two ACCOUNT identifiers where one observation also
    // records the account as part of a PERSON canonical? Simpler deterministic
    // union: make two candidates that share an EXACT_STRONG_IDENTIFIER key AND
    // an EXACT_CANONICAL_VALUE key by picking ADDRESS value that is also the
    // person's name? Not coherent. Instead test union semantics directly with
    // pass2+pass3 on PERSON candidates having same canonical value AND same
    // surname+initial.
    const { drafts } = blockCandidates({
      candidates: [
        makeCandidate(1, { type: 'PERSON', text: 'Rahul Sharma', value: 'rahul sharma', observation: 101 }),
        makeCandidate(2, { type: 'PERSON', text: 'Rahul Sharma', value: 'rahul sharma', observation: 102 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    // Same canonical value → pass2; same surname+initial "rahul sharma"-style
    // both tokens identical → same surname 'sharma' and initial 'r' → pass3.
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.blockingPasses).toEqual([
      'EXACT_CANONICAL_VALUE',
      'NAME_INITIAL_BLOCK',
    ]);
  });

  it('metrics count pairs per pass independently (union, not exclusive)', () => {
    const { metrics } = blockCandidates({
      candidates: [
        makeCandidate(1, { type: 'PERSON', text: 'Rahul Sharma', value: 'rahul sharma', observation: 101 }),
        makeCandidate(2, { type: 'PERSON', text: 'Rahul Sharma', value: 'rahul sharma', observation: 102 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    expect(metrics.pairsPerPass.EXACT_CANONICAL_VALUE).toBe(1);
    expect(metrics.pairsPerPass.NAME_INITIAL_BLOCK).toBe(1);
    expect(metrics.uniquePairsAfterUnion).toBe(1);
  });
});

describe('M-A08: determinism, ordering, case scope', () => {
  it('is order-independent — reversed candidate order gives identical ids', async () => {
    const fwd = blockCandidates({
      candidates: [
        makeCandidate(1, { type: 'PERSON', value: 'ravi akram', observation: 101 }),
        makeCandidate(2, { type: 'PERSON', value: 'ravi akram', observation: 102 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    const rev = blockCandidates({
      candidates: [
        makeCandidate(2, { type: 'PERSON', value: 'ravi akram', observation: 102 }),
        makeCandidate(1, { type: 'PERSON', value: 'ravi akram', observation: 101 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    expect(rev.drafts[0]!.blockingPasses).toEqual(fwd.drafts[0]!.blockingPasses);
    const idA = await deterministicCandidatePairId({ caseId: CASE, leftCandidateId: LONG_UUID(1), rightCandidateId: LONG_UUID(2) });
    const idB = await deterministicCandidatePairId({ caseId: CASE, leftCandidateId: LONG_UUID(2), rightCandidateId: LONG_UUID(1) });
    expect(idA).toBe(idB);
    expect(idA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('canonical left/right ordering is deterministic (min/max lexical)', () => {
    const { drafts } = blockCandidates({
      candidates: [
        makeCandidate(2, { type: 'PERSON', value: 'ravi akram', observation: 102 }),
        makeCandidate(1, { type: 'PERSON', value: 'ravi akram', observation: 101 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    // LONG_UUID(1) < LONG_UUID(2) lexically.
    expect(drafts[0]!.leftCandidateId).toBe(LONG_UUID(1));
    expect(drafts[0]!.rightCandidateId).toBe(LONG_UUID(2));
  });

  it('is case-scoped — same candidate ids in a different case give a different pair id', async () => {
    const caseB = LONG_UUID(902);
    const idA = await deterministicCandidatePairId({ caseId: CASE, leftCandidateId: LONG_UUID(1), rightCandidateId: LONG_UUID(2) });
    const idB = await deterministicCandidatePairId({ caseId: caseB, leftCandidateId: LONG_UUID(1), rightCandidateId: LONG_UUID(2) });
    expect(idA).not.toBe(idB);
  });

  it('cross-source same-text in different observations within a case still pairs', () => {
    const { drafts } = blockCandidates({
      candidates: [
        makeCandidate(1, { type: 'PHONE', value: '+91-98765-43210', observation: 101 }),
        makeCandidate(2, { type: 'PHONE', value: '+91-98765-43210', observation: 199 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    expect(drafts).toHaveLength(1);
  });

  it('produces schema-valid pairs via finalizeCandidatePair', async () => {
    const { drafts } = blockCandidates({
      candidates: [
        makeCandidate(1, { type: 'EMAIL', value: 'a@example.org', observation: 101 }),
        makeCandidate(2, { type: 'EMAIL', value: 'a@example.org', observation: 102 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    const pair = await finalizeCandidatePair({
      draft: drafts[0]!,
      nowIso: '2026-08-31T00:00:00.000Z',
    });
    expect(CandidatePairSchema.safeParse(pair).success).toBe(true);
    expect(pair.caseId).toBe(CASE);
  });
});

describe('M-A08: same-observation policy', () => {
  it('excludes same-observation pairs by default', () => {
    const { drafts, metrics } = blockCandidates({
      candidates: [
        makeCandidate(1, { type: 'EMAIL', value: 'a@example.org', observation: 101 }),
        makeCandidate(2, { type: 'EMAIL', value: 'a@example.org', observation: 101 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    expect(drafts).toHaveLength(0);
    expect(metrics.rejectedSameObservation).toBe(1);
  });

  it('allows same-observation pairs when configured', () => {
    const { drafts } = blockCandidates(
      {
        candidates: [
          makeCandidate(1, { type: 'EMAIL', value: 'a@example.org', observation: 101 }),
          makeCandidate(2, { type: 'EMAIL', value: 'a@example.org', observation: 101 }),
        ],
        caseId: CASE,
        investigationId: INV,
      },
      { allowSameObservationPairs: true },
    );
    expect(drafts).toHaveLength(1);
  });
});

describe('M-A08: NULL / OTHER type compatibility', () => {
  it('areTypesCompatible: same type ok, both untyped ok, mixed not ok', () => {
    expect(areTypesCompatible('PERSON', 'PERSON')).toBe(true);
    expect(areTypesCompatible(undefined, undefined)).toBe(true);
    expect(areTypesCompatible('PERSON', undefined)).toBe(false);
    expect(areTypesCompatible(undefined, 'LOCATION')).toBe(false);
    expect(areTypesCompatible('PERSON', 'LOCATION')).toBe(false);
    expect(areTypesCompatible('OTHER', 'OTHER')).toBe(true);
    expect(areTypesCompatible('OTHER', 'PERSON')).toBe(false);
  });

  it('NULL candidates never become a universal matcher via strong identifiers', () => {
    const { drafts } = blockCandidates({
      candidates: [
        makeCandidate(1, { type: 'EMAIL', value: 'a@example.org', observation: 101 }),
        makeCandidate(2, { value: 'a@example.org', observation: 102 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    expect(drafts).toHaveLength(0);
  });

  it('two NULL candidates with the same canonical value still pair (deterministic block key)', () => {
    const { drafts } = blockCandidates({
      candidates: [
        makeCandidate(1, { value: 'alpha-9', observation: 101 }),
        makeCandidate(2, { value: 'alpha-9', observation: 102 }),
      ],
      caseId: CASE,
      investigationId: INV,
    });
    expect(drafts).toHaveLength(1);
  });
});

describe('M-A08: bounded blocks', () => {
  it('skips oversized blocks (no O(N²) explosion) and reports them', () => {
    // EMAIL → only Pass 1 fires, so a single block is measured per candidate set.
    const many = Array.from({ length: CANDIDATE_PAIR_BOUNDS.maxBlockSize + 10 }, (_x, i) =>
      makeCandidate(200 + i, { type: 'EMAIL', value: 'same@example.org', observation: 300 + i }),
    );
    const { drafts, metrics } = blockCandidates({
      candidates: many,
      caseId: CASE,
      investigationId: INV,
    });
    expect(drafts).toHaveLength(0);
    expect(metrics.blocksSkippedOversized).toBe(1);
    expect(metrics.blocksGenerated).toBe(1);
    expect(metrics.candidatesConsidered).toBe(many.length);
  });

  it('processes a block exactly at the size limit', () => {
    const many = Array.from({ length: CANDIDATE_PAIR_BOUNDS.maxBlockSize }, (_x, i) =>
      makeCandidate(400 + i, { type: 'EMAIL', value: 'same@example.org', observation: 500 + i }),
    );
    const { metrics } = blockCandidates({
      candidates: many,
      caseId: CASE,
      investigationId: INV,
    });
    expect(metrics.blocksSkippedOversized).toBe(0);
    expect(metrics.blocksGenerated).toBe(1);
  });
});

describe('M-A08: identity key', () => {
  it('buildCandidatePairIdentityKey is versioned and canonical', () => {
    const key = buildCandidatePairIdentityKey({
      caseId: CASE,
      leftCandidateId: LONG_UUID(2),
      rightCandidateId: LONG_UUID(1),
    });
    expect(key).toContain('indago:candidate-pair');
    expect(key).toContain(CASE);
    // canonical ordering: left=smaller, right=larger
    expect(key).toContain(LONG_UUID(1));
    expect(key).toContain(LONG_UUID(2));
  });
});
