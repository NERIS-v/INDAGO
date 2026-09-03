import { describe, expect, it } from 'vitest';
import {
  RelationTypeSchema,
  RelationStatusSchema,
  RelationHypothesisSchema,
  EntityIdSchema,
  type RelationHypothesis,
} from '../src/index.js';

// ============================================================================
// M-A10 Relation Contract Tests
//
// Verifies the locked M-A10 contract surface:
//   § RelationTypeSchema — the exact locked vocabulary (11 values, no invented
//     types, association is an evidence-backed claim not mere co-presence).
//   § RelationStatusSchema — the hypothesis LIFECYCLE, not an authority merge.
//     REVERSED is lifecycle reversal, distinct from MERGED/deletion.
//   § RelationHypothesisSchema — strict; sourceEntityId/targetEntityId are
//     CANONICAL EntityIds (a mention/pair id MUST be rejected by the schema);
//     `directed` defaults true; support is bounded [0,1].
// ============================================================================

const VALID_ENTITY_A = '11111111-2222-4333-8444-555555555555';
const VALID_ENTITY_B = '11111111-2222-4333-8444-666666666666';

function makeHypothesis(overrides: Partial<RelationHypothesis> = {}): RelationHypothesis {
  return {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    sourceEntityId: VALID_ENTITY_A,
    targetEntityId: VALID_ENTITY_B,
    relationType: 'communication',
    support: 0.6,
    evidenceBasis: ['99999999-2222-4333-8444-777777777777'],
    status: 'PROPOSED',
    provenance: {
      sourceId: '11111111-2222-4333-8444-999999999999',
      extractor: 'indago:relation-resolution:engine',
    },
    createdAt: { value: '2026-08-31T00:00:00.000Z', precision: 'exact' },
    updatedAt: { value: '2026-08-31T00:00:00.000Z', precision: 'exact' },
    ...overrides,
  };
}

describe('M-A10 RelationTypeSchema', () => {
  it('contains exactly the locked vocabulary (no invented types)', () => {
    expect(RelationTypeSchema.options).toEqual([
      'communication',
      'financial',
      'ownership',
      'co-location',
      'association',
      'organizational',
      'transport',
      'family',
      'vehicle',
      'case-link',
      'other',
    ]);
  });
});

describe('M-A10 RelationStatusSchema (lifecycle)', () => {
  it('contains the four hypothesis lifecycle states', () => {
    expect(RelationStatusSchema.options).toEqual([
      'PROPOSED',
      'ACCEPTED',
      'REJECTED',
      'REVERSED',
    ]);
  });

  it('does not conflate REVERSED with MERGED or deletion', () => {
    // REVERSED is a lifecycle state present in the enum; MERGED is canonical-
    // entity merge semantics and must NOT appear in the relation status.
    const options = RelationStatusSchema.options;
    expect(options).toContain('REVERSED');
    expect(options).not.toContain('MERGED');
    expect(options).not.toContain('DELETED');
  });
});

describe('M-A10 RelationHypothesisSchema', () => {
  it('accepts a minimal valid hypothesis', () => {
    expect(RelationHypothesisSchema.safeParse(makeHypothesis()).success).toBe(true);
  });

  it('is strict — rejects unknown keys', () => {
    const bad = makeHypothesis({}) as Record<string, unknown>;
    bad.unknownField = 'boom';
    expect(RelationHypothesisSchema.safeParse(bad).success).toBe(false);
  });

  it('defaults `directed` to true when omitted', () => {
    const parsed = RelationHypothesisSchema.parse(makeHypothesis({}));
    expect(parsed.directed).toBe(true);
  });

  it('enforces support within [0,1]', () => {
    const over = makeHypothesis({ support: 1.5 });
    const under = makeHypothesis({ support: -0.1 });
    expect(RelationHypothesisSchema.safeParse(over).success).toBe(false);
    expect(RelationHypothesisSchema.safeParse(under).success).toBe(false);
  });

  it('sourceEntityId/targetEntityId accept real canonical EntityIds', () => {
    expect(EntityIdSchema.safeParse(VALID_ENTITY_A).success).toBe(true);
    expect(EntityIdSchema.safeParse(VALID_ENTITY_B).success).toBe(true);
  });

  it('rejects a mention/candidate-pair id in the canonical EntityId field', () => {
    // A plain, non-EntityId string is rejected; the schema's type guard is the
    // identity boundary that stops mention/pair ids from leaking into M-A10.
    const bad = makeHypothesis({ sourceEntityId: 'not-a-uuid' });
    expect(RelationHypothesisSchema.safeParse(bad).success).toBe(false);
  });

  it('requires provenance (source-grounded contract)', () => {
    const { provenance: _drop, ...rest } = makeHypothesis({});
    const bad = rest as unknown as RelationHypothesis;
    expect(RelationHypothesisSchema.safeParse(bad).success).toBe(false);
  });
});
