// ============================================================================
// PR16 generation tests (policy §9/§10/§12/§13/§14/§16/§17/§18/§19/§31)
//
// End-to-end: real PR14 classification binding -> per-pair signals -> status
// ceilings -> ranking/dedupe/bound -> frozen contract schema.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { classifyGap } from '@indago/gap-classification';

import {
  generateErSplitExplanations,
  computeExplanationId,
  explanationIdentityFor,
} from '../src/index.js';
import {
  GRAPH_VERSION_ID,
  REGION_ID,
  CAND_A,
  CAND_B,
  CAND_C,
  CAND_D,
  PAIR_AB,
  OBS_A,
  OBS_B,
  OBS_C,
  OBS_D,
  OBS_OTHER,
  OBSERVED_AT,
  ENTITY_A,
  ENTITY_B,
  makeErSplitInput,
  makeMentionCandidate,
  makeObservation,
  makePair,
  makeEntityHypothesis,
} from './helpers.js';

// ---------------------------------------------------------------------------
// §28 Example enumeration (2+2)
// ---------------------------------------------------------------------------

describe('policy §28 scenario A — hypothesis-driven supported split', () => {
  it('emits SUPPORTED with handoff and exact frozen scores', () => {
    const input = makeErSplitInput();
    const result = generateErSplitExplanations(input);

    expect(result.explanationCount).toBe(1);
    const e = result.explanations[0]!;
    expect(e.explanationStatus).toBe('SUPPORTED');
    expect(e.identitySupportScore).toBeCloseTo(0.766, 3);
    expect(e.structuralFitScore).toBe(1);
    expect(e.structuralFit.borderBridging).toBe(true);
    expect(e.structuralFit.holeBoundaryNodeIds).toContain('550e8400-e29b-41d4-a716-446655440003');
    expect(e.requiresAuthorityDecision).toBe(true);
    expect(e.requiresTargetedReblocking).toBe(true);
    expect(e.targetedReblockingHandoff).toEqual({
      targetCandidateIds: [CAND_A, CAND_B],
      targetRegionId: REGION_ID,
      reason: 'ENTITY_FRAGMENTATION_POSSIBILITY',
    });
    expect(e.temporalCompatibility).toBe('COMPATIBLE');
    expect(e.hypothesisId).toBeDefined();
    expect(e.sharedSignals).toContain('EXACT_STRONG_IDENTIFIER_SHARED');
    expect(e.sharedSignals).toContain('HYPOTHESIS_COMPARED_MATCH');
    expect(e.hypothesisScore).toBe(0.72);
    expect(e.uncertainty).toBeCloseTo(0.2053, 3);
    expect(e.statement).toContain('split-compatible');
    expect(e.statement).toContain('NOT an assertion that a split occurred');
  });

  it('explanationId and contextSha256 are content-addressed digests', () => {
    const input = makeErSplitInput();
    const result = generateErSplitExplanations(input);
    const classification = classifyGap(input.context);
    const expectedId = computeExplanationId(
      explanationIdentityFor(input.candidatePairs[0]!, {
        caseId: input.context.caseId,
        graphVersionId: input.context.graphVersionId,
        graphHoleId: classification.graphHoleId,
      }),
    );
    expect(result.explanations[0]!.explanationId).toBe(expectedId);
    expect(result.contextSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.explanations[0]!.contextSha256).toBe(result.contextSha256);
    expect(result.generatedAt).toEqual(OBSERVED_AT);
  });

  it('does not include STRONG_IDENTIFIER_ABSENT when a strong pass is present', () => {
    const result = generateErSplitExplanations(makeErSplitInput());
    expect(result.explanations[0]!.missingDiscriminatingSignals).toContain('CANONICAL_VALUE_ABSENT');
    expect(result.explanations[0]!.missingDiscriminatingSignals).not.toContain('STRONG_IDENTIFIER_ABSENT');
  });
});

describe('policy §28 scenario B — weak blocking-driven split', () => {
  it('emits WEAKLY_SUPPORTED with no reblocking handoff and identity ceiling', () => {
    const input = makeErSplitInput({
      candidatePairs: [makePair({ id: PAIR_AB, leftCandidateId: CAND_A, rightCandidateId: CAND_B, blockingPasses: ['NAME_INITIAL_BLOCK'] })],
      entityHypotheses: [],
    });
    const result = generateErSplitExplanations(input);
    const e = result.explanations[0]!;
    expect(e.explanationStatus).toBe('WEAKLY_SUPPORTED');
    expect(e.identitySupportScore).toBeCloseTo(0.1, 6);
    expect(e.requiresTargetedReblocking).toBe(false);
    expect(e.targetedReblockingHandoff).toBeUndefined();
    expect(e.requiresAuthorityDecision).toBe(true);
    expect(e.missingDiscriminatingSignals).toContain('STRONG_IDENTIFIER_ABSENT');
    expect(e.missingDiscriminatingSignals).toContain('CANONICAL_VALUE_ABSENT');
    expect(e.statement).toContain('Fragmentation is one structurally compatible possibility');
  });
});

describe('policy §28 scenario C — unified pair exclusion', () => {
  it('excludes the pair and counts it as unified', () => {
    const obsA = makeObservation(OBS_A, { entityIds: [ENTITY_A] });
    const obsB = makeObservation(OBS_B, { entityIds: [ENTITY_A] });
    const input = makeErSplitInput({
      observations: [obsA, obsB],
    });
    const result = generateErSplitExplanations(input);
    expect(result.explanations).toHaveLength(0);
    expect(result.excludedPairCounts.unified).toBe(1);
    expect(result.excludedPairCounts.nonSplit).toBe(0);
    expect(result.truncated).toBe(false);
  });
});

describe('policy §28 scenario D — contradiction overrides support', () => {
  it('forces CONTRADICTED and clears decisions', () => {
    const obsOther = makeObservation(OBS_OTHER, { entityIds: [], sourceId: '550e8400-e29b-41d4-a716-44665544000d' });
    const h = makeEntityHypothesis({
      id: '550e8400-e29b-41d4-a716-446655440300',
      candidatePairId: PAIR_AB,
      supportingCandidateIds: [CAND_A, CAND_B],
      supportingObservationIds: [OBS_A, OBS_B],
      contradictingObservationIds: [OBS_OTHER],
    });
    const input = makeErSplitInput({ observations: [makeObservation(OBS_A, { entityIds: [ENTITY_A] }), makeObservation(OBS_B, { entityIds: [ENTITY_B] }), obsOther], entityHypotheses: [h] });
    const result = generateErSplitExplanations(input);
    const e = result.explanations[0]!;
    expect(e.explanationStatus).toBe('CONTRADICTED');
    expect(e.contradictingObservationIds).toContain(OBS_OTHER);
    expect(e.requiresAuthorityDecision).toBe(false);
    expect(e.requiresTargetedReblocking).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §10.2 status ceilings
// ---------------------------------------------------------------------------

describe('policy §10.2 status ceilings', () => {
  it('a connected boundary (bridging false) never reaches SUPPORTED', () => {
    const input = makeErSplitInput({
      edges: [{
        id: '550e8400-e29b-41d4-a716-446655440500',
        investigationId: '550e8400-e29b-41d4-a716-446655440000',
        versionId: GRAPH_VERSION_ID,
        sourceNodeId: '550e8400-e29b-41d4-a716-446655440003',
        targetNodeId: '550e8400-e29b-41d4-a716-446655440004',
        relationType: 'communication',
        status: 'ACTIVE',
        strength: 0.8,
        sourceCount: 1,
        observationCount: 1,
        createdAt: OBSERVED_AT,
        updatedAt: OBSERVED_AT,
      }],
    });
    const result = generateErSplitExplanations(input);
    const e = result.explanations[0]!;
    expect(e.structuralFit.borderBridging).toBe(false);
    expect(['WEAKLY_SUPPORTED', 'PLAUSIBLE', 'CONTRADICTED']).toContain(e.explanationStatus);
    expect(e.explanationStatus).not.toBe('SUPPORTED');
  });

  it('a canonical-value + name pair is PLAUSIBLE (bridging present)', () => {
    const input = makeErSplitInput({
      candidatePairs: [makePair({ id: PAIR_AB, leftCandidateId: CAND_A, rightCandidateId: CAND_B, blockingPasses: ['EXACT_CANONICAL_VALUE', 'NAME_INITIAL_BLOCK'] })],
      entityHypotheses: [],
    });
    const result = generateErSplitExplanations(input);
    expect(result.explanations[0]!.explanationStatus).toBe('PLAUSIBLE');
    expect(result.explanations[0]!.identitySupportScore).toBeCloseTo(0.35, 6);
  });

  it('temporal INCOMPATIBLE forces CONTRADICTED (§16/§17)', () => {
    const obsA = makeObservation(OBS_A, { entityIds: [ENTITY_A], validityInterval: { validFrom: { value: '2020-01-01T00:00:00.000Z', precision: 'exact' }, validTo: { value: '2020-03-01T00:00:00.000Z', precision: 'exact' }, precision: 'exact', semantics: 'observed' } });
    const obsB = makeObservation(OBS_B, { entityIds: [ENTITY_B], validityInterval: { validFrom: { value: '2025-01-01T00:00:00.000Z', precision: 'exact' }, validTo: undefined, precision: 'exact', semantics: 'observed' } });
    const input = makeErSplitInput({ observations: [obsA, obsB] });
    const result = generateErSplitExplanations(input);
    expect(result.explanations[0]!.temporalCompatibility).toBe('INCOMPATIBLE');
    expect(result.explanations[0]!.explanationStatus).toBe('CONTRADICTED');
  });

  it('RESOLVED_NON_MATCH forces CONTRADICTED (§17)', () => {
    const input = makeErSplitInput({
      entityHypotheses: [makeEntityHypothesis({ id: '550e8400-e29b-41d4-a716-446655440300', candidatePairId: PAIR_AB, comparisonStatus: 'RESOLVED_NON_MATCH' })],
    });
    const result = generateErSplitExplanations(input);
    expect(result.explanations[0]!.explanationStatus).toBe('CONTRADICTED');
    expect(result.explanations[0]!.sharedSignals).toContain('HYPOTHESIS_NON_MATCH');
  });
});

// ---------------------------------------------------------------------------
// §9b emission rule + §31 empty-set semantics
// ---------------------------------------------------------------------------

describe('policy §9b emission rule / §31 empty set', () => {
  it('no qualifying pair yields a valid empty, non-throwing set', () => {
    const result = generateErSplitExplanations(makeErSplitInput({ candidatePairs: [], entityHypotheses: [] }));
    expect(result.explanations).toHaveLength(0);
    expect(result.explanationCount).toBe(0);
    expect(result.truncated).toBe(false);
    expect(result.excludedPairCounts).toEqual({ unified: 0, nonSplit: 0 });
  });

  it('a structural bridge without identity evidence emits nothing (nonSplit)', () => {
    // NoCoverage world: obsA/obsB reference canonical entities that do not
    // appear on any boundary node -> both sides empty -> structuralFitScore 0,
    // while identity evidence (a name pass) is positive -> identity alone does
    // not qualify -> the pair is counted nonSplit, not emitted.
    const noCoverageInput = makeErSplitInput({
      observations: [
        makeObservation(OBS_A, { entityIds: ['550e8400-e29b-41d4-a716-446655440009'] }),
        makeObservation(OBS_B, { entityIds: ['550e8400-e29b-41d4-a716-446655440010'] }),
      ],
      candidatePairs: [makePair({ id: PAIR_AB, leftCandidateId: CAND_A, rightCandidateId: CAND_B, blockingPasses: ['NAME_INITIAL_BLOCK'] })],
      entityHypotheses: [],
    });
    const result = generateErSplitExplanations(noCoverageInput);
    expect(result.explanations).toHaveLength(0);
    expect(result.excludedPairCounts.nonSplit).toBe(1);
    expect(result.excludedPairCounts.unified).toBe(0);
    expect(result.truncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §15 dedupe + §14 ranking + bound
// ---------------------------------------------------------------------------

describe('policy §14/§15 ranking, dedupe and bound', () => {
  it('two distinct supported pairs rank deterministically with distinct ids', () => {
    // Pair CD covers the same boundary via different mentions referencing the
    // same two canonical entities (distinct candidates, distinct pair row).
    const obsC = makeObservation(OBS_C, { entityIds: [ENTITY_A] });
    const obsD = makeObservation(OBS_D, { entityIds: [ENTITY_B] });
    const candC = makeMentionCandidate(CAND_C, OBS_C);
    const candD = makeMentionCandidate(CAND_D, OBS_D);
    const pairCD = makePair({ id: '550e8400-e29b-41d4-a716-446655440201', leftCandidateId: CAND_C, rightCandidateId: CAND_D, blockingPasses: ['NAME_INITIAL_BLOCK'] });
    const input = makeErSplitInput({
      observations: [
        makeObservation(OBS_A, { entityIds: [ENTITY_A] }),
        makeObservation(OBS_B, { entityIds: [ENTITY_B] }),
        obsC,
        obsD,
      ],
      candidateUniverse: [makeMentionCandidate(CAND_A, OBS_A), makeMentionCandidate(CAND_B, OBS_B), candC, candD],
      candidatePairs: [makePair({ id: PAIR_AB, leftCandidateId: CAND_A, rightCandidateId: CAND_B }), pairCD],
      entityHypotheses: [],
    });
    const result = generateErSplitExplanations(input);
    expect(result.explanations).toHaveLength(2);
    const ids = new Set(result.explanations.map((e) => e.explanationId));
    expect(ids.size).toBe(2);
    const keys = result.explanations.map((e) => e.rankingKey);
    expect(keys[1]! >= keys[0]!).toBe(true);
    // Rank 1 is the AB pair (direct evidence => SUPPORTED > WEAKLY_SUPPORTED).
    expect(result.explanations[0]!.candidatePairId).toBe(PAIR_AB);
    expect(result.explanations[0]!.explanationStatus).toBe('SUPPORTED');
  });

  it('bounds output to 5 and marks truncated', () => {
    const first = makeObservation(OBS_A, { entityIds: [ENTITY_A] });
    const second = makeObservation(OBS_B, { entityIds: [ENTITY_B] });
    const obs = [first, second];
    const universe = [makeMentionCandidate(CAND_A, OBS_A), makeMentionCandidate(CAND_B, OBS_B)];
    const pairs = [];
    for (let i = 0; i < 7; i++) {
      universe.push(
        makeMentionCandidate(`550e8400-e29b-41d4-a716-44665544${String(0x0300 + i).padStart(4, '0')}`, OBS_A),
        makeMentionCandidate(`550e8400-e29b-41d4-a716-44665544${String(0x0400 + i).padStart(4, '0')}`, OBS_B),
      );
      const left = `550e8400-e29b-41d4-a716-44665544${String(0x0300 + i).padStart(4, '0')}`;
      const right = `550e8400-e29b-41d4-a716-44665544${String(0x0400 + i).padStart(4, '0')}`;
      pairs.push(makePair({ id: `550e8400-e29b-41d4-a716-44665544${String(0x0200 + i).padStart(4, '0')}`, leftCandidateId: left, rightCandidateId: right, blockingPasses: ['NAME_INITIAL_BLOCK'] }));
    }
    const input = makeErSplitInput({ observations: obs, candidateUniverse: universe, candidatePairs: pairs, entityHypotheses: [] });
    const result = generateErSplitExplanations(input);
    expect(result.explanations.length).toBeLessThanOrEqual(5);
    expect(result.explanationCount).toBe(result.explanations.length);
    expect(result.truncated).toBe(true);
    expect(result.excludedPairCounts.nonSplit).toBe(0);
  });

  it('swapped pair orientation collapses to the same content-addressed id', () => {
    const canonical = makeErSplitInput();
    const swapped = makeErSplitInput({
      candidatePairs: [makePair({ id: PAIR_AB, leftCandidateId: CAND_B, rightCandidateId: CAND_A })],
    });
    const a = generateErSplitExplanations(canonical);
    const b = generateErSplitExplanations(swapped);
    expect(a.explanations[0]!.explanationId).toBe(b.explanations[0]!.explanationId);
    expect(a.explanations).toHaveLength(1);
    expect(b.explanations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// §24 byte determinism
// ---------------------------------------------------------------------------

describe('policy §24 determinism', () => {
  it('shuffled ER-split slice order changes nothing', () => {
    const input = makeErSplitInput();
    const baseline = generateErSplitExplanations(input);
    // The raw context (and so contextSha256) is untouched; only the bounded
    // ER-split slice arrays (pairs/hypotheses/universe) are rearranged.
    const shuffled = makeErSplitInput({
      candidateUniverse: [input.candidateUniverse[1]!, input.candidateUniverse[0]!],
      candidatePairs: [input.candidatePairs[0]!],
      entityHypotheses: [input.entityHypotheses[0]!],
    });
    const after = generateErSplitExplanations(shuffled);
    expect(after).toEqual(baseline);
  });

  it('repeated calls are byte-identical', () => {
    const input = makeErSplitInput();
    expect(generateErSplitExplanations(input)).toEqual(generateErSplitExplanations(makeErSplitInput()));
  });

  it('deep-frozen inputs are read without mutation (authority boundary)', () => {
    const input = makeErSplitInput();
    const deepFreeze = (o: unknown): unknown => {
      if (o && typeof o === 'object') {
        Object.freeze(o);
        for (const v of Object.values(o)) deepFreeze(v);
      }
      return o;
    };
    deepFreeze(input);
    expect(() => generateErSplitExplanations(input)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// §10.1 wording
// ---------------------------------------------------------------------------

describe('policy §10.1 statement wording', () => {
  it('all emitted statements are split-compatible, never an assertion of a split', () => {
    const input = makeErSplitInput();
    const result = generateErSplitExplanations(input);
    for (const e of result.explanations) {
      expect(e.statement.length).toBeGreaterThan(0);
      expect(e.statement).toMatch(/split-compatible|structurally compatible/);
      expect(e.statement).not.toMatch(/proven|confirmed|definitely/i);
    }
  });
});