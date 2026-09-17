import { describe, expect, it } from 'vitest';
import { generateCompetingExplanations } from '../src/index.js';
import type { CompetingExplanation } from '@indago/contracts';
import {
  CASE_ID,
  ENTITY_A,
  ENTITY_B,
  GRAPH_VERSION_ID,
  HYP_COMPETING,
  HYP_ENTITY,
  HYP_SUPPORTING,
  NODE_A,
  NODE_B,
  OBS_LINK,
  OBS_OTHER,
  makeAtomic,
  makeCompetingInput,
  makeHypothesisContext,
  makeObservation,
  makeRegion,
  temporalInterval,
} from './helpers.js';

// ============================================================================
// PR15 deterministic generation tests (policy §9/§10)
// ============================================================================

function byId<T extends CompetingExplanation>(explanations: readonly T[], type: string): T {
  const found = explanations.find((e) => e.type === type);
  if (!found) throw new Error(`missing explanation family ${type}`);
  return found;
}

describe('generateCompetingExplanations — primary families', () => {
  it('emits MISSING_DATA_EXPLANATION for a MISSING_DATA classification (no manufacturing)', () => {
    const input = makeCompetingInput({
      candidate: { supportingHypothesisIds: [HYP_SUPPORTING] },
      hypothesisContext: makeHypothesisContext({ atomics: [makeAtomic(HYP_SUPPORTING)] }),
    });
    const set = generateCompetingExplanations(input);

    expect(set.classification.type).toBe('MISSING_DATA');
    expect(set.explanations.length).toBe(1);
    const primary = set.explanations[0]!;
    expect(primary.type).toBe('MISSING_DATA_EXPLANATION');
    expect(primary.basis).toBe('REQUIRED_INFORMATION_ABSENT');
    expect(primary.supportLevel).toBe('SUPPORTED');
    expect(primary.statement).toBe(
      'The expected communication relationship cannot yet be resolved because the necessary evidence is absent from the bounded context; absence of evidence is not evidence of absence.',
    );
    expect(primary.supportingHypothesisIds).toEqual([HYP_SUPPORTING]);
    expect(primary.supportingObservationIds).toEqual([]);
    expect(primary.gapClassificationType).toBe('MISSING_DATA');
    expect(primary.explanationId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('emits MISSING_COMPARISON_EXPLANATION with supporting references for MISSING_COMPARISON', () => {
    const input = makeCompetingInput({
      candidate: { supportingObservationIds: [OBS_LINK], supportingHypothesisIds: [HYP_SUPPORTING] },
      observations: [
        makeObservation(OBS_LINK, { entityIds: [ENTITY_A, ENTITY_B] }),
      ],
      hypothesisContext: makeHypothesisContext({
        atomics: [makeAtomic(HYP_SUPPORTING, { predicate: 'communication' })],
      }),
    });
    const set = generateCompetingExplanations(input);

    expect(set.classification.type).toBe('MISSING_COMPARISON');
    const primary = byId(set.explanations, 'MISSING_COMPARISON_EXPLANATION');
    expect(primary.basis).toBe('COMPARISON_BASELINE_ABSENT');
    expect(primary.supportLevel).toBe('SUPPORTED');
    expect(primary.supportingObservationIds).toEqual([OBS_LINK]);
    expect(primary.supportingHypothesisIds).toEqual([HYP_SUPPORTING]);
  });

  it('emits INFRASTRUCTURE_EXPLANATION with REGION_REPRESENTATION_LIMITED for a truncated region', () => {
    const input = makeCompetingInput({
      candidate: { supportingHypothesisIds: [HYP_SUPPORTING] },
      region: makeRegion({ truncated: true, limitations: ['CONTEXT_OBSERVATION_BOUND_REACHED'] }),
      hypothesisContext: makeHypothesisContext({ atomics: [makeAtomic(HYP_SUPPORTING)] }),
    });
    const set = generateCompetingExplanations(input);

    expect(set.classification.type).toBe('INFRASTRUCTURE_GAP');
    const primary = byId(set.explanations, 'INFRASTRUCTURE_EXPLANATION');
    expect(primary.basis).toBe('REGION_REPRESENTATION_LIMITED');
    expect(primary.supportLevel).toBe('SUPPORTED');
  });

  it('emits CONCEALMENT_CONSISTENT_EXPLANATION pattern-compatible wording for the concealment pattern', () => {
    const input = makeCompetingInput({
      candidate: {
        structuralScore: 0.8,
        significance: 0.75,
        expectedRelationshipType: 'communication',
      },
      observations: [
        makeObservation(OBS_LINK, { entityIds: [ENTITY_A, ENTITY_B] }),
        makeObservation(OBS_OTHER, { entityIds: [ENTITY_A, ENTITY_B] }),
      ],
    });
    const set = generateCompetingExplanations(input);

    expect(set.classification.type).toBe('CONCEALMENT_CONSISTENT_PATTERN');
    expect(set.classification.status).toBe('SUPPORTED');
    const concealment = byId(set.explanations, 'CONCEALMENT_CONSISTENT_EXPLANATION');
    expect(concealment.basis).toBe('PATTERN_COMPATIBLE_ABSENCE');
    expect(concealment.supportLevel).toBe('SUPPORTED');
    expect([...concealment.supportingObservationIds].sort()).toEqual([OBS_LINK, OBS_OTHER].sort());
    // Pattern-compatible only: never an assertion of concealment.
    expect(concealment.statement).toContain('compatible');
    expect(concealment.statement).toContain('NOT an assertion');
    // The pattern-compatible disclaimer names but never asserts intent/guilt.
    expect(concealment.statement).toContain('does not establish intent');
    expect(concealment.statement).toContain('criminality, or guilt on its own');
  });

  it('emits MISSING_INVESTIGATION_EXPLANATION when no question was framed', () => {
    const input = makeCompetingInput({
      candidate: {
        expectedRelationshipType: null,
        supportingHypothesisIds: [],
      },
      // A non-supporting in-scope atomic keeps the context eligible without
      // framing a question (supportingHypothesisCount stays 0).
      hypothesisContext: makeHypothesisContext({ atomics: [makeAtomic(HYP_SUPPORTING)] }),
    });
    const set = generateCompetingExplanations(input);
    expect(set.classification.type).toBe('MISSING_INVESTIGATION');
    const primary = byId(set.explanations, 'MISSING_INVESTIGATION_EXPLANATION');
    expect(primary.basis).toBe('INVESTIGATION_NOT_CONCLUDED');
    expect(primary.supportLevel).toBe('SUPPORTED');
  });
});

describe('generateCompetingExplanations — grounded alternative families', () => {
  const base = () =>
    makeCompetingInput({
      candidate: {
        expectedRelationshipType: 'financial',
        supportingObservationIds: [OBS_LINK],
      },
      observations: [
        makeObservation(OBS_LINK, { entityIds: [ENTITY_A, ENTITY_B] }),
      ],
      hypothesisContext: makeHypothesisContext({
        atomics: [
          makeAtomic(HYP_COMPETING, { predicate: 'communication' }),
          makeAtomic(HYP_ENTITY, { hypothesisType: 'ENTITY_HYPOTHESIS' }),
        ],
      }),
    });

  it('emits RELATION_REPRESENTATION_EXPLANATION only when the expected type is unrepresented', () => {
    const input = base();
    const set = generateCompetingExplanations(input);
    const relation = byId(set.explanations, 'RELATION_REPRESENTATION_EXPLANATION');
    expect(relation.basis).toBe('RELATIONSHIP_TYPE_UNREPRESENTED');
    expect(relation.supportLevel).toBe('PLAUSIBLE');
    expect(relation.assumptions[0]).toBe('the relationship type is not representable within the bounded context');
  });

  it('emits ENTITY_FRAGMENTATION_EXPLANATION when an ENTITY_HYPOTHESIS atomic references a candidate entity', () => {
    const input = base();
    const set = generateCompetingExplanations(input);
    const entity = byId(set.explanations, 'ENTITY_FRAGMENTATION_EXPLANATION');
    expect(entity.basis).toBe('ENTITY_IDENTITY_UNRESOLVED');
    expect(entity.supportingHypothesisIds).toEqual([HYP_ENTITY]);
    expect(entity.statement).toContain('PR16');
  });

  it('emits TEMPORAL_EXPLANATION only when dated endpoint observations fall outside the window', () => {
    const input = base();
    // The base() case has NO temporal window -> no temporal mismatch.
    const noWindow = generateCompetingExplanations(input);
    expect(noWindow.explanations.find((e) => e.type === 'TEMPORAL_EXPLANATION')).toBeUndefined();

    const windowed = makeCompetingInput({
      candidate: {
        expectedRelationshipType: 'financial',
        supportingObservationIds: [OBS_LINK],
        temporalScope: temporalInterval('2026-01-01T00:00:00.000Z', '2026-06-30T00:00:00.000Z'),
      },
      observations: [
        makeObservation(OBS_LINK, {
          entityIds: [ENTITY_A, ENTITY_B],
          validityInterval: temporalInterval('2024-01-01T00:00:00.000Z', '2024-03-01T00:00:00.000Z'),
        }),
      ],
      hypothesisContext: makeHypothesisContext({
        atomics: [
          makeAtomic(HYP_COMPETING, { predicate: 'communication' }),
          makeAtomic(HYP_ENTITY, { hypothesisType: 'ENTITY_HYPOTHESIS' }),
        ],
      }),
    });
    const set = generateCompetingExplanations(windowed);
    const temporal = byId(set.explanations, 'TEMPORAL_EXPLANATION');
    expect(temporal.basis).toBe('TEMPORAL_SCOPE_MISMATCH');
    expect(temporal.supportingObservationIds).toEqual([OBS_LINK]);
  });

  it('emits INNOCENT_ALTERNATIVE_EXPLANATION only when a genuine competing baseline exists', () => {
    const input = base();
    const set = generateCompetingExplanations(input);
    const innocent = byId(set.explanations, 'INNOCENT_ALTERNATIVE_EXPLANATION');
    expect(innocent.basis).toBe('LEGITIMATE_STRUCTURAL_ALTERNATIVE');
    expect(innocent.supportLevel).toBe('PLAUSIBLE');
    expect(innocent.supportingHypothesisIds).toEqual([HYP_ENTITY, HYP_COMPETING]);

    // Without a competing baseline the family must not be manufactured.
    const noBaseline = makeCompetingInput({
      candidate: { expectedRelationshipType: 'financial', supportingObservationIds: [OBS_LINK] },
      observations: [makeObservation(OBS_LINK, { entityIds: [ENTITY_A, ENTITY_B] })],
      hypothesisContext: makeHypothesisContext(),
    });
    const set2 = generateCompetingExplanations(noBaseline);
    expect(set2.explanations.find((e) => e.type === 'INNOCENT_ALTERNATIVE_EXPLANATION')).toBeUndefined();
  });
});

describe('generateCompetingExplanations — INSUFFICIENT_CONTEXT yields an empty set', () => {
  it('returns an empty, non-throwing set when PR14 could not classify', () => {
    const input = makeCompetingInput({
      candidate: {
        expectedRelationshipType: null,
        supportingHypothesisIds: [],
        supportingObservationIds: [],
      },
    });
    const set = generateCompetingExplanations(input);
    expect(set.classification.status).toBe('INSUFFICIENT_CONTEXT');
    expect(set.classification.type).toBeNull();
    expect(set.explanations).toEqual([]);
    expect(set.explanationCount).toBe(0);
    expect(set.truncated).toBe(false);
  });
});

describe('generateCompetingExplanations — ranking (policy §14)', () => {
  it('orders the primary family before grounded alternatives and keeps frozen alternative order', () => {
    const input = makeCompetingInput({
      candidate: {
        expectedRelationshipType: 'financial',
        supportingObservationIds: [OBS_LINK],
      },
      observations: [
        makeObservation(OBS_LINK, { entityIds: [ENTITY_A, ENTITY_B] }),
      ],
      hypothesisContext: makeHypothesisContext({
        atomics: [
          makeAtomic(HYP_COMPETING, { predicate: 'communication' }),
          makeAtomic(HYP_ENTITY, { hypothesisType: 'ENTITY_HYPOTHESIS' }),
        ],
      }),
    });
    const set = generateCompetingExplanations(input);

    expect(set.explanations.map((e) => e.type)).toEqual([
      'MISSING_INVESTIGATION_EXPLANATION',
      'ENTITY_FRAGMENTATION_EXPLANATION',
      'RELATION_REPRESENTATION_EXPLANATION',
      'INNOCENT_ALTERNATIVE_EXPLANATION',
    ]);
    // rankingKey must be strictly ascending across the emitted ranks.
    for (let i = 1; i < set.explanations.length; i++) {
      expect(set.explanations[i - 1]!.rankingKey < set.explanations[i]!.rankingKey).toBe(true);
    }
    // Primary is SUPPORTED, alternatives are PLAUSIBLE -> support dominates.
    expect(set.explanations[0]!.supportLevel).toBe('SUPPORTED');
    expect(set.explanations.slice(1).every((e) => e.supportLevel === 'PLAUSIBLE')).toBe(true);
  });

  it('keeps a CONTRADICTED primary above equally-contradicted alternatives under AMBIGUOUS', () => {
    const input = makeCompetingInput({
      candidate: {
        expectedRelationshipType: 'financial',
        supportingObservationIds: [OBS_LINK],
        contradictingObservationIds: [OBS_OTHER],
      },
      observations: [
        makeObservation(OBS_LINK, { entityIds: [ENTITY_A, ENTITY_B] }),
        makeObservation(OBS_OTHER, { entityIds: [ENTITY_A, ENTITY_B] }),
      ],
    });
    const set = generateCompetingExplanations(input);

    expect(set.classification.type).toBe('MISSING_COMPARISON');
    expect(set.classification.status).toBe('AMBIGUOUS');
    expect(set.explanations[0]!.type).toBe('MISSING_COMPARISON_EXPLANATION');
    expect(set.explanations[0]!.supportLevel).toBe('CONTRADICTED');
    expect(set.explanations[0]!.contradictingObservationIds).toEqual([OBS_OTHER]);
    // Contradictions must never collapse into concealment or missing-data.
    expect(set.explanations.some((e) => e.type === 'CONCEALMENT_CONSISTENT_EXPLANATION')).toBe(false);
    expect(set.explanations.some((e) => e.type === 'MISSING_DATA_EXPLANATION')).toBe(false);
  });
});

describe('generateCompetingExplanations — determinism + bounds', () => {
  it('is byte-for-byte deterministic under input reordering', () => {
    const baseInput = makeCompetingInput({
      candidate: {
        expectedRelationshipType: 'financial',
        supportingObservationIds: [OBS_LINK],
        supportingHypothesisIds: [HYP_SUPPORTING],
      },
      observations: [
        makeObservation(OBS_LINK, { entityIds: [ENTITY_A, ENTITY_B], validityInterval: temporalInterval('2024-01-01T00:00:00.000Z', '2024-03-01T00:00:00.000Z') }),
        makeObservation(OBS_OTHER, { entityIds: [ENTITY_A, ENTITY_B] }),
      ],
      hypothesisContext: makeHypothesisContext({
        atomics: [
          makeAtomic(HYP_SUPPORTING),
          makeAtomic(HYP_COMPETING, { predicate: 'communication' }),
          makeAtomic(HYP_ENTITY, { hypothesisType: 'ENTITY_HYPOTHESIS' }),
        ],
      }),
    });

    const first = generateCompetingExplanations(baseInput);

    const reordered = makeCompetingInput({
      candidate: {
        expectedRelationshipType: 'financial',
        supportingObservationIds: [OBS_LINK],
        supportingHypothesisIds: [HYP_SUPPORTING],
      },
      observations: [
        makeObservation(OBS_OTHER, { entityIds: [ENTITY_A, ENTITY_B] }),
        makeObservation(OBS_LINK, { entityIds: [ENTITY_A, ENTITY_B], validityInterval: temporalInterval('2024-01-01T00:00:00.000Z', '2024-03-01T00:00:00.000Z') }),
      ],
      hypothesisContext: makeHypothesisContext({
        atomics: [
          makeAtomic(HYP_ENTITY, { hypothesisType: 'ENTITY_HYPOTHESIS' }),
          makeAtomic(HYP_SUPPORTING),
          makeAtomic(HYP_COMPETING, { predicate: 'communication' }),
        ],
      }),
    });
    const second = generateCompetingExplanations(reordered);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('never exceeds MAX_COMPETING_EXPLANATIONS and keeps ids unique', () => {
    const input = makeCompetingInput({
      candidate: {
        expectedRelationshipType: 'financial',
        supportingObservationIds: [OBS_LINK],
        supportingHypothesisIds: [HYP_SUPPORTING],
      },
      observations: [makeObservation(OBS_LINK, { entityIds: [ENTITY_A, ENTITY_B] })],
      hypothesisContext: makeHypothesisContext({
        atomics: [
          makeAtomic(HYP_SUPPORTING),
          makeAtomic(HYP_COMPETING, { predicate: 'communication' }),
          makeAtomic(HYP_ENTITY, { hypothesisType: 'ENTITY_HYPOTHESIS' }),
        ],
      }),
    });
    const set = generateCompetingExplanations(input);

    expect(set.explanations.length).toBeLessThanOrEqual(5);
    expect(set.explanationCount).toBe(set.explanations.length);
    const ids = new Set(set.explanations.map((e) => e.explanationId));
    expect(ids.size).toBe(set.explanations.length);
  });

  it('only references ids that exist in the supplied closed-world context', () => {
    const input = makeCompetingInput({
      candidate: {
        expectedRelationshipType: 'financial',
        supportingObservationIds: [OBS_LINK],
        supportingHypothesisIds: [HYP_SUPPORTING],
      },
      observations: [makeObservation(OBS_LINK, { entityIds: [ENTITY_A, ENTITY_B] })],
      hypothesisContext: makeHypothesisContext({
        atomics: [makeAtomic(HYP_SUPPORTING), makeAtomic(HYP_ENTITY, { hypothesisType: 'ENTITY_HYPOTHESIS' })],
      }),
    });
    const set = generateCompetingExplanations(input);

    const obsIds = new Set(input.context.observations.map((o) => o.id));
    const hypIds = new Set(input.context.hypothesisContext.atomic.map((a) => a.derivedId));
    const nodeIds = new Set(input.context.nodes.map((n) => n.id));
    for (const e of set.explanations) {
      expect(e.structuralSignalIds.every((id) => nodeIds.has(id))).toBe(true);
      expect([...e.supportingObservationIds, ...e.contradictingObservationIds].every((id) => obsIds.has(id))).toBe(true);
      expect(
        [...e.supportingHypothesisIds, ...e.contradictingHypothesisIds].every((id) => hypIds.has(id)),
      ).toBe(true);
      expect(e.explanationId).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('binds every set to the real classification (case + version echo)', () => {
    const input = makeCompetingInput({
      candidate: { supportingHypothesisIds: [HYP_SUPPORTING] },
      hypothesisContext: makeHypothesisContext({ atomics: [makeAtomic(HYP_SUPPORTING)] }),
    });
    const set = generateCompetingExplanations(input);
    expect(set.caseId).toBe(CASE_ID);
    expect(set.graphVersionId).toBe(GRAPH_VERSION_ID);
    expect(set.graphHoleId).toBe(input.context.qualifiedCandidate.rawCandidate.candidateId);
    expect(set.classification.contextSha256).toBe(input.gapClassification.contextSha256);
    expect(set.classification.classificationPolicyVersion).toBe('v1');
    expect(set.policyVersion).toBe('v1');
    const nodesPresent = new Set(input.context.nodes.map((n) => n.id));
    expect(nodesPresent.has(NODE_A)).toBe(true);
    expect(nodesPresent.has(NODE_B)).toBe(true);
  });
});