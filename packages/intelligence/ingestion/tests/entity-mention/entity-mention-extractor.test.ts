import { describe, it, expect } from 'vitest';
import {
  extractEntityMentions,
  finalizeEntityMention,
  ENTITY_MENTION_IDENTITY_DERIVATION,
  deterministicEntityMentionId,
  buildEntityMentionIdentityKey,
  ENTITY_PATTERN_RULES,
  matchTypedPatterns,
  createGazetteer,
  classifyByContext,
} from '../../src/entity-mention/index.js';
import type { Observation } from '@indago/contracts';
import { EntityMentionCandidateSchema } from '@indago/contracts';

// ============================================================================
// M-A07 Entity Mention Candidate — extraction unit tests
//
// HARD RULES under test:
//   § locked pipeline — PATTERN → GAZETTEER → CONTEXTUAL → HEURISTIC.
//   § deterministic — identical Observation → identical drafts + ids.
//   § boundary — extracts mentions ONLY; never assigns EntityId/score; never
//       merges across observations; never fabricates provenance.
//   § explicit uncertainty — untyped capitalized tokens stay UNTYPED
//       (HEURISTIC_FALLBACK) rather than forcing PERSON/LOCATION/ORGANIZATION.
//   § gazetteer is injected data — engine never hardcodes entries.
//   § bounded output — ENTITY_MENTION_BOUNDS caps mentions.
// ============================================================================

const LONG_UUID = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function makeObservation(content: string, id: string = LONG_UUID(50)): Observation {
  return {
    id,
    evidenceId: LONG_UUID(10),
    sourceId: LONG_UUID(11),
    type: 'FACTUAL',
    content,
    entityIds: [],
    candidateMentions: [],
    strength: 0.6,
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

describe('M-A07 pipeline stages', () => {
  it('PATTERN_MATCH: classifies an email mention with exact offsets', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('Contact ravi.akram@example.org today.'),
    );
    const email = drafts.find((d) => d.extractionMethod === 'PATTERN_MATCH');
    expect(email).toBeDefined();
    expect(email!.entityType).toBe('EMAIL');
    expect(email!.text).toBe('ravi.akram@example.org');
    expect(email!.start).toBe('Contact '.length);
  });

  it('PATTERN_MATCH: classifies honorific-prefixed person, phone, account', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('Dr. Ravi Akram called +91-98765-43210 from account ACCT-112.'),
    );
    const person = drafts.find((d) => d.entityType === 'PERSON');
    const phone = drafts.find((d) => d.entityType === 'PHONE');
    const account = drafts.find((d) => d.entityType === 'ACCOUNT');
    expect(person?.text).toBe('Dr. Ravi Akram');
    expect(phone?.text).toBe('+91-98765-43210');
    expect(account?.text).toBe('ACCT-112');
  });

  it('GAZETTEER_MATCH: injected data classifies a known location token', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('Met the source near Chandigarh yesterday.'),
      { gazetteerEntries: [{ token: 'Chandigarh', entityType: 'LOCATION' }] },
    );
    const gz = drafts.find((d) => d.extractionMethod === 'GAZETTEER_MATCH');
    expect(gz).toBeDefined();
    expect(gz!.entityType).toBe('LOCATION');
    expect(gz!.text).toBe('Chandigarh');
  });

  it('CONTEXTUAL_RULE: nearby category label types an otherwise-untyped token', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('Subject was seen at Premises Solaris Tower.'),
    );
    const ctx = drafts.find((d) => d.extractionMethod === 'CONTEXTUAL_RULE');
    expect(ctx).toBeDefined();
    expect(ctx!.entityType).toBe('LOCATION');
    expect(ctx!.text).toBe('Premises Solaris Tower');
  });

  it('HEURISTIC_FALLBACK: untyped capitalized tokens stay untyped (explicit uncertainty)', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('Ramu met Bhola at the market.'),
    );
    const heuristic = drafts.filter((d) => d.extractionMethod === 'HEURISTIC_FALLBACK');
    expect(heuristic.length).toBeGreaterThan(0);
    for (const d of heuristic) {
      expect(d.entityType).toBeUndefined();
    }
  });
});

describe('M-A07 determinism and identity', () => {
  it('same observation → identical drafts and ids', async () => {
    const obs = makeObservation('Dr. Ravi Akram at ravi.akram@example.org.');
    const a = await extractEntityMentions(obs);
    const b = await extractEntityMentions(obs);
    expect(a.drafts).toEqual(b.drafts);

    const nowIso = '2026-01-01T00:00:00.000Z';
    const fa = await finalizeEntityMention({ draft: a.drafts[0]!, nowIso });
    const fb = await finalizeEntityMention({ draft: b.drafts[0]!, nowIso });
    expect(fa.id).toBe(fb.id);
    expect(EntityMentionCandidateSchema.safeParse(fa).success).toBe(true);
  });

  it('identity excludes nothing needed: distinct spans → distinct ids', async () => {
    const idA = await deterministicEntityMentionId({
      observationId: LONG_UUID(50), start: 0, end: 4, entityType: 'PERSON',
    });
    const idB = await deterministicEntityMentionId({
      observationId: LONG_UUID(50), start: 5, end: 9, entityType: 'PERSON',
    });
    expect(idA).not.toBe(idB);
  });

  it('identity is observation-scoped: same text in different observations differs', async () => {
    const obs1 = makeObservation('Ravi was here.', LONG_UUID(70));
    const obs2 = makeObservation('Ravi was here.', LONG_UUID(71));
    const a = (await extractEntityMentions(obs1)).drafts[0]!;
    const b = (await extractEntityMentions(obs2)).drafts[0]!;
    const nowIso = '2026-01-01T00:00:00.000Z';
    const fa = await finalizeEntityMention({ draft: a, nowIso });
    const fb = await finalizeEntityMention({ draft: b, nowIso });
    expect(fa.id).not.toBe(fb.id);
  });

  it('exposes the versioned identity derivation constant', () => {
    expect(ENTITY_MENTION_IDENTITY_DERIVATION).toEqual({
      namespace: 'indago:entity-mention-candidate',
      version: 1,
    });
  });

  it('buildEntityMentionIdentityKey is versioned and stable', () => {
    const key = buildEntityMentionIdentityKey({
      observationId: LONG_UUID(50), start: 0, end: 4, entityType: 'EMAIL',
    });
    expect(key).toMatch(/^\["indago:entity-mention-candidate","v1"/);
  });
});

describe('M-A07 boundaries', () => {
  it('never fabricates provenance — inherits the observation provenance verbatim', async () => {
    const obs = makeObservation('Dr. Ravi Akram called.');
    const { drafts } = await extractEntityMentions(obs);
    for (const d of drafts) {
      expect(d.provenance).toEqual(obs.provenance);
      expect(d.provenance.artifactId).toBe(LONG_UUID(1));
    }
  });

  it('candidate carries no EntityId / resolution score', async () => {
    const obs = makeObservation('Dr. Ravi Akram called.');
    const { drafts } = await extractEntityMentions(obs);
    for (const d of drafts) {
      expect(d).not.toHaveProperty('entityId');
      expect(d).not.toHaveProperty('resolutionScore');
    }
    const cand = await finalizeEntityMention({
      draft: drafts[0]!, nowIso: '2026-01-01T00:00:00.000Z',
    });
    expect(cand).not.toHaveProperty('entityId');
    expect(cand).not.toHaveProperty('resolutionScore');
  });

  it('bounded output: never exceeds ENTITY_MENTION_BOUNDS.maxMentions', async () => {
    const content = Array.from(
      { length: 200 },
      (_, i) => `Person ${i} Alpha Beta`,
    ).join(' ');
    const { drafts } = await extractEntityMentions(makeObservation(content));
    expect(drafts.length).toBeLessThanOrEqual(100);
  });
});

describe('M-A07 raw helpers', () => {
  it('ENTITY_PATTERN_RULES are typed and non-empty', () => {
    expect(ENTITY_PATTERN_RULES.length).toBeGreaterThan(0);
    for (const rule of ENTITY_PATTERN_RULES) {
      expect(['PERSON','ORGANIZATION','LOCATION','PHONE','EMAIL','ACCOUNT','DEVICE','VEHICLE','ADDRESS','OTHER']).toContain(rule.entityType);
    }
  });

  it('matchTypedPatterns is deterministic in document order', () => {
    const a = matchTypedPatterns('Contact a@b.com and c@d.com.');
    const b = matchTypedPatterns('Contact a@b.com and c@d.com.');
    expect(a).toEqual(b);
  });

  it('createGazetteer is case-folded and deterministic', () => {
    const gz = createGazetteer([
      { token: 'Chandigarh', entityType: 'LOCATION' },
      { token: 'chandigarh', entityType: 'OTHER' }, // duplicate → first wins
    ]);
    expect(gz.lookup('CHANDIGARH')).toBe('LOCATION');
    expect(gz.lookup('unknown')).toBeUndefined();
  });

  it('classifyByContext respects the stopword guard', () => {
    expect(classifyByContext({ text: 'that', start: 5, end: 9, content: 'near that x' })).toBeUndefined();
  });
});
