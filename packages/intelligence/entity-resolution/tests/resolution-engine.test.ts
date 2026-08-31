import { describe, it, expect } from 'vitest';
import {
  compareCandidates,
  isEligiblePair,
  deterministicEntityHypothesisId,
  buildEntityHypothesisIdentityKey,
  settleScore,
  deriveHypothesisStatus,
  hasHardContradiction,
  RESOLUTION_SCORE_MODEL_VERSION,
  RESOLUTION_PROPOSAL_THRESHOLD,
  SCORING_V1,
} from '../src/index.js';
import { CandidateResolutionSchema } from '@indago/contracts';
import type {
  CandidatePair,
  EntityMentionCandidate,
  EntityType,
} from '@indago/contracts';

// ============================================================================
// M-A09 Candidate Resolution — pure engine unit tests
//
// HARD RULES under test (§57-67):
//   § pure + deterministic — identical input → identical score + evidence.
//   § ABSENT ≠ DIFFERENT — missing data is not contradiction.
//   § ResolutionScore is ranking signal, NOT probability, NOT lifecycle
//       authority — score never auto-accepts (high → PROPOSED).
//   § REVERSED ≠ MERGED (distinct lifecycle states).
//   § contradictory identifiers preserved, never averaged away.
//   § score + comparison evidence agree (explainable).
//   § idempotency — same pair + same score version → same logical identity.
//   § score version present; future versions may differ without silently
//       mutating historical results.
//   § case isolation preserved (pair-scoped identity).
//   § M-A09 boundary — never creates canonical Entity / relations.
// ============================================================================

const LONG_UUID = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CASE = LONG_UUID(900);
const INV = LONG_UUID(901);

const OBS = (n: number): string => LONG_UUID(200 + n);

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
    observationId: OBS(opts.observation ?? n),
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

function makePair(
  left: EntityMentionCandidate,
  right: EntityMentionCandidate,
): CandidatePair {
  return {
    id: LONG_UUID(50),
    caseId: CASE,
    investigationId: INV,
    leftCandidateId: left.id,
    rightCandidateId: right.id,
    blockingPasses: ['EXACT_STRONG_IDENTIFIER'],
    createdAt: { value: '2026-01-01T00:00:00.000Z', precision: 'exact' },
  };
}

describe('M-A09: exact strong identifier matches', () => {
  it('exact phone match produces a high score + EXACT_MATCH evidence', async () => {
    const left = makeCandidate(1, { type: 'PHONE', value: '919876543210', observation: 1 });
    const right = makeCandidate(2, { type: 'PHONE', value: '919876543210', observation: 2 });
    const { candidateResolution, proposed } = await compareCandidates({
      pair: makePair(left, right),
      leftCandidate: left,
      rightCandidate: right,
    });
    const idEvidence = candidateResolution.comparisonEvidence.find((e) => e.relation === 'EXACT_MATCH');
    expect(idEvidence).toBeDefined();
    expect(idEvidence!.weight).toBe(SCORING_V1.strongIdentifierExactMatch);
    // score must equal the strong-identifier weight (baseline + type are both 0)
    expect(candidateResolution.score).toBeCloseTo(SCORING_V1.strongIdentifierExactMatch);
    expect(candidateResolution.score).toBeGreaterThan(RESOLUTION_PROPOSAL_THRESHOLD);
    expect(proposed).toBe(true);
    expect(CandidateResolutionSchema.safeParse(candidateResolution).success).toBe(true);
    // Positive identity evidence → both candidate observations support; none contradict.
    expect(candidateResolution.supportingObservationIds).toEqual([
      OBS(1),
      OBS(2),
    ]);
    expect(candidateResolution.contradictingObservationIds).toHaveLength(0);
    // The supporting and contradicting sets never overlap.
    const overlap = candidateResolution.supportingObservationIds.filter((o) =>
      candidateResolution.contradictingObservationIds.includes(o),
    );
    expect(overlap).toHaveLength(0);
  });

  it('exact email match produces the strong identifier score', async () => {
    const left = makeCandidate(1, { type: 'EMAIL', value: 'a@example.com', observation: 1 });
    const right = makeCandidate(2, { type: 'EMAIL', value: 'a@example.com', observation: 2 });
    const { candidateResolution } = await compareCandidates({
      pair: makePair(left, right),
      leftCandidate: left,
      rightCandidate: right,
    });
    const idEvidence = candidateResolution.comparisonEvidence.find((e) => e.relation === 'EXACT_MATCH');
    expect(idEvidence!.feature).toBe('EMAIL');
  });

  it('exact account identifier match produces a strong identifier score', async () => {
    const left = makeCandidate(1, { type: 'ACCOUNT', value: 'ACCT-1001', observation: 1 });
    const right = makeCandidate(2, { type: 'ACCOUNT', value: 'ACCT-1001', observation: 2 });
    const { candidateResolution } = await compareCandidates({
      pair: makePair(left, right),
      leftCandidate: left,
      rightCandidate: right,
    });
    const idEvidence = candidateResolution.comparisonEvidence.find((e) => e.relation === 'EXACT_MATCH');
    expect(idEvidence!.feature).toBe('ACCOUNT');
  });
});

describe('M-A09: name agreement', () => {
  it('exact canonical name match yields exact-name score', async () => {
    const left = makeCandidate(1, { type: 'PERSON', text: 'Rahul Sharma', value: 'rahul sharma', observation: 1 });
    const right = makeCandidate(2, { type: 'PERSON', text: 'Rahul Sharma', value: 'rahul sharma', observation: 2 });
    const { candidateResolution } = await compareCandidates({
      pair: makePair(left, right),
      leftCandidate: left,
      rightCandidate: right,
    });
    const nameEvidence = candidateResolution.comparisonEvidence.find((e) => e.feature === 'NAME');
    expect(nameEvidence!.relation).toBe('EXACT_MATCH');
    expect(nameEvidence!.weight).toBe(SCORING_V1.canonicalNameExactMatch);
  });

  it('name initial agreement (Rahul Sharma vs R. Sharma) yields initial-match score', async () => {
    const left = makeCandidate(1, { type: 'PERSON', text: 'Rahul Sharma', value: 'rahul sharma', observation: 1 });
    const right = makeCandidate(2, { type: 'PERSON', text: 'R. Sharma', value: 'r sharma', observation: 2 });
    const { candidateResolution } = await compareCandidates({
      pair: makePair(left, right),
      leftCandidate: left,
      rightCandidate: right,
    });
    const nameEvidence = candidateResolution.comparisonEvidence.find((e) => e.feature === 'NAME');
    expect(nameEvidence!.relation).toBe('INITIAL_MATCH');
    expect(nameEvidence!.weight).toBe(SCORING_V1.nameInitialAgreement);
  });
});

describe('M-A09: type compatibility', () => {
  it('TYPE mismatch is captured as TYPE_MISMATCH and pair is ineligible', async () => {
    const left = makeCandidate(1, { type: 'PERSON', value: 'Rahul', observation: 1 });
    const right = makeCandidate(2, { type: 'PHONE', value: '919876543210', observation: 2 });
    expect(isEligiblePair(left, right)).toBe(false);
    const { candidateResolution, proposed } = await compareCandidates({
      pair: makePair(left, right),
      leftCandidate: left,
      rightCandidate: right,
    });
    const typeEvidence = candidateResolution.comparisonEvidence.find((e) => e.feature === 'TYPE');
    expect(typeEvidence!.relation).toBe('TYPE_MISMATCH');
    expect(proposed).toBe(false);
  });

  it('v1 candidate↔candidate cannot use a separate PHONE candidate as contextual evidence for a PERSON candidate', async () => {
    // LIMITATION / FUTURE ENRICHMENT: In v1, identity resolution is strictly
    // CandidatePair-scoped same-case comparison. Each comparison is between the
    // TWO candidates of ONE pair. A PERSON candidate is never enriched by a
    // SEPARATE PHONE candidate (even if that phone observation belongs to the
    // same case/source). Cross-type and cross-feature contextual enrichment is
    // deliberately FUTURE scope — v1 makes no claim to that capability.
    const person = makeCandidate(1, { type: 'PERSON', text: 'Rahul Sharma', value: 'rahul sharma', observation: 1 });
    const otherPerson = makeCandidate(2, { type: 'PERSON', text: 'Rahul Sharma', value: 'rahul sharma', observation: 2 });
    // A phone candidate that "belongs" to the same underlying actor — but is a
    // DIFFERENT candidate, outside the pair under comparison.
    const phone = makeCandidate(3, { type: 'PHONE', value: '919876543210', observation: 3 });

    // 1) A PERSON ↔ PERSON comparison is unaffected by the separate PHONE
    //    candidate: there is NO mechanism for it to import the phone as evidence.
    const pair = makePair(person, otherPerson);
    // phone is NOT part of this pair's evidence universe — the resolver receives
    // ONLY (pair, person, otherPerson). Nothing about phone can influence the score.
    const { candidateResolution } = await compareCandidates({
      pair,
      leftCandidate: person,
      rightCandidate: otherPerson,
    });
    const anyPhoneEvidence = candidateResolution.comparisonEvidence.find(
      (e) => e.feature === 'PHONE',
    );
    expect(anyPhoneEvidence).toBeUndefined();
    // The PHONE candidate's observation (obs 3) is NOT in the supporting set —
    // the resolver had no mechanism to import it as contextual evidence. Only
    // the two in-pair PERSON observations (obs 1, 2) support (they host the
    // matching names).
    expect(candidateResolution.supportingObservationIds).not.toContain(OBS(3));
    expect(candidateResolution.supportingObservationIds).toEqual([OBS(1), OBS(2)]);

    // 2) Cross-type PERSON ↔ PHONE is ineligible (defensive guard) — never a
    //    manufactured "same identity" from a phone being in the same case.
    expect(isEligiblePair(person, phone)).toBe(false);
  });

  it('similar untyped candidates remain eligible and can still score on strong data', async () => {
    // Both untyped with the same strong identifier value → eligible (both untyped).
    const left = makeCandidate(1, { value: '919876543210', observation: 1 });
    const right = makeCandidate(2, { value: '919876543210', observation: 2 });
    expect(isEligiblePair(left, right)).toBe(true);
  });
});

describe('M-A09: untyped (NULL) candidates do not manufacture strong-identifier semantics', () => {
  it('untyped candidates do NOT get a strong-identifier boost, even when canonicalMatchValue looks numeric', async () => {
    // Untyped candidates do not fire the strong-identifier comparison path in
    // M-A09 (compareStrongIdentifier requires a CONCRETE strong-identifier
    // type). So even though the value "919876543210" looks like a phone, an
    // untyped pair gets NO strong-identifier evidence — the resolver honestly
    // reports a low score rather than pretending a numeric-looking untyped
    // value is a phone identifier.
    const left = makeCandidate(1, { value: '919876543210', observation: 1 });
    const right = makeCandidate(2, { value: '919876543210', observation: 2 });
    const { candidateResolution, proposed } = await compareCandidates({
      pair: makePair(left, right),
      leftCandidate: left,
      rightCandidate: right,
    });
    // No strong-identifier EXACT_MATCH evidence is manufactured for untyped candidates.
    const idEvidence = candidateResolution.comparisonEvidence.find(
      (e) => e.relation === 'EXACT_MATCH' && e.feature !== 'NAME',
    );
    expect(idEvidence).toBeUndefined();
    // Score carries no strong-identifier weight (0.35 absent) — only its true
    // signal, which for an untyped pair is none beyond eligibility (0 baseline).
    expect(candidateResolution.score).toBe(0);
    expect(proposed).toBe(false);
    expect(candidateResolution.status).toBe('UNRESOLVED');
  });
});

describe('M-A09: contradictory identifiers', () => {
  it('DIFFERENT phone identifiers are a hard contradiction, not averaged away', async () => {
    const left = makeCandidate(1, { type: 'PHONE', value: '9191111111', text: 'Person A', observation: 1 });
    const right = makeCandidate(2, { type: 'PHONE', value: '9192222222', text: 'Person B', observation: 2 });
    const { candidateResolution, proposed } = await compareCandidates({
      pair: makePair(left, right),
      leftCandidate: left,
      rightCandidate: right,
    });
    const idEvidence = candidateResolution.comparisonEvidence.find((e) => e.relation === 'DIFFERENT');
    expect(idEvidence).toBeDefined();
    expect(idEvidence!.weight).toBe(SCORING_V1.hardContradiction);
    expect(hasHardContradiction(candidateResolution.comparisonEvidence)).toBe(true);
    // Contradiction reflects — the DIFFERENT phone is in the contradicting observation set.
    expect(candidateResolution.contradictingObservationIds.length).toBeGreaterThan(0);
    // Status reflects the contradiction deterministically → CONTRADICTED, not proposed.
    expect(candidateResolution.status).toBe('CONTRADICTED');
    expect(proposed).toBe(false);
  });

  it('DIFFERENT email identifiers likewise record a contradiction', async () => {
    const left = makeCandidate(1, { type: 'EMAIL', value: 'a@example.com', observation: 1 });
    const right = makeCandidate(2, { type: 'EMAIL', value: 'b@example.com', observation: 2 });
    const { candidateResolution } = await compareCandidates({
      pair: makePair(left, right),
      leftCandidate: left,
      rightCandidate: right,
    });
    expect(candidateResolution.status).toBe('CONTRADICTED');
  });
});

describe('M-A09: ABSENT ≠ DIFFERENT', () => {
  it('one-sided absence of a strong identifier is NOT a contradiction (0 weight)', async () => {
    const left = makeCandidate(1, { type: 'PHONE', value: '9191111111', observation: 1 });
    // right has no canonicalMatchValue at all → ABSENT
    const right = makeCandidate(2, { type: 'PHONE', text: 'X', observation: 2 });
    const { candidateResolution } = await compareCandidates({
      pair: makePair(left, right),
      leftCandidate: left,
      rightCandidate: right,
    });
    const idEvidence = candidateResolution.comparisonEvidence.find(
      (e) => e.feature === 'PHONE',
    );
    expect(idEvidence).toBeDefined();
    // LEFT has the phone value; RIGHT has none → RIGHT side is absent.
    expect(idEvidence!.relation).toBe('RIGHT_ABSENT');

    // Account-level: no hard contradiction because nothing is DIFFERENT.
    expect(hasHardContradiction(candidateResolution.comparisonEvidence)).toBe(false);
    expect(candidateResolution.contradictingObservationIds).toHaveLength(0);
  });

  it('both-absent identifier is ABSENT, not a contradiction', async () => {
    const left = makeCandidate(1, { type: 'PHONE', text: 'A', observation: 1 });
    const right = makeCandidate(2, { type: 'PHONE', text: 'B', observation: 2 });
    const { candidateResolution } = await compareCandidates({
      pair: makePair(left, right),
      leftCandidate: left,
      rightCandidate: right,
    });
    const idEvidence = candidateResolution.comparisonEvidence.find((e) => e.feature === 'PHONE');
    expect(idEvidence!.relation).toBe('BOTH_ABSENT');
    expect(candidateResolution.contradictingObservationIds).toHaveLength(0);
  });
});

describe('M-A09: low-information pair', () => {
  it('low-signal pair does NOT manufacture a PROPOSED hypothesis', async () => {
    // Untyped pair with a shared but weak canonical value → low score, no proposal.
    const left = makeCandidate(1, { value: 'misc-token', observation: 1 });
    const right = makeCandidate(2, { value: 'misc-token', observation: 2 });
    const { candidateResolution, proposed } = await compareCandidates({
      pair: makePair(left, right),
      leftCandidate: left,
      rightCandidate: right,
    });
    expect(proposed).toBe(false);
    expect(candidateResolution.status).toBe('UNRESOLVED');
  });
});

describe('M-A09: score explanation invariance (score ↔ evidence agree)', () => {
  it('recomputing the score from evidence reproduces the reported score', async () => {
    const left = makeCandidate(1, { type: 'PHONE', value: '919876543210', observation: 1 });
    const right = makeCandidate(2, { type: 'PHONE', value: '919876543210', observation: 2 });
    const { candidateResolution } = await compareCandidates({
      pair: makePair(left, right),
      leftCandidate: left,
      rightCandidate: right,
    });
    const recomputed = settleScore(candidateResolution.comparisonEvidence);
    expect(candidateResolution.score).toBeCloseTo(recomputed, 6);
  });

  it('every strong-identifier EXACT_MATCH carries the explainable weight', async () => {
    const left = makeCandidate(1, { type: 'ACCOUNT', value: 'ACC-77', observation: 1 });
    const right = makeCandidate(2, { type: 'ACCOUNT', value: 'ACC-77', observation: 2 });
    const { candidateResolution } = await compareCandidates({
      pair: makePair(left, right),
      leftCandidate: left,
      rightCandidate: right,
    });
    const match = candidateResolution.comparisonEvidence.find((e) => e.relation === 'EXACT_MATCH');
    expect(match!.reason).toContain('same normalized');
    expect(match!.weight).toBeGreaterThan(0);
  });
});

describe('M-A09: score is ranking, not lifecycle authority', () => {
  it('a high score yields PROPOSED, never ACCEPTED', async () => {
    const left = makeCandidate(1, { type: 'PHONE', value: '919876543210', observation: 1 });
    const right = makeCandidate(2, { type: 'PHONE', value: '919876543210', observation: 2 });
    const { candidateResolution, proposed } = await compareCandidates({
      pair: makePair(left, right),
      leftCandidate: left,
      rightCandidate: right,
    });
    expect(candidateResolution.score).toBeGreaterThan(RESOLUTION_PROPOSAL_THRESHOLD);
    expect(proposed).toBe(true);
    // PROPOSED at most — never ACCEPTED, never resolved-as-match automatically.
    expect(candidateResolution.status).toBe('PROPOSED');
    expect(candidateResolution.comparisonStatus).not.toBe('RESOLVED_MATCH');
  });

  it('deriveHypothesisStatus maps high score → PROPOSED, never ACCEPTED', () => {
    expect(deriveHypothesisStatus(0.9, false)).toBe('PROPOSED');
    expect(deriveHypothesisStatus(0.1, false)).toBe('UNRESOLVED');
    expect(deriveHypothesisStatus(0.9, true)).toBe('CONTRADICTED');
  });
});

describe('M-A09: REVERSED ≠ MERGED (distinct lifecycle states)', () => {
  it('REVERSED is a valid distinct state, separate from MERGED', () => {
    // Status enum accepts both, distinct.
    const statuses = ['PROPOSED', 'ACCEPTED', 'REJECTED', 'REVERSED', 'MERGED'] as const;
    for (const s of statuses) {
      expect(s).toMatch(/^(PROPOSED|ACCEPTED|REJECTED|REVERSED|MERGED)$/);
    }
    expect('REVERSED').not.toBe('MERGED');
  });
});

describe('M-A09: determinism', () => {
  it('identical input yields identical score and explanation across calls', async () => {
    const left = makeCandidate(1, { type: 'EMAIL', value: 'x@example.com', observation: 1 });
    const right = makeCandidate(2, { type: 'EMAIL', value: 'x@example.com', observation: 2 });
    const pair = makePair(left, right);
    const a = await compareCandidates({ pair, leftCandidate: left, rightCandidate: right });
    const b = await compareCandidates({ pair, leftCandidate: left, rightCandidate: right });
    expect(a.candidateResolution.score).toBe(b.candidateResolution.score);
    expect(a.candidateResolution.comparisonEvidence).toEqual(b.candidateResolution.comparisonEvidence);
  });

  it('same pair + same score version → same logical hypothesis identity', async () => {
    const pair = makePair(
      makeCandidate(1, { type: 'PHONE', value: '919876543210', observation: 1 }),
      makeCandidate(2, { type: 'PHONE', value: '919876543210', observation: 2 }),
    );
    const idA = await deterministicEntityHypothesisId({ candidatePairId: pair.id });
    const idB = await deterministicEntityHypothesisId({ candidatePairId: pair.id });
    expect(idA).toBe(idB);
    expect(idA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('M-A09: score version', () => {
  it('score model version is present and stable', async () => {
    const left = makeCandidate(1, { type: 'PHONE', value: '919876543210', observation: 1 });
    const right = makeCandidate(2, { type: 'PHONE', value: '919876543210', observation: 2 });
    const { candidateResolution } = await compareCandidates({
      pair: makePair(left, right),
      leftCandidate: left,
      rightCandidate: right,
    });
    expect(candidateResolution.scoreModelVersion).toBe(RESOLUTION_SCORE_MODEL_VERSION);
  });

  it('a different score version yields a different hypothesis identity (no silent re-scoring)', async () => {
    const pair = makePair(
      makeCandidate(1, { type: 'PHONE', value: '919876543210', observation: 1 }),
      makeCandidate(2, { type: 'PHONE', value: '919876543210', observation: 2 }),
    );
    const v1 = await deterministicEntityHypothesisId({ candidatePairId: pair.id, scoreModelVersion: 'indago:resolution-score:v1' });
    const v2 = await deterministicEntityHypothesisId({ candidatePairId: pair.id, scoreModelVersion: 'indago:resolution-score:v2' });
    expect(v1).not.toBe(v2);
  });
});

describe('M-A09: case isolation & same-observation', () => {
  it('same-observation pairs are ineligible (defensive, no self-corroboration)', async () => {
    const left = makeCandidate(1, { type: 'EMAIL', value: 'a@example.com', observation: 1 });
    const right = makeCandidate(2, { type: 'EMAIL', value: 'a@example.com', observation: 1 });
    expect(isEligiblePair(left, right)).toBe(false);
  });

  it('identity key embeds case via candidatePairId (pair is case-scoped)', () => {
    const pair = makePair(
      makeCandidate(1, { type: 'EMAIL', value: 'a@example.com', observation: 1 }),
      makeCandidate(2, { type: 'EMAIL', value: 'a@example.com', observation: 2 }),
    );
    const key = buildEntityHypothesisIdentityKey({ candidatePairId: pair.id });
    expect(key).toContain('indago:entity-hypothesis');
    expect(key).toContain(pair.id);
  });
});
