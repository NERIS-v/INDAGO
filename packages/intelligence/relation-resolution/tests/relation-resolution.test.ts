import { describe, it, expect } from 'vitest';
import {
  settleRelationScore,
  deriveRelationHypothesisStatus,
  shouldProposeRelationHypothesis,
  hasHardRelationContradiction,
  scoreRelationPair,
  computeEvidenceStrength,
  computeSourceCoverage,
  computeTemporalCoverage,
  hasTemporalRelationProximity,
  classifyObservationRelationType,
  pickRelationType,
  detectRelationCandidates,
  resolveRelationPair,
  resolveRelationsForCase,
  deterministicRelationHypothesisId,
  buildRelationHypothesisIdentityKey,
  indexObservations,
  buildObservationsByType,
  RELATION_RESOLUTION_BOUNDS,
  RELATION_SCORE_MODEL_VERSION,
  RELATION_PROPOSAL_THRESHOLD,
  RELATION_SCORING_V1,
  RELATION_DIRECTION,
  isRelationDirected,
  resolveRelationDirected,
} from '../src/index.js';
import type {
  EntityEvidence,
  RelationResolution,
} from '../src/index.js';
import type { Observation, RelationType } from '@indago/contracts';

// ============================================================================
// M-A10 Relation Resolution — pure engine unit tests
//
// HARD RULES under test:
//   § pure + deterministic — identical input → identical resolution.
//   § SOURCE-GROUNDING invariant — relation only from Observation
//     co-occurrence (never graph proximity).
//   § ABSENT ≠ DIFFERENT — missing data is never a contradiction.
//   § RelationSupport is a RANKING signal, NOT a probability, and score never
//       auto-accepts (high score → PROPOSED at most).
//   § canonical-entity precondition — engine consumes canonical EntityIds,
//       never mention/candidate-pair ids.
//   § idempotent identity — same pair + same type + same score version → same
//       logical hypothesis id.
//   § contradiction handling — explicit contradiction flips to REJECTED.
//   § type classification is deterministic + source-grounded (never graph).
// ============================================================================

const UUID = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const OBS_ID = (n: number): string => UUID(100 + n);
const SOURCE_ID = (n: number): string => UUID(400 + n);
const ENT_ID = (n: number): string => UUID(500 + n);

const T0 = '2024-02-01T00:00:00.000Z';
const T1 = '2024-02-02T00:00:00.000Z';
const T2 = '2024-02-03T00:00:00.000Z';

function makeObservation(
  n: number,
  opts: {
    type?: Observation['type'];
    content?: string;
    source?: number;
    entityIds?: readonly string[];
    strength?: number;
    observedAt?: string;
  } = {},
): Observation {
  return {
    id: OBS_ID(n),
    evidenceId: UUID(1),
    sourceId: SOURCE_ID(opts.source ?? 1),
    type: opts.type ?? 'FACTUAL',
    content: opts.content ?? `observation ${n}`,
    entityIds: [...(opts.entityIds ?? [])],
    candidateMentions: [],
    strength: opts.strength ?? 1,
    provenance: {
      sourceId: SOURCE_ID(opts.source ?? 1),
      artifactId: UUID(2),
      extractor: 'indago-observation-extractor@1.0.0',
      extractionMethod: 'text-decode',
    },
    observedAt: opts.observedAt
      ? { value: opts.observedAt, precision: 'exact' }
      : undefined,
    createdAt: { value: T1, precision: 'exact' },
    updatedAt: { value: T1, precision: 'exact' },
  };
}

function makeEntity(n: number, observationIds: readonly string[]): EntityEvidence {
  return { id: ENT_ID(n), observationIds: [...observationIds] };
}

describe('M-A10: scoring model v1 — weights & settlement', () => {
  it('single co-occurrence yields baseline + co-occurrence weight', () => {
    const obs = [makeObservation(1, { entityIds: [ENT_ID(1), ENT_ID(2)] })];
    const { score } = scoreRelationPair({
      coOccurrenceObservations: obs,
      allObservations: obs,
      relationType: 'other',
      temporalWindowMs: RELATION_RESOLUTION_BOUNDS.temporalProximityWindowMs,
    });
    expect(score).toBeCloseTo(
      RELATION_SCORING_V1.baseline + RELATION_SCORING_V1.coOccurrence,
      6,
    );
  });

  it('repeated co-occurrence across observations adds repeated-co-occurrence weight', () => {
    const obs = [
      makeObservation(1, { entityIds: [ENT_ID(1), ENT_ID(2)] }),
      makeObservation(2, { entityIds: [ENT_ID(1), ENT_ID(2)] }),
    ];
    const { score } = scoreRelationPair({
      coOccurrenceObservations: obs,
      allObservations: obs,
      relationType: 'other',
      temporalWindowMs: RELATION_RESOLUTION_BOUNDS.temporalProximityWindowMs,
    });
    const expected =
      RELATION_SCORING_V1.baseline +
      RELATION_SCORING_V1.coOccurrence +
      RELATION_SCORING_V1.repeatedCoOccurrence;
    expect(score).toBeCloseTo(expected, 6);
    expect(score).toBeGreaterThan(RELATION_PROPOSAL_THRESHOLD);
  });

  it('source diversity across independent sources adds that weight', () => {
    const obs = [
      makeObservation(1, { entityIds: [ENT_ID(1), ENT_ID(2)], source: 1 }),
      makeObservation(2, { entityIds: [ENT_ID(1), ENT_ID(2)], source: 2 }),
    ];
    const { score } = scoreRelationPair({
      coOccurrenceObservations: obs,
      allObservations: obs,
      relationType: 'other',
      temporalWindowMs: RELATION_RESOLUTION_BOUNDS.temporalProximityWindowMs,
    });
    const expected =
      RELATION_SCORING_V1.baseline +
      RELATION_SCORING_V1.coOccurrence +
      RELATION_SCORING_V1.repeatedCoOccurrence +
      RELATION_SCORING_V1.sourceDiversity;
    expect(score).toBeCloseTo(expected, 6);
  });

  it('temporal proximity is awarded when co-occurrence spans a narrow window', () => {
    const obs = [
      makeObservation(1, { entityIds: [ENT_ID(1), ENT_ID(2)], observedAt: T0 }),
      makeObservation(2, { entityIds: [ENT_ID(1), ENT_ID(2)], observedAt: T1 }),
    ];
    const { score } = scoreRelationPair({
      coOccurrenceObservations: obs,
      allObservations: obs,
      relationType: 'other',
      temporalWindowMs: RELATION_RESOLUTION_BOUNDS.temporalProximityWindowMs,
    });
    const expected =
      RELATION_SCORING_V1.baseline +
      RELATION_SCORING_V1.coOccurrence +
      RELATION_SCORING_V1.repeatedCoOccurrence +
      RELATION_SCORING_V1.temporalProximity;
    expect(score).toBeCloseTo(expected, 6);
  });

  it('type signal from observation type classification adds typeSignal weight', () => {
    const obs = [
      makeObservation(1, { type: 'FINANCIAL', entityIds: [ENT_ID(1), ENT_ID(2)], observedAt: T0 }),
    ];
    const byType = buildObservationsByType(obs);
    const { score } = scoreRelationPair({
      coOccurrenceObservations: obs,
      allObservations: obs,
      relationType: 'financial',
      observationsByType: byType,
      temporalWindowMs: RELATION_RESOLUTION_BOUNDS.temporalProximityWindowMs,
    });
    const expected =
      RELATION_SCORING_V1.baseline +
      RELATION_SCORING_V1.coOccurrence +
      RELATION_SCORING_V1.typeSignal;
    expect(score).toBeCloseTo(expected, 6);
  });

  it('score is clamped to [0, 1] and never exceeds bounds', () => {
    const big = settleRelationScore([0.6, 0.5, 0.5, 0.5]);
    expect(big).toBe(RELATION_SCORING_V1.maxScore);
    const negative = settleRelationScore([RELATION_SCORING_V1.hardContradiction]);
    expect(negative).toBe(RELATION_SCORING_V1.minScore);
  });

  it('score is a ranking signal, NOT a probability — validate bounds semantics', () => {
    // A score above the proposal threshold maps to PROPOSED, never ACCEPTED.
    expect(RELATION_PROPOSAL_THRESHOLD).toBeGreaterThan(0);
    expect(deriveRelationHypothesisStatus(0.9, false)).toBe('PROPOSED');
  });
});

describe('M-A10: ABSENT ≠ DIFFERENT', () => {
  it('missing time data is never treated as temporal proximity', () => {
    const obsNoTime = [
      makeObservation(1, { entityIds: [ENT_ID(1), ENT_ID(2)] }),
      makeObservation(2, { entityIds: [ENT_ID(1), ENT_ID(2)] }),
    ];
    const withTime = [
      makeObservation(1, { entityIds: [ENT_ID(1), ENT_ID(2)], observedAt: T0 }),
      makeObservation(2, { entityIds: [ENT_ID(1), ENT_ID(2)], observedAt: T1 }),
    ];
    expect(
      hasTemporalRelationProximity(
        obsNoTime,
        RELATION_RESOLUTION_BOUNDS.temporalProximityWindowMs,
      ),
    ).toBe(false);
    expect(
      hasTemporalRelationProximity(
        withTime,
        RELATION_RESOLUTION_BOUNDS.temporalProximityWindowMs,
      ),
    ).toBe(true);
  });

  it('missing strength data is treated as zero evidence, not a contradiction', () => {
    const obs = [
      makeObservation(1, {
        entityIds: [ENT_ID(1), ENT_ID(2)],
        strength: 0,
      }),
    ];
    expect(computeEvidenceStrength(obs)).toBe(0);
  });
});

describe('M-A10: contradiction handling', () => {
  it('an explicit hard contradiction rejects the hypothesis', () => {
    const obs = [
      makeObservation(1, { entityIds: [ENT_ID(1), ENT_ID(2)], observedAt: T0 }),
      makeObservation(2, { entityIds: [ENT_ID(1), ENT_ID(2)], observedAt: T1 }),
    ];
    const { score, hasHardContradiction } = scoreRelationPair({
      coOccurrenceObservations: obs,
      allObservations: obs,
      relationType: 'other',
      explicitContradiction: true,
      temporalWindowMs: RELATION_RESOLUTION_BOUNDS.temporalProximityWindowMs,
    });
    expect(hasHardContradiction).toBe(true);
    expect(hasHardRelationContradiction([
      RELATION_SCORING_V1.hardContradiction,
    ])).toBe(true);
    // A hard contradiction forces status REJECTED regardless of score reset to floor.
    expect(deriveRelationHypothesisStatus(score, true)).toBe('REJECTED');
    expect(shouldProposeRelationHypothesis(score, true)).toBe(false);
  });

  it('deriveRelationHypothesisStatus maps score + contradiction deterministically', () => {
    expect(deriveRelationHypothesisStatus(0.9, false)).toBe('PROPOSED');
    expect(deriveRelationHypothesisStatus(0.1, false)).toBe('REJECTED');
    expect(deriveRelationHypothesisStatus(0.9, true)).toBe('REJECTED');
  });
});

describe('M-A10: deterministic relation classification', () => {
  it('COMMUNICATION type → communication', () => {
    const o = makeObservation(1, { type: 'COMMUNICATION' });
    expect(classifyObservationRelationType(o)).toBe('communication');
  });

  it('FINANCIAL type → financial', () => {
    const o = makeObservation(1, { type: 'FINANCIAL' });
    expect(classifyObservationRelationType(o)).toBe('financial');
  });

  it('SPATIAL type → co-location', () => {
    const o = makeObservation(1, { type: 'SPATIAL' });
    expect(classifyObservationRelationType(o)).toBe('co-location');
  });

  it('ownership cue in content → ownership', () => {
    const o = makeObservation(1, {
      type: 'FACTUAL',
      content: 'registered to Aldridge Holdings',
    });
    expect(classifyObservationRelationType(o)).toBe('ownership');
  });

  it('RELATIONAL type with explicit association claim → association', () => {
    const o = makeObservation(1, {
      type: 'RELATIONAL',
      content: 'working with Victor on the transfer',
    });
    expect(classifyObservationRelationType(o)).toBe('association');
  });

  it('generic co-occurrence is NOT association and returns undefined', () => {
    const o = makeObservation(1, {
      type: 'RELATIONAL',
      content: 'both appeared in the same record',
    });
    expect(classifyObservationRelationType(o)).toBeUndefined();
  });

  it('pickRelationType falls back to other when no signal exists', () => {
    const o = makeObservation(1, {
      type: 'FACTUAL',
      content: 'generic mention with no cue',
      entityIds: [ENT_ID(1), ENT_ID(2)],
    });
    expect(pickRelationType([o])).toBe('other');
  });
});

describe('M-A10: deterministic identity', () => {
  it('same pair + same type + same score version → same id across calls', async () => {
    const input = {
      sourceEntityId: ENT_ID(1),
      targetEntityId: ENT_ID(2),
      relationType: 'financial' as RelationType,
    };
    const a = await deterministicRelationHypothesisId(input);
    const b = await deterministicRelationHypothesisId(input);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('canonical ordering — swap source/target yields same id (undirected)', async () => {
    // 'financial' is an UNDIRECTED relation type: A↔B == B↔A.
    const a = await deterministicRelationHypothesisId({
      sourceEntityId: ENT_ID(2),
      targetEntityId: ENT_ID(1),
      relationType: 'financial',
    });
    const b = await deterministicRelationHypothesisId({
      sourceEntityId: ENT_ID(1),
      targetEntityId: ENT_ID(2),
      relationType: 'financial',
    });
    expect(a).toBe(b);
  });

  it('directed relation — A->B != B->A (source/target preserved)', async () => {
    // 'ownership' is a DIRECTED relation type: A→B ≠ B→A.
    const ab = await deterministicRelationHypothesisId({
      sourceEntityId: ENT_ID(1),
      targetEntityId: ENT_ID(2),
      relationType: 'ownership',
    });
    const ba = await deterministicRelationHypothesisId({
      sourceEntityId: ENT_ID(2),
      targetEntityId: ENT_ID(1),
      relationType: 'ownership',
    });
    expect(ab).not.toBe(ba);
  });

  it('directed relation — repeated generation is idempotent within the same direction', async () => {
    const a1 = await deterministicRelationHypothesisId({
      sourceEntityId: ENT_ID(1),
      targetEntityId: ENT_ID(2),
      relationType: 'organizational',
    });
    const a2 = await deterministicRelationHypothesisId({
      sourceEntityId: ENT_ID(1),
      targetEntityId: ENT_ID(2),
      relationType: 'organizational',
    });
    expect(a1).toBe(a2); // same direction → same id across passes
  });

  it('all directed types distinguish A->B from B->A', async () => {
    const directed: RelationType[] = [
      'ownership',
      'organizational',
      'transport',
      'family',
      'vehicle',
    ];
    for (const type of directed) {
      const ab = await deterministicRelationHypothesisId({
        sourceEntityId: ENT_ID(1),
        targetEntityId: ENT_ID(2),
        relationType: type,
      });
      const ba = await deterministicRelationHypothesisId({
        sourceEntityId: ENT_ID(2),
        targetEntityId: ENT_ID(1),
        relationType: type,
      });
      expect(ab).not.toBe(ba);
    }
  });

  it('undirected types collapse A-B == B-A', async () => {
    const undirected: RelationType[] = [
      'communication',
      'financial',
      'co-location',
      'association',
      'case-link',
      'other',
    ];
    for (const type of undirected) {
      const ab = await deterministicRelationHypothesisId({
        sourceEntityId: ENT_ID(1),
        targetEntityId: ENT_ID(2),
        relationType: type,
      });
      const ba = await deterministicRelationHypothesisId({
        sourceEntityId: ENT_ID(2),
        targetEntityId: ENT_ID(1),
        relationType: type,
      });
      expect(ab).toBe(ba);
    }
  });

  it('isRelationDirected / resolveRelationDirected reflect the authoritative map', () => {
    expect(isRelationDirected('ownership')).toBe(true);
    expect(isRelationDirected('financial')).toBe(false);
    expect(resolveRelationDirected('transport')).toBe(true);
    expect(resolveRelationDirected('co-location')).toBe(false);
  });

  it('a different score model version yields a different id', async () => {
    const base = {
      sourceEntityId: ENT_ID(1),
      targetEntityId: ENT_ID(2),
      relationType: 'financial' as RelationType,
    };
    const v1 = await deterministicRelationHypothesisId(base);
    const v2 = await deterministicRelationHypothesisId({
      ...base,
      scoreModelVersion: 'indago:relation-score:v2',
    });
    expect(v1).not.toBe(v2);
  });

  it('identity key embeds namespace, version, ordered entities, type, and score version', () => {
    const key = buildRelationHypothesisIdentityKey({
      sourceEntityId: ENT_ID(2),
      targetEntityId: ENT_ID(1),
      relationType: 'financial',
    });
    expect(key).toContain('indago:relation-hypothesis');
    expect(key).toContain(ENT_ID(1));
    expect(key).toContain(ENT_ID(2));
    expect(key).toContain(RELATION_SCORE_MODEL_VERSION);
  });
});

describe('M-A10: candidate detection — source-grounded co-occurrence', () => {
  it('detects a pair only from same-observation co-occurrence of canonical entities', () => {
    const obs = {
      observations: [
        makeObservation(1, { entityIds: [ENT_ID(1), ENT_ID(2)] }),
        makeObservation(2, { entityIds: [ENT_ID(3)] }),
      ],
      entities: [
        makeEntity(1, [OBS_ID(1)]),
        makeEntity(2, [OBS_ID(1)]),
        makeEntity(3, [OBS_ID(2)]),
      ],
    };
    const candidates = detectRelationCandidates(obs);
    expect(candidates).toHaveLength(1);
    const [c] = candidates;
    expect([c.sourceEntityId, c.targetEntityId]).toEqual([ENT_ID(1), ENT_ID(2)]);
    expect(c.observationIds).toEqual([OBS_ID(1)]);
  });

  it('entities appearing in the same observation but not in observation set are ignored', () => {
    const obs = {
      observations: [
        makeObservation(1, { entityIds: [ENT_ID(1), ENT_ID(2)] }),
      ],
      // Entity 2 is not in the entities list → not canonical co-occurrence.
      entities: [makeEntity(1, [OBS_ID(1)])],
    };
    const candidates = detectRelationCandidates(obs);
    expect(candidates).toHaveLength(0);
  });

  it('sorts candidate pairs deterministically by source, then target', () => {
    const obs = {
      observations: [
        makeObservation(1, { entityIds: [ENT_ID(2), ENT_ID(3)] }),
        makeObservation(2, { entityIds: [ENT_ID(1), ENT_ID(2)] }),
      ],
      entities: [
        makeEntity(1, [OBS_ID(2)]),
        makeEntity(2, [OBS_ID(1), OBS_ID(2)]),
        makeEntity(3, [OBS_ID(1)]),
      ],
    };
    const candidates = detectRelationCandidates(obs);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].sourceEntityId).toBe(ENT_ID(1));
    expect(candidates[0].targetEntityId).toBe(ENT_ID(2));
    expect(candidates[1].sourceEntityId).toBe(ENT_ID(2));
    expect(candidates[1].targetEntityId).toBe(ENT_ID(3));
  });
});

describe('M-A10: end-to-end case resolution', () => {
  it('resolves every pair deterministically and reports metrics', () => {
    const pair1Obs = [
      makeObservation(1, { type: 'FINANCIAL', entityIds: [ENT_ID(1), ENT_ID(2)], observedAt: T0 }),
      makeObservation(2, { type: 'FINANCIAL', entityIds: [ENT_ID(1), ENT_ID(2)], observedAt: T1 }),
    ];
    const pair2Obs = [
      makeObservation(3, { type: 'FACTUAL', entityIds: [ENT_ID(3), ENT_ID(4)], content: 'generic' }),
    ];
    const result = resolveRelationsForCase({
      caseId: 'case-1',
      observations: [...pair1Obs, ...pair2Obs],
      entities: [
        makeEntity(1, [OBS_ID(1), OBS_ID(2)]),
        makeEntity(2, [OBS_ID(1), OBS_ID(2)]),
        makeEntity(3, [OBS_ID(3)]),
        makeEntity(4, [OBS_ID(3)]),
      ],
    });

    expect(result.metrics.pairsConsidered).toBe(2);
    // Both pairs propose: pair1 gets co-occurrence + repeated + temporal + type-signal;
    // pair2 gets co-occurrence + type-signal (generic FACTUAL → 'other' type-signal = +0.15).
    expect(result.metrics.hypothesesProposed).toBe(2);
    expect(result.metrics.hypothesesRejected).toBe(0);
    expect(result.metrics.lowEvidenceCount).toBe(0);

    const resolutions = result.resolutions;
    expect(resolutions).toHaveLength(2);
    // high-signal pair resolves to a PROPOSED relation with financial type.
    const proposed = resolutions.find(
      (r) => r.sourceEntityId === ENT_ID(1) && r.targetEntityId === ENT_ID(2),
    );
    expect(proposed).toBeDefined();
    expect(proposed!.relationType).toBe('financial');
    expect(proposed!.support).toBeGreaterThan(RELATION_PROPOSAL_THRESHOLD);
    expect(proposed!.scoreModelVersion).toBe(RELATION_SCORE_MODEL_VERSION);
  });

  it('a hard contradiction suppresses the hypothesis for that pair', () => {
    const obs = [
      makeObservation(1, { type: 'FINANCIAL', entityIds: [ENT_ID(1), ENT_ID(2)], observedAt: T0 }),
      makeObservation(2, { type: 'FINANCIAL', entityIds: [ENT_ID(1), ENT_ID(2)], observedAt: T1 }),
    ];
    const { resolution, proposed } = resolveRelationPair({
      candidate: {
        sourceEntityId: ENT_ID(1),
        targetEntityId: ENT_ID(2),
        observationIds: [OBS_ID(1), OBS_ID(2)],
        sourceIds: [SOURCE_ID(1)],
        suggestedType: 'financial',
      },
      allObservations: obs,
      explicitContradictions: new Set([OBS_ID(1)]),
      temporalWindowMs: RELATION_RESOLUTION_BOUNDS.temporalProximityWindowMs,
    });
    expect(proposed).toBe(false);
    expect(resolution.contradictions).toContain(OBS_ID(1));
    // Contradiction reduces score but does NOT zero accumulated evidence —
    // co-occurrence(0.2) + repeated(0.15) + temporal(0.1) − hardContradiction(0.25) = 0.2.
    expect(resolution.support).toBeCloseTo(0.2, 6);
  });

  it('resolveRelationsForCase threads explicitContradictions — hardContradiction fires with provenance', () => {
    // Two FINANCIAL co-occurrences would otherwise resolve well above threshold:
    // co-occurrence(0.2) + repeated(0.15) + temporal(0.1) + type-signal(0.15) = 0.6.
    // Marking one of them as an explicit contradiction applies −0.25 and
    // suppresses the hypothesis to REJECTED, carrying the contradicting obs id.
    const obs = [
      makeObservation(1, { type: 'FINANCIAL', entityIds: [ENT_ID(1), ENT_ID(2)], observedAt: T0 }),
      makeObservation(2, { type: 'FINANCIAL', entityIds: [ENT_ID(1), ENT_ID(2)], observedAt: T1 }),
    ];
    const uncontradicted = resolveRelationsForCase({
      caseId: 'case-1',
      observations: obs,
      entities: [makeEntity(1, [OBS_ID(1), OBS_ID(2)]), makeEntity(2, [OBS_ID(1), OBS_ID(2)])],
    });
    const baseline = uncontradicted.resolutions[0]!;
    expect(baseline.support).toBeCloseTo(0.6, 6);
    expect(uncontradicted.metrics.hypothesesProposed).toBe(1);

    const contradicted = resolveRelationsForCase({
      caseId: 'case-1',
      observations: obs,
      entities: [makeEntity(1, [OBS_ID(1), OBS_ID(2)]), makeEntity(2, [OBS_ID(1), OBS_ID(2)])],
      explicitContradictions: new Set([OBS_ID(1)]),
    });
    const res = contradicted.resolutions[0]!;
    // Exactly −0.25: 0.6 − 0.25 = 0.35.
    expect(res.support).toBeCloseTo(0.6 + RELATION_SCORING_V1.hardContradiction, 6);
    expect(res.contradictions).toEqual([OBS_ID(1)]);
    expect(res.contradictions).not.toContain(OBS_ID(2));
    expect(contradicted.metrics.hypothesesRejected).toBe(1);
    expect(contradicted.metrics.hypothesesProposed).toBe(0);
  });

  it('resolves `directed` from the authoritative relation type', () => {
    // ownership is DIRECTED; financial is UNDIRECTED.
    const ownershipObs = [
      makeObservation(1, { type: 'FACTUAL', content: 'registered to entity', entityIds: [ENT_ID(1), ENT_ID(2)] }),
    ];
    const { resolution: ownershipRes } = resolveRelationPair({
      candidate: {
        sourceEntityId: ENT_ID(1),
        targetEntityId: ENT_ID(2),
        observationIds: [OBS_ID(1)],
        sourceIds: [SOURCE_ID(1)],
        suggestedType: 'ownership',
      },
      allObservations: ownershipObs,
      temporalWindowMs: RELATION_RESOLUTION_BOUNDS.temporalProximityWindowMs,
    });
    expect(ownershipRes.directed).toBe(true);

    const financialObs = [
      makeObservation(1, { type: 'FINANCIAL', entityIds: [ENT_ID(1), ENT_ID(2)] }),
    ];
    const { resolution: financialRes } = resolveRelationPair({
      candidate: {
        sourceEntityId: ENT_ID(1),
        targetEntityId: ENT_ID(2),
        observationIds: [OBS_ID(1)],
        sourceIds: [SOURCE_ID(1)],
        suggestedType: 'financial',
      },
      allObservations: financialObs,
      temporalWindowMs: RELATION_RESOLUTION_BOUNDS.temporalProximityWindowMs,
    });
    expect(financialRes.directed).toBe(false);
  });

  it('resolution is well-formed: ids ordered, evidence non-empty, score bounded', () => {
    const obs = [
      makeObservation(1, { type: 'FINANCIAL', entityIds: [ENT_ID(1), ENT_ID(2)], observedAt: T0 }),
      makeObservation(2, { type: 'FINANCIAL', entityIds: [ENT_ID(1), ENT_ID(2)], observedAt: T1 }),
    ];
    const { resolution } = resolveRelationPair({
      candidate: {
        sourceEntityId: ENT_ID(1),
        targetEntityId: ENT_ID(2),
        observationIds: [OBS_ID(1), OBS_ID(2)],
        sourceIds: [SOURCE_ID(1)],
        suggestedType: 'financial',
      },
      allObservations: obs,
      temporalWindowMs: RELATION_RESOLUTION_BOUNDS.temporalProximityWindowMs,
    });
    // The persistence layer consumes this shape — assert structural invariants.
    expect(resolution.evidenceBasis).toEqual([OBS_ID(1), OBS_ID(2)]);
    expect(resolution.evidenceCount).toBe(2);
    expect(resolution.support).toBeGreaterThanOrEqual(0);
    expect(resolution.support).toBeLessThanOrEqual(1);
    expect(resolution.sourceCoverage).toBeGreaterThan(0);
    expect(resolution.scoreModelVersion).toBeTruthy();
  });
});

describe('M-A10: indexing helpers', () => {
  it('indexObservations is bounded to the case observation cap', () => {
    const obs: Observation[] = Array.from({ length: 10 }, (_, i) =>
      makeObservation(i + 1, { entityIds: [ENT_ID(1), ENT_ID(2)] }),
    );
    const index = indexObservations(obs);
    expect(index.size).toBeLessThanOrEqual(
      RELATION_RESOLUTION_BOUNDS.maxObservationsPerCase,
    );
    expect(index.has(OBS_ID(1))).toBe(true);
  });

  it('buildObservationsByType indexes observations by classified type', () => {
    const obs = [
      makeObservation(1, { type: 'FINANCIAL' }),
      makeObservation(2, { type: 'COMMUNICATION' }),
      makeObservation(3, { type: 'FACTUAL', content: 'generic' }),
    ];
    const byType = buildObservationsByType(obs);
    expect(byType.get('financial')).toEqual(new Set([OBS_ID(1)]));
    expect(byType.get('communication')).toEqual(new Set([OBS_ID(2)]));
    expect(byType.get('other')).toEqual(new Set([OBS_ID(3)]));
  });
});
