import { describe, it, expect } from 'vitest';
import { RecommendedEvidenceSchema } from '../src/index.js';

// ============================================================================
// PR10 freeze — RecommendedEvidence (PR7 analysis surface)
//
// F1: evidenceType uses the canonical EvidenceTypeSchema vocabulary.
// F3: discriminatesAmongIds names the competing explanations this request
//     would help distinguish — atomic-hypothesis derivedIds (ID-based, into
//     the supplied bounded context). LLM-proposed, NOT authoritative.
// ============================================================================

const OBS = '00000000-0000-4b7f-0000-0000000000bb';

const valid = {
  evidenceType: 'COMMUNICATION',
  rationale: 'Direct records would confirm or rule out the expected contact.',
  supportingObservationIds: [OBS],
} as const;

describe('RecommendedEvidenceSchema (PR10 freeze)', () => {
  it('accepts a canonical evidence type', () => {
    expect(RecommendedEvidenceSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects free-form descriptive evidence types', () => {
    expect(
      RecommendedEvidenceSchema.safeParse({ ...valid, evidenceType: 'federal response letter' }).success,
    ).toBe(false);
    expect(
      RecommendedEvidenceSchema.safeParse({ ...valid, evidenceType: 'communication-records' }).success,
    ).toBe(false);
  });

  it('accepts an optional ID-based discrimination target', () => {
    const withTarget = {
      ...valid,
      discriminatesAmongIds: ['atomic:RELATION_HYPOTHESIS:rel-1', 'atomic:ENTITY_HYPOTHESIS:ent-1'],
    };
    expect(RecommendedEvidenceSchema.safeParse(withTarget).success).toBe(true);
  });

  it('rejects non-string discrimination targets', () => {
    expect(
      RecommendedEvidenceSchema.safeParse({
        ...valid,
        discriminatesAmongIds: [9876],
      }).success,
    ).toBe(false);
  });

  it('discrimination target is optional (recommendation without explicit target)', () => {
    const { discriminatesAmongIds: _dropped, ...without } = { ...valid, discriminatesAmongIds: [] };
    expect(RecommendedEvidenceSchema.safeParse(without).success).toBe(true);
  });
});