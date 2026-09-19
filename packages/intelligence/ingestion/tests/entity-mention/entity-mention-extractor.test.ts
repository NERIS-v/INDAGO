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
      makeObservation('Property was located at Solaris Tower, Sector 7.'),
    );
    const ctx = drafts.find((d) => d.extractionMethod === 'CONTEXTUAL_RULE');
    expect(ctx).toBeDefined();
    expect(ctx!.entityType).toBe('LOCATION');
    expect(ctx!.text).toBe('Solaris Tower');
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
      expect(['PERSON','ORGANIZATION','LOCATION','DATE','PHONE','EMAIL','ACCOUNT','DEVICE','VEHICLE','ADDRESS','OTHER']).toContain(rule.entityType);
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

describe('M-A07 phone hardening (negative + format preservation)', () => {
  it('preserves intended phone formats', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation(
        'Call +91-98765-43210, +91 9876543210, (123) 456-7890, 123-456-7890, or 9876543210.',
      ),
    );
    const phones = drafts
      .filter((d) => d.entityType === 'PHONE')
      .map((d) => d.text);
    expect(phones).toContain('+91-98765-43210');
    expect(phones).toContain('+91 9876543210');
    expect(phones).toContain('(123) 456-7890');
    expect(phones).toContain('123-456-7890');
    expect(phones).toContain('9876543210');
  });

  it('does NOT classify bare 9-16 digit identifiers as PHONE', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('Refs: 123456789012, 1234567890123456, 9845120012345678.'),
    );
    const phones = drafts.filter((d) => d.entityType === 'PHONE');
    expect(phones).toHaveLength(0);
  });

  it('keeps phone/account precedence: a bare 10-digit number stays PHONE, longer runs become ACCOUNT', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('Mobile 9988776655 and ledger 1234567890123456.'),
    );
    const ten = drafts.find((d) => d.entityType === 'PHONE');
    const account = drafts.find((d) => d.entityType === 'ACCOUNT');
    expect(ten?.text).toBe('9988776655');
    expect(account?.text).toBe('1234567890123456');
    expect(ten).not.toBe(account);
  });
});

describe('M-A07 gazetteer semantics (injected data only)', () => {
  it('injected gazetteer: "Rani Bagh" → LOCATION via GAZETTEER_MATCH', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('Meet at Rani Bagh.'),
      { gazetteerEntries: [{ token: 'Rani Bagh', entityType: 'LOCATION' }] },
    );
    const gz = drafts.find((d) => d.extractionMethod === 'GAZETTEER_MATCH');
    expect(gz).toBeDefined();
    expect(gz!.entityType).toBe('LOCATION');
    expect(gz!.text).toBe('Rani Bagh');
  });

  it('no gazetteer: "Rani Bagh" is not LOCATION and not GAZETTEER_MATCH', async () => {
    const { drafts } = await extractEntityMentions(makeObservation('Meet at Rani Bagh.'));
    const gz = drafts.find((d) => d.extractionMethod === 'GAZETTEER_MATCH');
    const anyLocation = drafts.find((d) => d.entityType === 'LOCATION');
    expect(gz).toBeUndefined();
    expect(anyLocation).toBeUndefined();
  });

  it('engine hardcodes no case names (empty default gazetteer classifies nothing)', () => {
    const gz = createGazetteer([]);
    for (const name of ['Rani Bagh', 'Chandigarh', 'ACME', 'Ravi']) {
      expect(gz.lookup(name)).toBeUndefined();
    }
  });
});

describe('M-A07 hard negatives (weak signal never becomes authoritative)', () => {
  const NEGATIVES: Array<{ content: string; label: string }> = [
    { content: 'We meet on Monday.', label: 'Monday' },
    { content: 'Please read The Report.', label: 'The Report' },
    { content: 'Funds moved via Central Bank.', label: 'Central Bank' },
    { content: 'He works at New Delhi Police Station.', label: 'New Delhi Police Station' },
    { content: 'Reference 123456789012.', label: '123456789012' },
  ];

  for (const { content, label } of NEGATIVES) {
    it(`weak capitalization / numeric ambiguity of "${label}" never becomes an authoritative type`, async () => {
      const { drafts } = await extractEntityMentions(makeObservation(content));
      const typed = drafts.filter((d) => d.entityType !== undefined);
      // No draft may claim an authoritative PERSON/LOCATION/ORGANIZATION type.
      for (const d of typed) {
        expect(['PERSON', 'LOCATION', 'ORGANIZATION']).not.toContain(d.entityType);
      }
      // "123456789012" is a 12-digit bare run: it must NOT be a PHONE.
      for (const d of drafts) {
        expect(d.entityType).not.toBe('PHONE');
      }
    });
  }
});

describe('M-A07 pattern precedence (deterministic overlap resolution)', () => {
  it('higher-specificity rule wins and each span yields a single candidate', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('EMail a.b@example.com, phone +91-98765-43210, acct 1234567890123456.'),
    );
    // No two candidates may share the same (start, end, entityType) span.
    const seen = new Set<string>();
    for (const d of drafts) {
      const k = `${d.start}:${d.end}:${d.entityType}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
    // The email stays EMAIL, not PHONE or ACCOUNT.
    const email = drafts.find((d) => d.entityType === 'EMAIL');
    expect(email?.text).toBe('a.b@example.com');
  });

  it('overlapping pattern attempt is deterministic run-to-run', async () => {
    const content = 'a.b@example.com +91-98765-43210 1234567890123456';
    const a = await extractEntityMentions(makeObservation(content));
    const b = await extractEntityMentions(makeObservation(content));
    expect(a.drafts).toEqual(b.drafts);
  });
});

// ============================================================================
// PR-24 (PART 6/7/8/9) — DATE vs PHONE, ORGANIZATION suffix, ACCOUNT ledger
// and contextual PERSON typing. All fixes are conservative: they add a type
// only where a deterministic, source-supported cue exists.
// ============================================================================

describe('M-A07 PR-24 classification hardening', () => {
  it('ISO dates are typed DATE and never PHONE/ACCOUNT (PART 6)', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('Transfer dated 2026-08-12 at 08:30 was completed.'),
    );
    const date = drafts.find((d) => d.entityType === 'DATE');
    expect(date?.text).toBe('2026-08-12');
    for (const d of drafts) {
      if (d.text.includes('2026-08-12')) {
        expect(d.entityType).toBe('DATE');
      }
    }
  });

  it('types a capitalized company with a corporate suffix as ORGANIZATION (PART 8)', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('Neha Kapoor attended Meridian Trading LLP and Northstar Logistics Pvt Ltd.'),
    );
    const orgs = drafts.filter((d) => d.entityType === 'ORGANIZATION').map((d) => d.text);
    expect(orgs).toContain('Meridian Trading LLP');
    expect(orgs.some((t) => t.startsWith('Northstar Logistics'))).toBe(true);
  });

  it('does NOT fabricate ORGANIZATION from headings like "Central Bank" (PART 8 negative)', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('Funds moved via Central Bank to the Police Station.'),
    );
    expect(drafts.filter((d) => d.entityType === 'ORGANIZATION')).toHaveLength(0);
  });

  it('classifies ledger/reference identifiers as ACCOUNT (PART 9)', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('Ledger refs ORX-102, MT-883, BDL-210, NW-009, MT-SET-119 and AX-4471.'),
    );
    const accounts = drafts.filter((d) => d.entityType === 'ACCOUNT').map((d) => d.text);
    for (const id of ['ORX-102', 'MT-883', 'BDL-210', 'NW-009', 'MT-SET-119', 'AX-4471']) {
      expect(accounts).toContain(id);
    }
  });

  it('classifies a labelled invoice number as ACCOUNT (PART 9)', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('Payment against Invoice 7842 was recorded.'),
    );
    const accounts = drafts.filter((d) => d.entityType === 'ACCOUNT').map((d) => d.text);
    expect(accounts.some((t) => t.includes('Invoice 7842'))).toBe(true);
  });

  it('types a subject-verb person via the after-window cue (PART 7)', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('Neha Kapoor communicated with the vendor on Monday.'),
    );
    const person = drafts.find((d) => d.entityType === 'PERSON');
    expect(person?.text).toBe('Neha Kapoor');
  });

  it('never types a pronoun as PERSON via the after-window cue (PART 7 negative)', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('They met at the warehouse and waited.'),
    );
    expect(drafts.filter((d) => d.entityType === 'PERSON')).toHaveLength(0);
  });

  it('a typed ORGANIZATION span wins over shorter capitalization guesses', async () => {
    const { drafts } = await extractEntityMentions(
      makeObservation('Meridian Trading LLP paid the vendor.'),
    );
    const org = drafts.find((d) => d.entityType === 'ORGANIZATION');
    expect(org?.text).toBe('Meridian Trading LLP');
  });

  it('is deterministic and idempotent across repeat extraction', async () => {
    const content =
      'Neha Kapoor coordinates Meridian Trading LLP. Ref ORX-102 dated 2026-08-12.';
    const a = await extractEntityMentions(makeObservation(content));
    const b = await extractEntityMentions(makeObservation(content));
    expect(a.drafts).toEqual(b.drafts);
  });
});

