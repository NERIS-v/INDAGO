import { describe, it, expect } from 'vitest';
import {
  NormalizationService,
} from '../../src/normalization/normalization-service.js';
import {
  extractObservations,
  finalizeObservation,
} from '../../src/observation/index.js';
import { extractEntityMentions } from '../../src/entity-mention/index.js';
import type { RawExtraction } from '../../src/extraction/types.js';
import type {
  NormalizationProvenance,
  Observation,
} from '@indago/contracts';
import { DEFAULT_NORMALIZATION_CONFIG } from '@indago/contracts';
import {
  GOLDEN_DOCUMENTS,
  GOLDEN_BANNER,
  GOLDEN_IDENTITY_ROSTER,
  type GoldenDocument,
} from '../fixtures/operation-financial-shadow.js';

// ============================================================================
// PR-24 golden corpus (PART 15/16) — "Operation Financial Shadow"
//
// Runs the REAL deterministic MA06 → MA07 pipeline over the four evidence
// documents and asserts the forensic invariants the remediation must preserve:
//   • boilerplate is not an observation;
//   • short structured identifiers/amounts survive retention;
//   • ISO dates are DATE, never PHONE;
//   • minute-precision event time is preserved;
//   • mojibake is repaired at the semantic boundary only;
//   • persons / organizations / accounts are typed conservatively;
//   • output is deterministic and idempotent.
// ============================================================================

const LONG_UUID = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const ARTIFACT_ID = LONG_UUID(1);
const EVIDENCE_ID = LONG_UUID(10);
const SOURCE_ID = LONG_UUID(11);

const prov: NormalizationProvenance = {
  attemptId: LONG_UUID(2),
  investigationId: LONG_UUID(3),
  caseId: LONG_UUID(4),
};

const svc = new NormalizationService();

function makeTxt(texts: readonly string[]): RawExtraction {
  return {
    format: 'TXT',
    extractionMethod: 'text-decode',
    artifactId: ARTIFACT_ID,
    parserId: 'test-parser',
    parserVersion: '1.0.0',
    extractedAt: '2026-01-01T00:00:00.000Z',
    warnings: [],
    lines: texts.map((text, i) => ({
      lineNumber: i + 1,
      text,
      sourceLocation: {
        kind: 'txt-line',
        lineNumber: i + 1,
        charStart: 0,
        charEnd: text.length,
      },
    })),
  };
}

interface RunResult {
  readonly observations: readonly Observation[];
  readonly mentionTypes: readonly { text: string; entityType?: string }[];
}

async function runDocument(doc: GoldenDocument): Promise<RunResult> {
  const raw = makeTxt(doc.lines);
  const normalized = svc.normalize(raw, prov, DEFAULT_NORMALIZATION_CONFIG);
  const { observations } = await extractObservations({
    raw,
    normalized,
    evidenceId: EVIDENCE_ID,
    sourceId: SOURCE_ID,
  });

  // PR-31 (FIX 2): the case-scoped identity census is injected into M-A07 the
  // same way the platform does from the payload identityRoster — as gazetteer
  // entries. No roster is ever hardcoded into the engine.
  const rosterEntries = GOLDEN_IDENTITY_ROSTER.map((entry) => ({
    token: entry.text,
    entityType: entry.entityType,
  }));

  const finalized: Observation[] = [];
  const mentionTypes: { text: string; entityType?: string }[] = [];
  for (const draft of observations) {
    const obs = await finalizeObservation({ draft, nowIso: '2026-01-01T00:00:00.000Z' });
    finalized.push(obs);
    const { drafts } = await extractEntityMentions(obs, { gazetteerEntries: rosterEntries });
    for (const d of drafts) mentionTypes.push({ text: d.text, entityType: d.entityType });
  }
  return { observations: finalized, mentionTypes };
}

describe('PR-24 golden corpus — observation retention and hygiene (PART 1/3/4/5)', () => {
  it('retains exactly the expected assertive observations per document', async () => {
    let total = 0;
    for (const doc of GOLDEN_DOCUMENTS) {
      const { observations } = await runDocument(doc);
      expect(observations.length, doc.key).toBe(doc.expectedObservationCount);
      total += observations.length;
    }
    expect(total).toBe(90);
  }, 30000);

  it('never emits the synthetic-test-evidence banner as an observation', async () => {
    for (const doc of GOLDEN_DOCUMENTS) {
      const { observations } = await runDocument(doc);
      for (const o of observations) {
        expect(o.content).not.toContain('SYNTHETIC TEST EVIDENCE');
        expect(o.content).not.toContain('FICTIONAL DATA');
      }
    }
  }, 30000);

  it('retains the short structured identifiers and amounts that were dropped', async () => {
    const bank = GOLDEN_DOCUMENTS.find((d) => d.key === 'bank')!;
    const { observations } = await runDocument(bank);
    const all = observations.map((o) => o.content).join('\n');
    for (const token of [
      'ORX-102',
      'MT-883',
      'BDL-210',
      'NW-009',
      'MT-SET-119',
      'Invoice 7842',
    ]) {
      expect(all, token).toContain(token);
    }
    expect(all).toContain('615,000');
    expect(all).toContain('598,000');
  }, 30000);

  it('preserves minute-precision event time for the invoice meeting', async () => {
    const invoice = GOLDEN_DOCUMENTS.find((d) => d.key === 'invoice')!;
    const { observations } = await runDocument(invoice);
    const meeting = observations.find((o) => o.content.includes('at 08:30'));
    expect(meeting).toBeDefined();
    expect(meeting!.observedAt).toEqual({ value: '2026-08-12T08:30', precision: 'minute' });
  }, 30000);

  it('repairs mojibake at the canonical boundary and never leaks it downstream', async () => {
    const bank = GOLDEN_DOCUMENTS.find((d) => d.key === 'bank')!;
    const { observations } = await runDocument(bank);
    const all = observations.map((o) => o.content).join('\n');
    expect(all).toContain('\u2192'); // →
    expect(all).not.toContain('\u0393\u00E5\u00C6');
    expect(all).not.toContain('\u0393\u00C7');
  }, 30000);

  it('is deterministic and idempotent across repeated runs (PART 14)', async () => {
    const doc = GOLDEN_DOCUMENTS[0]!;
    const a = await runDocument(doc);
    const b = await runDocument(doc);
    expect(a.observations.map((o) => o.id)).toEqual(b.observations.map((o) => o.id));
    expect(a.observations.map((o) => o.content)).toEqual(b.observations.map((o) => o.content));
    expect(a.mentionTypes).toEqual(b.mentionTypes);
  }, 30000);
});

describe('PR-24 golden corpus — entity mention typing (PART 6/7/8/9/15)', () => {
  it('types ISO dates as DATE and never as PHONE', async () => {
    const mentionTypes: { text: string; entityType?: string }[] = [];
    for (const doc of GOLDEN_DOCUMENTS) {
      mentionTypes.push(...(await runDocument(doc)).mentionTypes);
    }
    expect(mentionTypes.filter((m) => m.entityType === 'DATE').length).toBeGreaterThan(0);
    const phones = mentionTypes.filter((m) => m.entityType === 'PHONE');
    expect(phones).toHaveLength(0);
    for (const d of mentionTypes.filter((m) => m.entityType === 'DATE')) {
      expect(d.text).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  }, 30000);

  it('types the ledger/reference identifiers as ACCOUNT', async () => {
    const bank = GOLDEN_DOCUMENTS.find((d) => d.key === 'bank')!;
    const { mentionTypes } = await runDocument(bank);
    const accounts = mentionTypes.filter((m) => m.entityType === 'ACCOUNT').map((m) => m.text);
    for (const id of ['ORX-102', 'MT-883', 'BDL-210', 'NW-009', 'MT-SET-119', 'AX-4471']) {
      expect(accounts, id).toContain(id);
    }
  }, 30000);

  it('types the companies as ORGANIZATION (including suffix-free logistics names)', async () => {
    const orgs = new Set<string>();
    for (const doc of GOLDEN_DOCUMENTS) {
      const { mentionTypes } = await runDocument(doc);
      for (const m of mentionTypes) {
        if (m.entityType === 'ORGANIZATION') orgs.add(m.text);
      }
    }
    expect(orgs.has('Orion Exports Pvt. Ltd')).toBe(true);
    expect(orgs.has('Meridian Trading LLP')).toBe(true);
    expect(orgs.has('Blue Dusk Logistics')).toBe(true);
    expect(orgs.has('Northstar Warehousing')).toBe(true);
  }, 60000);

  it('types the three principals as PERSON at least once across the corpus', async () => {
    const people = new Set<string>();
    for (const doc of GOLDEN_DOCUMENTS) {
      const { mentionTypes } = await runDocument(doc);
      for (const m of mentionTypes) {
        if (m.entityType === 'PERSON') people.add(m.text);
      }
    }
    expect(people.has('Arjun Mehta')).toBe(true);
    expect(people.has('Neha Kapoor')).toBe(true);
    expect(people.has('Rohan Singh')).toBe(true);
  }, 60000);
});
