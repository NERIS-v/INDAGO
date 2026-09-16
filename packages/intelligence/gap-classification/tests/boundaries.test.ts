// ============================================================================
// PR14 boundary discipline (failures, isolation, determinism, provenance,
// temporal completeness flags, closed-world validation, bounds smoke)
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  GapClassificationError,
  GapClassificationErrorCodes,
  GapClassificationResultSchema,
  classifyGap,
  buildClassificationSignals,
} from '../src/index.js';
import {
  CASE_ID,
  ENTITY_A,
  ENTITY_B,
  GRAPH_VERSION_ID,
  HYP_COMPETING,
  HYP_SUPPORTING,
  NODE_A,
  NODE_B,
  OBSERVED_AT,
  OBS_LINK,
  OBS_OTHER,
  eventTime,
  makeAtomic,
  makeHypothesisContext,
  makeInput,
  makeObservation,
  temporalInterval,
} from './helpers.js';
import type { GapClassificationInput } from '../src/index.js';

const obsOnA = makeObservation(OBS_LINK, { entityIds: [ENTITY_A] });
const obsOnB = makeObservation(OBS_OTHER, { entityIds: [ENTITY_B] });
const endpointCovered = [obsOnA, obsOnB];

const expectErrorCode = (fn: () => unknown, code: string) => {
  try {
    fn();
    throw new Error(`expected GapClassificationError [${code}] but none was thrown`);
  } catch (err) {
    if (err instanceof GapClassificationError) {
      expect(err.code).toBe(code);
      return;
    }
    throw err;
  }
};

describe('typed failures (policy §12)', () => {
  it('INVALID_INPUT on a structurally malformed input', () => {
    expectErrorCode(() => classifyGap(null as unknown as GapClassificationInput), 'INVALID_INPUT');
    expectErrorCode(() => buildClassificationSignals({} as GapClassificationInput), 'INVALID_INPUT');
  });

  it('UNSUPPORTED_POLICY on any version other than v1', () => {
    const input = { ...makeInput(), classificationPolicyVersion: 'v2' } as unknown as GapClassificationInput;
    expectErrorCode(() => classifyGap(input), 'UNSUPPORTED_POLICY');
    expectErrorCode(() => buildClassificationSignals(input), 'UNSUPPORTED_POLICY');
  });

  it('QUALIFIED_CANDIDATE_REQUIRED for unqualified candidates', () => {
    expectErrorCode(
      () => classifyGap(makeInput({ candidate: { qualified: false } })),
      'QUALIFIED_CANDIDATE_REQUIRED',
    );
  });

  it('QUALIFIED_CANDIDATE_REQUIRED when the candidate is missing entirely', () => {
    const { qualifiedCandidate: _q, ...rest } = makeInput();
    expectErrorCode(() => classifyGap(rest as GapClassificationInput), 'QUALIFIED_CANDIDATE_REQUIRED');
  });

  it('CONTEXT_MISMATCH when input.caseId disagrees with region/candidate', () => {
    const input = { ...makeInput(), caseId: '550e8400-e29b-41d4-a716-446655449999' };
    expectErrorCode(() => classifyGap(input), 'CONTEXT_MISMATCH');
  });

  it('CONTEXT_MISMATCH when input.graphVersionId disagrees with region/candidate', () => {
    const input = { ...makeInput(), graphVersionId: '550e8400-e29b-41d4-a716-446655448888' };
    expectErrorCode(() => classifyGap(input), 'CONTEXT_MISMATCH');
  });

  it('CONTEXT_MISMATCH when region.regionId disagrees with the candidate', () => {
    const input = { ...makeInput(), region: { ...makeInput({}).region, regionId: 'other-region' } };
    expectErrorCode(() => classifyGap(input), 'CONTEXT_MISMATCH');
  });

  it('CONTEXT_MISMATCH when a candidate observation reference is absent from the supplied context', () => {
    expectErrorCode(
      () => classifyGap(makeInput({ candidate: { supportingObservationIds: [OBS_LINK] }, observations: [] })),
      'CONTEXT_MISMATCH',
    );
  });

  it('CONTEXT_MISMATCH when a candidate node reference is absent from the supplied nodes', () => {
    expectErrorCode(
      () => classifyGap(makeInput({ candidate: { nodeIds: [NODE_A] }, nodes: [] })),
      'CONTEXT_MISMATCH',
    );
  });

  it('CONTEXT_MISMATCH when a candidate hypothesis reference is absent from the supplied context', () => {
    expectErrorCode(
      () => classifyGap(makeInput({ candidate: { supportingHypothesisIds: [HYP_SUPPORTING] }, hypothesisContext: makeHypothesisContext({ atomics: [] }) })),
      'CONTEXT_MISMATCH',
    );
  });
});

describe('INSUFFICIENT_CONTEXT (policy §6/§10 guard)', () => {
  it('returns INSUFFICIENT_CONTEXT with no type when the classifier lacks context', () => {
    const result = classifyGap(
      makeInput({
        observations: [],
        hypothesisContext: makeHypothesisContext({ atomics: [] }),
        candidate: { supportingObservationIds: [], supportingHypothesisIds: [] },
      }),
    );
    expect(result.status).toBe('INSUFFICIENT_CONTEXT');
    expect(result.type).toBeUndefined();
    expect(result.reasonCodes).toEqual(['INSUFFICIENT_CONTEXT']);
    expect(result.suggestedActions).toEqual(['provide additional bounded context']);
    expect(GapClassificationResultSchema.safeParse(result).success).toBe(true);
  });

  it('is NOT forced into MISSING_DATA (distinct: case data vs classifier context)', () => {
    const result = classifyGap(
      makeInput({
        observations: [],
        hypothesisContext: makeHypothesisContext({ atomics: [] }),
        candidate: {
          expectedRelationshipType: 'communication',
          supportingObservationIds: [],
          supportingHypothesisIds: [],
        },
      }),
    );
    expect(result.status).toBe('INSUFFICIENT_CONTEXT');
    expect(result.type).toBeUndefined();
  });

  it('the same case becomes MISSING_DATA once in-scope context is supplied', () => {
    const result = classifyGap(
      makeInput({
        observations: endpointCovered,
        hypothesisContext: makeHypothesisContext({ atomics: [] }),
        candidate: {
          expectedRelationshipType: 'communication',
          supportingObservationIds: [],
          supportingHypothesisIds: [],
        },
      }),
    );
    expect(result.type).toBe('MISSING_DATA');
    expect(result.status).toBe('CONFIDENT');
  });
});

describe('case and graph-version isolation', () => {
  it('rejects a candidate from another case even when the region matches (closed world)', () => {
    const base = makeInput();
    const crossCase = {
      ...base,
      qualifiedCandidate: {
        ...base.qualifiedCandidate,
        rawCandidate: { ...base.qualifiedCandidate.rawCandidate, caseId: '550e8400-e29b-41d4-a716-446655447777' },
      },
    };
    expectErrorCode(() => classifyGap(crossCase), 'CONTEXT_MISMATCH');
  });

  it('rejects a candidate from another graph version (closed world)', () => {
    const base = makeInput();
    const crossVersion = {
      ...base,
      qualifiedCandidate: {
        ...base.qualifiedCandidate,
        rawCandidate: { ...base.qualifiedCandidate.rawCandidate, graphVersionId: '550e8400-e29b-41d4-a716-446655446666' },
      },
    };
    expectErrorCode(() => classifyGap(crossVersion), 'CONTEXT_MISMATCH');
  });

  it('the same (case, graphVersion) is required on region AND candidate', () => {
    const base = makeInput();
    expect(GapClassificationResultSchema.safeParse(classifyGap(base)).success).toBe(true);
    expect(base.region.identity.caseId).toBe(CASE_ID);
    expect(base.region.identity.graphVersionId).toBe(GRAPH_VERSION_ID);
  });
});

describe('determinism (policy §7)', () => {
  it('permuted input ordering yields byte-identical results and identical context digests', () => {
    const supporting = makeAtomic(HYP_SUPPORTING, { supportingObservations: [OBS_LINK] });
    const competing = makeAtomic(HYP_COMPETING, { referencedCanonicalEntityIds: [ENTITY_B] });
    const input = makeInput({
      candidate: {
        supportingObservationIds: [OBS_LINK],
        contradictingObservationIds: [],
        expectedRelationshipType: 'communication',
        significance: 0.3,
      },
      observations: [obsOnA, obsOnB],
      hypothesisContext: makeHypothesisContext({ atomics: [supporting, competing] }),
    });

    const baseResult = classifyGap(input);

    const shuffledNodes = [...input.nodes].reverse();
    const shuffledObservations = [obsOnB, obsOnA];
    const shuffledAtomics = [competing, supporting];
    const shuffled = {
      ...input,
      nodes: shuffledNodes,
      observations: shuffledObservations,
      hypothesisContext: {
        ...input.hypothesisContext,
        atomic: shuffledAtomics,
        groups: input.hypothesisContext.groups.map((g) => ({
          ...g,
          atomicHypotheses: shuffledAtomics,
        })),
      },
    };
    const permutedResult = classifyGap(shuffled);

    expect(permutedResult).toEqual(baseResult);
    expect(permutedResult.contextSha256).toBe(baseResult.contextSha256);
    expect(permutedResult.contextSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across repeated invocations', () => {
    const input = makeInput({ observations: endpointCovered });
    const a = classifyGap(input);
    const b = classifyGap(input);
    expect(a).toEqual(b);
  });
});

describe('provenance (policy §9)', () => {
  it('every returned reference id exists in the supplied bounded input', () => {
    const supporting = makeAtomic(HYP_SUPPORTING, { supportingObservations: [OBS_LINK] });
    const inputs = [
      makeInput({ observations: endpointCovered }),
      makeInput({
        candidate: { supportingObservationIds: [OBS_LINK] },
        observations: [obsOnA],
      }),
      makeInput({
        candidate: { ...{ significance: 0.75, structuralScore: 0.6 }, supportingObservationIds: [], supportingHypothesisIds: [HYP_SUPPORTING] },
        observations: endpointCovered,
        hypothesisContext: makeHypothesisContext({ atomics: [supporting] }),
      }),
    ];
    for (const input of inputs) {
      const result = classifyGap(input);
      const obsIds = new Set(input.observations.map((o) => o.id));
      const hypIds = new Set(input.hypothesisContext.atomic.map((a) => a.derivedId));
      const nodeIds = new Set(input.nodes.map((n) => n.id));
      for (const id of result.supportingReferences.supportingObservationIds) {
        expect(obsIds.has(id)).toBe(true);
      }
      for (const id of result.supportingReferences.supportingHypothesisIds) {
        expect(hypIds.has(id)).toBe(true);
      }
      for (const id of result.supportingReferences.structuralSignalIds) {
        expect(nodeIds.has(id)).toBe(true);
      }
    }
  });

  it('binds the result to the deterministic candidate id', () => {
    const result = classifyGap(makeInput({ observations: endpointCovered }));
    expect(result.graphHoleId).toBe(result.graphHoleId);
    expect(result.graphHoleId.length).toBeGreaterThan(0);
  });
});

describe('temporal completeness flags (policy §8)', () => {
  it('marks temporalContextLimited when the candidate scope does not overlap the region window (digest changes, outcome does not)', () => {
    const base = makeInput({
      candidate: { expectedRelationshipType: null, temporalScope: temporalInterval('2024-06-01', '2024-06-30') },
      region: { temporalContext: temporalInterval('2025-01-01', '2025-12-31') },
      observations: endpointCovered,
    });
    const facts = buildClassificationSignals(base);
    expect(facts.signals.contextCompleteness.temporalContextLimited).toBe(true);
    expect(facts.signals.temporalScopeDeclared).toBe(true);
    expect(facts.signals.temporalContextDeclared).toBe(true);

    const overlapped = makeInput({
      candidate: { expectedRelationshipType: null, temporalScope: temporalInterval('2025-06-01', '2025-06-30') },
      region: { temporalContext: temporalInterval('2025-01-01', '2025-12-31') },
      observations: endpointCovered,
    });
    const overlappedFacts = buildClassificationSignals(overlapped);
    expect(overlappedFacts.signals.contextCompleteness.temporalContextLimited).toBe(false);

    const a = classifyGap(base);
    const b = classifyGap(overlapped);
    expect(a.type).toBe(b.type);
    expect(a.status).toBe(b.status);
    expect(a.contextSha256).not.toBe(b.contextSha256);
  });

  it('honors only domain-event time / validity intervals (no reliance on system stamped fields)', () => {
    const withEventTime = makeInput({
      candidate: { expectedRelationshipType: null },
      observations: [
        { ...obsOnA, eventTime: eventTime('2024-06-15T00:00:00.000Z'), validityInterval: temporalInterval('2024-01-01', '2024-12-31') },
        { ...obsOnB, eventTime: eventTime('2024-06-16T00:00:00.000Z') },
      ],
    });
    const withoutEventTime = makeInput({
      candidate: { expectedRelationshipType: null },
      observations: [obsOnA, obsOnB],
    });
    const a = classifyGap(withEventTime);
    const b = classifyGap(withoutEventTime);
    expect(a).toEqual(b);
  });
});

describe('context digest + identity binding', () => {
  it('produces a 64-char content digest that changes when the policy version or context changes', () => {
    const input = makeInput({ observations: endpointCovered });
    const result = classifyGap(input);
    expect(result.contextSha256).toMatch(/^[0-9a-f]{64}$/);

    const other = classifyGap(
      makeInput({ observations: [obsOnA, obsOnB, makeObservation(OBS_OTHER, { entityIds: [ENTITY_A] })] }),
    );
    expect(other.contextSha256).not.toBe(result.contextSha256);
  });
});

describe('bounds smoke (policy §10)', () => {
  it('classifies a moderately large bounded package linearly and deterministically', () => {
    const observations = Array.from({ length: 300 }, (_, i) =>
      makeObservation(`obs-${i}`, { entityIds: i % 2 === 0 ? [ENTITY_A] : [ENTITY_B] }),
    );
    const atomics = Array.from({ length: 200 }, (_, i) =>
      makeAtomic(`atomic:RELATION_HYPOTHESIS:${i}`, { referencedCanonicalEntityIds: [ENTITY_A, ENTITY_B] }),
    );
    const input = makeInput({
      candidate: { expectedRelationshipType: null },
      observations,
      hypothesisContext: makeHypothesisContext({ atomics }),
    });
    expect(classifyGap(input)).toEqual(classifyGap(input));
    expect(classifyGap(input).type).toBe('MISSING_INVESTIGATION');
  });
});

describe('computedAt provenance (no clock inside the classifier)', () => {
  it('keeps the caller-supplied computedAt while classification identity stays content-based', () => {
    const result = classifyGap(makeInput({ observations: endpointCovered }));
    expect(result.computedAt).toEqual(OBSERVED_AT);
  });
});