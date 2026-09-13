// ============================================================================
// Phase 5A-PR3 — hypothesis-context unit tests
//
// Covers the full source -> atomic -> overlap -> WCC -> bounded-Group chain:
// normalization of both authoritative sources, mixed/hybrid input, byte-stable
// determinism, dedupe, canonical-only overlap, WCC grouping, deterministic
// splitting under the frozen §19 bounds (25 atomics / 50 nodes), split ordering
// (EVIDENCE_SUPPORT_DESC, STRUCTURAL_RELEVANCE_DESC, HYPOTHESIS_ID_ASC),
// contradiction preservation, graph-version preservation, accounting, and
// empty-input behavior.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { buildHypothesisContext } from '../src/index.js';
import type {
  EntityCandidate,
  EntityHypothesis,
  ObservedTime,
  Provenance,
  RelationHypothesis,
} from '@indago/contracts';

// ============================================================================
// Fixtures
// ============================================================================

let fixtureCounter = 0;

function uid(prefix: string): string {
  fixtureCounter += 1;
  return `${prefix}-${String(fixtureCounter).padStart(4, '0')}`;
}

function now(): ObservedTime {
  return { value: '2025-01-01T00:00:00.000Z', precision: 'exact' };
}

function prov(): Provenance {
  return { sourceId: 'src-fixture', extractor: 'test-fixture-v1' };
}

function relationHyp(overrides: Partial<RelationHypothesis> = {}): RelationHypothesis {
  return {
    id: uid('rel'),
    sourceEntityId: 'unknown-source',
    targetEntityId: 'unknown-target',
    relationType: 'ownership',
    support: 0.7,
    evidenceBasis: [],
    directed: false,
    status: 'PROPOSED',
    provenance: prov(),
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

function candidate(entityId: string, evidence: readonly string[] = []): EntityCandidate {
  return { entityId, confidence: 0.5, evidence: [...evidence], sourceCount: 1 };
}

function entityHyp(overrides: Partial<EntityHypothesis> = {}): EntityHypothesis {
  return {
    id: uid('ent'),
    caseId: uid('case'),
    comparisonStatus: 'NOT_COMPARED',
    score: 0.6,
    scoreModelVersion: 'entity-score-test-v1',
    status: 'PROPOSED',
    provenance: prov(),
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

// ============================================================================
// 1. RelationHypothesis normalization
// ============================================================================

describe('RelationHypothesis -> atomic', () => {
  it('maps subject/predicate/object, evidence, temporal scope, and graph version faithfully', () => {
    const rel = relationHyp({
      id: 'rel-1',
      sourceEntityId: 'entity-a',
      targetEntityId: 'entity-b',
      relationType: 'financial',
      support: 0.82,
      strength: 0.44,
      evidenceBasis: ['obs-b', 'obs-a'],
      contradictions: ['obs-x', 'obs-y'],
      temporalInterval: {
        validFrom: { value: '2024-01-01T00:00:00.000Z', precision: 'day' },
        precision: 'day',
        semantics: 'observed',
      },
    });

    const context = buildHypothesisContext({
      caseId: 'case-1',
      graphVersionId: 'graph-v3',
      relationHypotheses: [rel],
    });

    const atom = context.atomic[0]!;
    expect(atom).toMatchObject({
      derivedId: 'atomic:RELATION_HYPOTHESIS:rel-1',
      hypothesisType: 'RELATION_HYPOTHESIS',
      predicate: 'financial',
      evidenceSupport: 0.82,
      structuralRelevance: 0.44,
      graphVersion: 'graph-v3',
    });
    expect(atom.subject).toEqual({ kind: 'canonical_entity', id: 'entity-a' });
    expect(atom.object).toEqual({ kind: 'canonical_entity', id: 'entity-b' });
    // Evidence id sets are sorted byte-stable.
    expect(atom.supportingObservations).toEqual(['obs-a', 'obs-b']);
    expect(atom.contradictingObservations).toEqual(['obs-x', 'obs-y']);
    expect(atom.contradictingHypothesisIds).toEqual([]);
    expect(atom.temporalScope).toEqual({
      validFrom: { value: '2024-01-01T00:00:00.000Z', precision: 'day' },
      precision: 'day',
      semantics: 'observed',
    });
    expect(atom.provenance).toEqual(prov());
  });

  it('treats absent strength/temporal/graph-version as null/0, never invented', () => {
    const rel = relationHyp({ id: 'rel-2', support: 0.3 });
    const context = buildHypothesisContext({ caseId: 'case-1', relationHypotheses: [rel] });
    const atom = context.atomic[0]!;
    expect(atom.temporalScope).toBeNull();
    expect(atom.graphVersion).toBeNull();
    expect(atom.structuralRelevance).toBe(0);
    expect(atom.contradictingObservations).toEqual([]);
  });
});

// ============================================================================
// 2. EntityHypothesis normalization (canonical + v1 candidate flows)
// ============================================================================

describe('EntityHypothesis -> atomic', () => {
  it('uses canonical refs already present (Entity<->Entity flow) with predicate same-entity', () => {
    const ent = entityHyp({
      id: 'ent-1',
      entityId: 'entity-x',
      resolvedEntityId: 'entity-y',
      candidateEntities: [candidate('entity-z', ['obs-c1'])],
      supportingObservationIds: ['obs-s1', 'obs-s2'],
    });

    const context = buildHypothesisContext({ caseId: 'case-1', entityHypotheses: [ent] });
    const atom = context.atomic[0]!;

    expect(atom).toMatchObject({
      derivedId: 'atomic:ENTITY_HYPOTHESIS:ent-1',
      hypothesisType: 'ENTITY_HYPOTHESIS',
      predicate: 'same-entity',
      evidenceSupport: 0.6,
      structuralRelevance: 0,
      graphVersion: null,
    });
    expect(atom.subject).toEqual({ kind: 'canonical_entity', id: 'entity-x' });
    expect(atom.object).toEqual({ kind: 'canonical_entity', id: 'entity-y' });
    // Positive evidence merged from supportingObservationIds + candidate evidence, sorted.
    expect(atom.supportingObservations).toEqual(['obs-c1', 'obs-s1', 'obs-s2']);
  });

  it('keeps v1 Candidate<->Candidate refs as candidate (never canonical), and does not overlap', () => {
    const ent = entityHyp({
      id: 'ent-2',
      candidatePairId: 'pair-1',
      supportingCandidateIds: ['candidate-a', 'candidate-b'],
    });

    const context = buildHypothesisContext({ caseId: 'case-1', entityHypotheses: [ent] });
    const atom = context.atomic[0]!;

    expect(atom.subject).toEqual({ kind: 'candidate', id: 'candidate-a' });
    expect(atom.object).toEqual({ kind: 'candidate', id: 'candidate-b' });
    // v1 hypothesis carries no canonical entity -> isolated, singleton group, no nodes.
    expect(context.accounting.isolatedAtomics).toBe(1);
    expect(context.groups).toHaveLength(1);
    expect(context.groups[0]!.canonicalEntityCount).toBe(0);
    expect(context.groups[0]!.sharedNodeIds).toEqual([]);
    expect(context.groups[0]!.truncated).toBe(false);
  });

  it('preserves contradiction observation ids AND contradictory hypothesis ids', () => {
    const ent = entityHyp({
      id: 'ent-3',
      entityId: 'entity-x',
      candidateEntities: [candidate('entity-y')],
      contradictingObservationIds: ['obs-d1', 'obs-d0'],
      contradictions: ['hyp-arbitrary-1', 'hyp-arbitrary-2'],
    });

    const context = buildHypothesisContext({ caseId: 'case-1', entityHypotheses: [ent] });
    const atom = context.atomic[0]!;

    expect(atom.contradictingObservations).toEqual(['obs-d0', 'obs-d1']);
    expect(atom.contradictingHypothesisIds).toEqual(['hyp-arbitrary-1', 'hyp-arbitrary-2']);
  });
});

// ============================================================================
// 3. Mixed input, dedupe, ordering, determinism
// ============================================================================

describe('mixed input ordering + determinism', () => {
  it('blends relation + entity sources into one canonical atomic list', () => {
    const rel = relationHyp({ id: 'rel-1', sourceEntityId: 'a', targetEntityId: 'b', support: 0.8 });
    const ent = entityHyp({ id: 'ent-1', entityId: 'a', candidateEntities: [candidate('z')], score: 0.4 });

    const context = buildHypothesisContext({
      caseId: 'case-1',
      relationHypotheses: [rel],
      entityHypotheses: [ent],
    });

    expect(context.atomic).toHaveLength(2);
    // EVIDENCE_SUPPORT_DESC: relation (0.8) before entity (0.4).
    expect(context.atomic[0]!.derivedId).toBe('atomic:RELATION_HYPOTHESIS:rel-1');
    expect(context.atomic[1]!.derivedId).toBe('atomic:ENTITY_HYPOTHESIS:ent-1');
  });

  it('uses structural relevance then derived id as deterministic tie-breaks', () => {
    const a = relationHyp({ id: 'a', sourceEntityId: 'x', targetEntityId: 'y', support: 0.5, strength: 0.9 });
    const b = relationHyp({ id: 'b', sourceEntityId: 'x', targetEntityId: 'z', support: 0.5, strength: 0.1 });
    const c = relationHyp({ id: 'c', sourceEntityId: 'u', targetEntityId: 'v', support: 0.5, strength: 0.1 });

    const context = buildHypothesisContext({ caseId: 'case-1', relationHypotheses: [c, b, a] });
    expect(context.atomic.map((atom) => atom.derivedId)).toEqual([
      'atomic:RELATION_HYPOTHESIS:a',
      'atomic:RELATION_HYPOTHESIS:b',
      'atomic:RELATION_HYPOTHESIS:c',
    ]);
  });

  it('dedupes identical source hypotheses by derived id (first occurrence wins)', () => {
    const rel = relationHyp({ id: 'rel-dup', sourceEntityId: 'a', targetEntityId: 'b' });
    const context = buildHypothesisContext({
      caseId: 'case-1',
      relationHypotheses: [rel, rel, rel],
    });
    expect(context.atomic).toHaveLength(1);
    expect(context.accounting.atomicHypotheses).toBe(1);
  });

  it('produces byte-identical output regardless of input array order and across runs', () => {
    const rel1 = relationHyp({ id: 'r1', sourceEntityId: 'a', targetEntityId: 'b', support: 0.9 });
    const rel2 = relationHyp({ id: 'r2', sourceEntityId: 'b', targetEntityId: 'c', support: 0.7 });
    const ent = entityHyp({ id: 'e1', entityId: 'c', candidateEntities: [candidate('d')], score: 0.5 });

    const forward = buildHypothesisContext({
      caseId: 'case-1',
      graphVersionId: 'graph-v1',
      relationHypotheses: [rel1, rel2],
      entityHypotheses: [ent],
    });
    const backward = buildHypothesisContext({
      caseId: 'case-1',
      graphVersionId: 'graph-v1',
      relationHypotheses: [rel2, rel1],
      entityHypotheses: [ent],
    });

    expect(JSON.stringify(forward)).toBe(JSON.stringify(backward));
    expect(JSON.stringify(buildHypothesisContext({
      caseId: 'case-1',
      graphVersionId: 'graph-v1',
      relationHypotheses: [rel1, rel2],
      entityHypotheses: [ent],
    }))).toBe(JSON.stringify(forward));
  });
});

// ============================================================================
// 4. Overlap graph + WCC grouping
// ============================================================================

describe('overlap graph + weakly connected components', () => {
  it('links hypotheses sharing one canonical entity', () => {
    const r1 = relationHyp({ id: 'r1', sourceEntityId: 'a', targetEntityId: 'hub' });
    const r2 = relationHyp({ id: 'r2', sourceEntityId: 'hub', targetEntityId: 'b' });

    const context = buildHypothesisContext({ caseId: 'case-1', relationHypotheses: [r1, r2] });

    expect(context.accounting.components).toBe(1);
    expect(context.groups).toHaveLength(1);
    expect(context.groups[0]!.atomicHypotheses.map((a) => a.derivedId)).toEqual([
      'atomic:RELATION_HYPOTHESIS:r1',
      'atomic:RELATION_HYPOTHESIS:r2',
    ]);
  });

  it('groups a chain through transitive sharing into one component', () => {
    const r1 = relationHyp({ id: 'r1', sourceEntityId: 'e1', targetEntityId: 'e2' });
    const r2 = relationHyp({ id: 'r2', sourceEntityId: 'e2', targetEntityId: 'e3' });
    const r3 = relationHyp({ id: 'r3', sourceEntityId: 'e3', targetEntityId: 'e4' });

    const context = buildHypothesisContext({ caseId: 'case-1', relationHypotheses: [r3, r1, r2] });

    expect(context.accounting.components).toBe(1);
    expect(context.groups).toHaveLength(1);
    // sharedNodeIds is the canonical shared-context subgraph, sorted unique.
    expect(context.groups[0]!.sharedNodeIds).toEqual(['entity:e1', 'entity:e2', 'entity:e3', 'entity:e4']);
    expect(context.groups[0]!.canonicalEntityCount).toBe(4);
  });

  it('keeps fully disjoint hypotheses as separate singleton groups', () => {
    const r1 = relationHyp({ id: 'r1', sourceEntityId: 'e1', targetEntityId: 'e2' });
    const r2 = relationHyp({ id: 'r2', sourceEntityId: 'e3', targetEntityId: 'e4' });

    const context = buildHypothesisContext({ caseId: 'case-1', relationHypotheses: [r1, r2] });

    expect(context.accounting.components).toBe(2);
    expect(context.accounting.groups).toBe(2);
    expect(context.accounting.truncatedGroups).toBe(0);
    expect(context.groups.map((g) => g.atomicHypotheses.length)).toEqual([1, 1]);
  });

  it('groups mixed relation + (future-flow) entity hypotheses sharing a canonical entity', () => {
    const rel = relationHyp({ id: 'rel-mix', sourceEntityId: 'entity-bridge', targetEntityId: 'entity-r' });
    const ent = entityHyp({ id: 'ent-mix', entityId: 'entity-bridge', candidateEntities: [candidate('entity-e')] });

    const context = buildHypothesisContext({
      caseId: 'case-1',
      relationHypotheses: [rel],
      entityHypotheses: [ent],
    });

    expect(context.accounting.components).toBe(1);
    expect(context.groups).toHaveLength(1);
    expect(context.groups[0]!.atomicHypotheses).toHaveLength(2);
    expect(context.groups[0]!.sharedNodeIds).toContain('entity:entity-bridge');
  });
});

// ============================================================================
// 5. Bounds + deterministic split (§19)
// ============================================================================

describe('deterministic bounded splitting', () => {
  it('splits a 26-hypothesis connected component into 25 + 1 and retains all exactly once', () => {
    const hubRelations = Array.from({ length: 26 }, (_, index) =>
      relationHyp({ id: `hub-rel-${index}`, sourceEntityId: 'hub', targetEntityId: `target-${index}` }),
    );

    const context = buildHypothesisContext({ caseId: 'case-1', relationHypotheses: hubRelations });

    expect(context.accounting.components).toBe(1);
    expect(context.groups).toHaveLength(2);
    expect(context.groups[0]!.atomicHypotheses).toHaveLength(25);
    expect(context.groups[1]!.atomicHypotheses).toHaveLength(1);

    // Every retained hypothesis appears exactly once across groups.
    const seen = context.groups.flatMap((g) => g.atomicHypotheses.map((a) => a.derivedId));
    expect(seen).toHaveLength(26);
    expect(new Set(seen).size).toBe(26);
    expect(seen).toContain('atomic:RELATION_HYPOTHESIS:hub-rel-0');
    expect(seen).toContain('atomic:RELATION_HYPOTHESIS:hub-rel-25');

    // Component exceeded MAX_ATOMIC_HYPOTHESES_PER_GROUP -> recorded on all groups.
    expect(context.groups[0]!.truncated).toBe(true);
    expect(context.groups[1]!.truncated).toBe(true);
    expect(context.groups[0]!.truncatedReason).toBe('ATOMIC_HYPOTHESES_CAP');
    expect(context.accounting.truncatedGroups).toBe(2);
    expect(context.accounting.totalCanonicalNodesAcrossGroups).toBe(28);
  });

  it('orders a split by EVIDENCE_SUPPORT_DESC independent of input order', () => {
    const chain = Array.from({ length: 26 }, (_, index) => {
      const id = `ord-${String(index).padStart(2, '0')}`;
      return relationHyp({
        id,
        sourceEntityId: 'hub',
        targetEntityId: `t-${index}`,
        support: 1 - index * 0.01,
      });
    });
    const scrambled = [...chain].reverse();

    const context = buildHypothesisContext({ caseId: 'case-1', relationHypotheses: scrambled });
    const firstGroup = context.groups[0]!.atomicHypotheses;

    // Highest support first (ord-00 = 1.0); the last member carries the lowest support.
    expect(firstGroup[0]!.derivedId).toBe('atomic:RELATION_HYPOTHESIS:ord-00');
    expect(context.groups[1]!.atomicHypotheses[0]!.derivedId).toBe(
      'atomic:RELATION_HYPOTHESIS:ord-25',
    );

    // Whole split keeps global support-descending order.
    for (let i = 1; i < firstGroup.length; i++) {
      expect(firstGroup[i - 1]!.evidenceSupport).toBeGreaterThan(firstGroup[i]!.evidenceSupport);
    }
  });

  it('enforces MAX_GROUP_NODES before MAX_ATOMIC_HYPOTHESES_PER_GROUP', () => {
    // 25 connected entity hypotheses, each with 3 distinct canonical refs
    // (entityId + 2 candidateEntities) forming a chain -> 51 canonical nodes total.
    const chain: EntityHypothesis[] = [];
    for (let index = 0; index < 25; index++) {
      const first = `node-${index * 2 + 1}`;
      const middle = `node-${index * 2 + 2}`;
      const last = `node-${index * 2 + 3}`;
      chain.push(
        entityHyp({
          id: `chain-ent-${index}`,
          entityId: first,
          candidateEntities: [candidate(middle), candidate(last)],
        }),
      );
    }

    const context = buildHypothesisContext({ caseId: 'case-1', entityHypotheses: chain });

    expect(context.accounting.components).toBe(1);
    expect(context.groups).toHaveLength(2);
    expect(context.groups[0]!.atomicHypotheses).toHaveLength(24);
    expect(context.groups[1]!.atomicHypotheses).toHaveLength(1);
    expect(context.groups[0]!.truncatedReason).toBe('GROUP_NODES_CAP');
    expect(context.groups[0]!.canonicalEntityCount).toBeLessThanOrEqual(50);
    expect(context.accounting.truncatedGroups).toBe(2);
  });

  it('never produces a group beyond either frozen bound for large connected mixed input', () => {
    const relations = Array.from({ length: 30 }, (_, index) =>
      relationHyp({ id: `rel-big-${index}`, sourceEntityId: 'hub', targetEntityId: `tr-${index}` }),
    );
    const entities = Array.from({ length: 10 }, (_, index) =>
      entityHyp({ id: `ent-big-${index}`, entityId: 'hub', candidateEntities: [candidate(`cd-${index}`)] }),
    );

    const context = buildHypothesisContext({
      caseId: 'case-1',
      relationHypotheses: relations,
      entityHypotheses: entities,
    });

    expect(context.accounting.components).toBe(1);
    expect(context.groups).toHaveLength(2);
    for (const group of context.groups) {
      expect(group.atomicHypotheses.length).toBeLessThanOrEqual(25);
      expect(group.canonicalEntityCount).toBeLessThanOrEqual(50);
    }
    const total = context.groups.reduce((sum, g) => sum + g.atomicHypotheses.length, 0);
    expect(total).toBe(40);
    expect(context.accounting.totalCanonicalNodesAcrossGroups).toBe(
      context.groups.reduce((sum, g) => sum + g.canonicalEntityCount, 0),
    );
  });
});

// ============================================================================
// 6. Empty input, accounting, graph-version preservation
// ============================================================================

describe('empty input + accounting', () => {
  it('produces a valid empty context', () => {
    const context = buildHypothesisContext({ caseId: 'case-empty' });
    expect(context.atomic).toEqual([]);
    expect(context.groups).toEqual([]);
    expect(context.accounting).toMatchObject({
      inputRelationHypotheses: 0,
      inputEntityHypotheses: 0,
      atomicHypotheses: 0,
      components: 0,
      groups: 0,
      truncatedGroups: 0,
      isolatedAtomics: 0,
    });
    expect(context.graphVersionId).toBeNull();
  });

  it('stamps graph version onto every derived atomic hypothesis when provided', () => {
    const rel = relationHyp({ id: 'rel-gv', sourceEntityId: 'a', targetEntityId: 'b' });
    const context = buildHypothesisContext({
      caseId: 'case-1',
      graphVersionId: 'graph-v9',
      relationHypotheses: [rel],
    });
    expect(context.graphVersionId).toBe('graph-v9');
    expect(context.atomic[0]!.graphVersion).toBe('graph-v9');
  });

  it('accounts a single hypothesis exactly once across counts', () => {
    const rel = relationHyp({ id: 'rel-acct', sourceEntityId: 'a', targetEntityId: 'b' });
    const context = buildHypothesisContext({ caseId: 'case-1', relationHypotheses: [rel, rel] });
    expect(context.accounting.inputRelationHypotheses).toBe(2);
    expect(context.accounting.atomicHypotheses).toBe(1);
    expect(context.accounting.components).toBe(1);
    expect(context.accounting.groups).toBe(1);
    expect(context.accounting.truncatedGroups).toBe(0);
  });
});