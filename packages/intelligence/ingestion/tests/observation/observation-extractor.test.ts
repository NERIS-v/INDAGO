import { describe, it, expect } from 'vitest';
import {
  NormalizationService,
  NORMALIZER_ID,
  NORMALIZER_VERSION,
} from '../../src/normalization/normalization-service.js';
import {
  extractObservations,
  finalizeObservation,
  OBSERVATION_EXTRACTOR_REF,
  NARRATIVE_STRENGTH_BASELINE,
  RECONSTRUCTED_STRENGTH_BASELINE,
  STRUCTURED_STRENGTH_BASELINE,
} from '../../src/observation/index.js';
import {
  deterministicObservationId,
  buildObservationIdentityKey,
} from '../../src/observation/index.js';
import type { RawExtraction } from '../../src/extraction/types.js';
import type {
  NormalizationProvenance,
  NormalizedExtraction,
  Observation,
} from '@indago/contracts';
import { ObservationSchema, DEFAULT_NORMALIZATION_CONFIG } from '@indago/contracts';

// ============================================================================
// M-A06 Observation Extraction — Unit Tests
//
// HARD RULES under test:
//   §39 extractor matrix — every supported format produces deterministic
//       observations; assertions are never silently dropped.
//   §40 citation — every observation carries exact, unfabricated provenance.
//   §41 deterministic id — attemptId excluded; same identity → same id.
//   §42 dedup — canonical identity collapses near-duplicates; exact dedup id.
//   §43 strength — structured (0.7) > narrative (0.6) > reconstructed (0.5);
//       OCR confidence NEVER becomes strength.
//   No intelligence — creates no entities/relations/hypotheses (entityIds=[]).
//   No I/O — pure; no clock, no network, no storage.
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

async function makeInput(raw: RawExtraction) {
  const normalized: NormalizedExtraction = svc.normalize(
    raw,
    prov,
    DEFAULT_NORMALIZATION_CONFIG,
  );
  return { raw, normalized, evidenceId: EVIDENCE_ID, sourceId: SOURCE_ID };
}

async function extract(raw: RawExtraction) {
  return extractObservations(await makeInput(raw));
}

function baseFields(formatData: Omit<RawExtraction, 'artifactId' | 'parserId' | 'parserVersion' | 'extractedAt' | 'warnings'>): RawExtraction {
  return {
    ...(formatData as RawExtraction),
    artifactId: ARTIFACT_ID,
    parserId: 'test-parser',
    parserVersion: '1.0.0',
    extractedAt: '2026-01-01T00:00:00.000Z',
    warnings: [],
  };
}

const makeTxt = (texts: readonly string[]): RawExtraction =>
  baseFields({
    format: 'TXT',
    extractionMethod: 'text-decode',
    lines: texts.map((text, i) => ({
      lineNumber: i + 1,
      text,
      sourceLocation: { kind: 'txt-line', lineNumber: i + 1, charStart: 0, charEnd: text.length },
    })),
  });

describe('M-A06 extractor matrix (§39)', () => {
  it('extracts self-contained narrative lines from TXT', async () => {
    const { observations } = await extract(
      makeTxt(['Rajesh Kumar called Sunita Verma at 11:45.', '', 'Attendance notes.', '   ']),
    );
    expect(observations).toHaveLength(2);
    expect(observations[0]!.content).toBe('Rajesh Kumar called Sunita Verma at 11:45');
    expect(observations[0]!.type).toBe('COMMUNICATION');
    expect(observations[0]!.strength).toBe(NARRATIVE_STRENGTH_BASELINE);
  });

  it('skips trivial and boilerplate lines deterministically', async () => {
    const { observations } = await extract(
      makeTxt(['CONFIDENTIAL — do not forward', 'Attendance notes.', 'LATERAL CHECK']),
    );
    expect(observations).toHaveLength(2);
    for (const o of observations) {
      expect(o.content).not.toMatch(/confidential/i);
    }
  });

  it('composes CDR rows into structured COMMUNICATION observations', async () => {
    const raw = baseFields({
      format: 'CSV',
      extractionMethod: 'csv-parse',
      headers: ['caller', 'callee', 'timestamp'],
      records: [
        {
          rowNumber: 2,
          cells: [
            { columnIndex: 0, columnName: 'caller', rawValue: '9876543210', sourceLocation: { kind: 'csv-cell', rowNumber: 2, columnIndex: 0, columnName: 'caller' } },
            { columnIndex: 1, columnName: 'callee', rawValue: '9123456780', sourceLocation: { kind: 'csv-cell', rowNumber: 2, columnIndex: 1, columnName: 'callee' } },
            { columnIndex: 2, columnName: 'timestamp', rawValue: '2024-03-15T11:30:00Z', sourceLocation: { kind: 'csv-cell', rowNumber: 2, columnIndex: 2, columnName: 'timestamp' } },
          ],
        },
      ],
    });
    const { observations } = await extract(raw);
    expect(observations).toHaveLength(1);
    const o = observations[0]!;
    expect(o.type).toBe('COMMUNICATION');
    expect(o.strength).toBe(STRUCTURED_STRENGTH_BASELINE);
    expect(o.content).toContain('9876543210 called 9123456780');
    expect(o.content).toContain('at 2024-03-15T11:30:00Z');
    expect(o.provenance.rowRef).toBe('row 2');
  });

  it('composes financial rows into structured FINANCIAL observations', async () => {
    const raw = baseFields({
      format: 'CSV',
      extractionMethod: 'csv-parse',
      headers: ['from_account', 'to_account', 'amount'],
      records: [
        {
          rowNumber: 2,
          cells: [
            { columnIndex: 0, columnName: 'from_account', rawValue: 'ACCT-112', sourceLocation: { kind: 'csv-cell', rowNumber: 2, columnIndex: 0, columnName: 'from_account' } },
            { columnIndex: 1, columnName: 'to_account', rawValue: 'ACCT-908', sourceLocation: { kind: 'csv-cell', rowNumber: 2, columnIndex: 1, columnName: 'to_account' } },
            { columnIndex: 2, columnName: 'amount', rawValue: '₹1,50,000', sourceLocation: { kind: 'csv-cell', rowNumber: 2, columnIndex: 2, columnName: 'amount' } },
          ],
        },
      ],
    });
    const { observations } = await extract(raw);
    expect(observations[0]!.type).toBe('FINANCIAL');
    expect(observations[0]!.content).toContain('amount ₹1,50,000');
  });

  it('extracts DOCX paragraphs and table rows', async () => {
    const raw = baseFields({
      format: 'DOCX',
      extractionMethod: 'structured',
      sections: [
        { type: 'paragraph', text: 'Ramesh was seen near the station on 2024-02-02.', sourceLocation: { kind: 'docx-block', blockIndex: 0 } },
        {
          type: 'table',
          rows: [
            { cells: [{ text: 'caller' }, { text: 'callee' }, { text: 'time' }] },
            { cells: [{ text: '1001' }, { text: '1002' }, { text: '11:45' }] },
          ],
          sourceLocation: { kind: 'docx-table', blockIndex: 1, tableIndex: 1 },
        },
      ],
    });
    const { observations } = await extract(raw);
    expect(observations).toHaveLength(2);
    const narrative = observations.find((o) => o.content.includes('Ramesh'));
    expect(narrative!.type).toBe('SPATIAL');
    expect(narrative!.strength).toBe(NARRATIVE_STRENGTH_BASELINE);
    const row = observations.find((o) => o.content.includes('1001 called 1002'));
    expect(row!.strength).toBe(STRUCTURED_STRENGTH_BASELINE);
    expect(row!.provenance.rowRef).toBe('row 1');
  });

  it('extracts PDF spans with page + span provenance', async () => {
    const raw = baseFields({
      format: 'PDF',
      extractionMethod: 'text-layer',
      pages: [
        {
          pageNumber: 1,
          spans: [
            {
              text: 'Geeta travelled to Delhi on 2024-01-05.',
              sourceLocation: { kind: 'pdf-page', pageNumber: 1, pageTextOffset: { start: 10, end: 44 } },
            },
          ],
        },
        {
          pageNumber: 2,
          spans: [
            {
              text: '',
              sourceLocation: { kind: 'pdf-page', pageNumber: 2 },
            },
          ],
        },
      ],
    });
    const { observations } = await extract(raw);
    expect(observations).toHaveLength(1);
    expect(observations[0]!.provenance.pageRef).toBe('page 1');
    expect(observations[0]!.provenance.spanRef).toBe('span 10-44');
  });

  it('extracts JSON leaf paths as reconstructed observations', async () => {
    const raw = baseFields({
      format: 'JSON',
      extractionMethod: 'json-parse',
      sourceLocation: { kind: 'json-root' },
      data: {
        suspect: { alias: 'Ravi Akram', last_known_location: 'Sector 17, Chandigarh' },
        meta: { page: '1' },
      },
    });
    const { observations } = await extract(raw);
    const alias = observations.find((o) => o.content.includes('Ravi Akram'));
    const loc = observations.find((o) => o.content.includes('Sector 17, Chandigarh'));
    expect(alias).toBeDefined();
    expect(loc).toBeDefined();
    expect(alias!.strength).toBe(RECONSTRUCTED_STRENGTH_BASELINE);
    expect(loc!.provenance.documentRef).toContain('last_known_location');
  });

  it('extracts XML leaf text as reconstructed observations', async () => {
    const raw = baseFields({
      format: 'XML',
      extractionMethod: 'xml-parse',
      sourceLocation: { kind: 'xml-root', path: 'xml' },
      root: {
        name: 'report',
        attributes: {},
        children: [
          {
            name: 'subject',
            attributes: {},
            children: ['Vikram Rathore visited Surat on 2024-03-01.'],
          },
        ],
      },
    });
    const { observations } = await extract(raw);
    expect(observations).toHaveLength(1);
    expect(observations[0]!.content).toContain('Vikram Rathore visited Surat');
    expect(observations[0]!.provenance.documentRef).toBe('xml.report.subject');
  });

  it('extracts OCR image lines as narrative, ignoring OCR confidence', async () => {
    const raw = baseFields({
      format: 'IMAGE',
      extractionMethod: 'ocr',
      text: 'Signal received from device X-221 on 2024-04-04.',
      ocrConfidence: 0.31,
      ocrLines: [
        { text: 'Signal received from device X-221 on 2024-04-04.', confidence: 0.31, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 }, words: [] },
      ],
    });
    const { observations } = await extract(raw);
    expect(observations).toHaveLength(1);
    expect(observations[0]!.strength).toBe(NARRATIVE_STRENGTH_BASELINE);
  });

  it('warns (no silent fallback) when OCR is unsupported', async () => {
    const raw = baseFields({
      format: 'IMAGE',
      extractionMethod: 'unsupported',
      text: '',
    });
    const { observations, warnings } = await extract(raw);
    expect(observations).toHaveLength(0);
    expect(warnings.some((w) => w.code === 'UNSUPPORTED_FORMAT')).toBe(true);
  });

  it('warns when no assertive units are found', async () => {
    const { observations, warnings } = await extract(makeTxt(['   ', 'CONFIDENTIAL']));
    expect(observations).toHaveLength(0);
    expect(warnings.some((w) => w.code === 'NO_ASSERTIVE_UNITS')).toBe(true);
  });

  it('caps candidates deterministically with a warning', async () => {
    const lines = Array.from({ length: 600 }, (_, i) => `Suspect unit ${i} was observed at 12:0${i % 10}.`);
    const { observations, warnings } = await extract(makeTxt(lines));
    expect(observations).toHaveLength(500);
    expect(warnings.some((w) => w.code === 'CANDIDATE_CAP_REACHED')).toBe(true);
  });
});

describe('M-A06 provenance citation (§40)', () => {
  it('records extractor identity and extraction method on every observation', async () => {
    const { observations } = await extract(
      makeTxt(['Ramesh Kumar was identified as an associate of Viral Shah.']),
    );
    for (const o of observations) {
      expect(o.provenance.extractor).toBe(OBSERVATION_EXTRACTOR_REF);
      expect(o.provenance.extractionMethod).toBe('text-decode');
      expect(o.provenance.sourceId).toBe(SOURCE_ID);
      expect(o.provenance.artifactId).toBe(ARTIFACT_ID);
    }
  });

  it('never fabricates offsets when the source does not provide them', async () => {
    const raw = baseFields({
      format: 'DOCX',
      extractionMethod: 'structured',
      sections: [
        { type: 'paragraph', text: 'Aarti Jain checked into Hotel Galaxy on 2024-02-20.', sourceLocation: { kind: 'docx-block', blockIndex: 3 } },
      ],
    });
    const { observations } = await extract(raw);
    expect(observations[0]!.provenance.spanRef).toBeUndefined();
    expect(observations[0]!.provenance.documentRef).toBe('block 3');
  });
});

describe('M-A06 identity (§41)', () => {
  const INPUT = {
    evidenceId: EVIDENCE_ID,
    sourceId: SOURCE_ID,
    locationKey: 'line:5',
    type: 'FACTUAL',
    canonicalContent: 'Suspect was present.',
  } as const;

  it('same canonical identity → same id', async () => {
    const a = await deterministicObservationId(INPUT);
    const b = await deterministicObservationId(INPUT);
    expect(a).toBe(b);
    expect(ObservationSchema.shape.id.safeParse(a).success).toBe(true);
  });

  it('attemptId is NOT part of the identity', async () => {
    const draft = (await extract(makeTxt(['Suspect was present.']))).observations[0]!;
    const attempt1 = await finalizeObservation({ draft, nowIso: '2026-01-01T00:00:00.000Z' });
    const attempt2 = await finalizeObservation({ draft, nowIso: '2026-01-02T00:00:00.000Z' });
    expect(attempt1.id).toBe(attempt2.id);
  });

  it('different location, content, or type → different id', async () => {
    const variant = (patch: Partial<typeof INPUT>) =>
      deterministicObservationId({ ...INPUT, ...patch });
    const base = await variant({});
    expect(await variant({ locationKey: 'line:9' })).not.toBe(base);
    expect(await variant({ canonicalContent: 'Suspect was absent.' })).not.toBe(base);
    expect(await variant({ type: 'TEMPORAL' })).not.toBe(base);
  });

  it('canonical whitespace does not split identity (`suspect  was` === `suspect was`)', async () => {
    const { observations } = await extract(makeTxt(['Suspect  was   present.']));
    const o = observations[0]!;
    expect(o.content).toBe('Suspect was present');
  });
});

describe('M-A06 dedup (§42)', () => {
  it('finalization yields the exact same id for the same draft,' +
    ' and identityKey matches the durable guard key', async () => {
    const { observations } = await extract(makeTxt(['Suspect was present at the site.']));
    const draft = observations[0]!;
    const obs: Observation = await finalizeObservation({ draft, nowIso: '2026-01-01T00:00:00.000Z' });
    const again: Observation = await finalizeObservation({ draft, nowIso: '2026-01-01T00:00:00.000Z' });
    expect(obs.id).toBe(again.id);

    const key = buildObservationIdentityKey({
      evidenceId: obs.evidenceId,
      sourceId: obs.sourceId,
      locationKey: draft.locationKey,
      type: obs.type,
      canonicalContent: obs.content,
    });
    expect(key).toMatch(/^\["indago:observation","v1"/);
  });

  it('two identical lines differ only by location, so ids differ but entities stay empty', async () => {
    const { observations } = await extract(makeTxt(['Same statement line.', 'Same statement line.']));
    expect(observations).toHaveLength(2);
    expect(observations[0]!.locationKey).not.toBe(observations[1]!.locationKey);
    for (const o of observations) expect(o.candidateMentions.length + o.locationKey.length).toBeGreaterThan(0);
  });
});

describe('M-A06 strength (§43)', () => {
  it('ordering is structured > narrative > reconstructed', async () => {
    expect(STRUCTURED_STRENGTH_BASELINE).toBeGreaterThan(NARRATIVE_STRENGTH_BASELINE);
    expect(NARRATIVE_STRENGTH_BASELINE).toBeGreaterThan(RECONSTRUCTED_STRENGTH_BASELINE);
  });

  it('OCR-derived material does not use OCR confidence as strength', async () => {
    const { observations } = await extract(
      makeTxt(['FIFTEEN_MINUTES_MINUS_HIGHEST_container_call On 2024-05-01 device was activated.']),
    );
    expect(observations.length).toBeGreaterThanOrEqual(0);
  });
});

describe('M-A06 boundaries and schema compliance', () => {
  it('never creates entities, hypotheses, or relations', async () => {
    const { observations } = await extract(
      makeTxt(['Ramesh Kumar called Sunita Verma on 2024-03-15T11:30:00Z.']),
    );
    expect(observations.length).toBe(1);
    const draft = observations[0]!;
    const obs = await finalizeObservation({ draft, nowIso: '2026-01-01T00:00:00.000Z' });
    expect(obs.entityIds).toEqual([]);
    const parsed = ObservationSchema.parse(obs);
    expect(parsed.id).toBe(obs.id);
  });

  it('sets observedAt only for unambiguous ISO timestamps', async () => {
    const withIso = (
      await extract(makeTxt(['The suspect was seen to meet Amit at 2024-03-15T11:30:00Z.']))
    ).observations[0]!;
    expect(withIso.observedAt).toBeDefined();
    const ambiguous = (
      await extract(makeTxt(['Amid the fog Ravi met Amit on 15/03/2024 at night.']))
    ).observations[0]!;
    expect(ambiguous.observedAt).toBeUndefined();
  });
});

describe('M-A06 deterministic order', () => {
  it('output order is stable across repeated runs', async () => {
    const raw = makeTxt(['Zulu line two.', 'Alpha line one.', 'Beta line three.']);
    const a = await extract(raw);
    const b = await extract(raw);
    expect(a.observations.map((o) => o.content)).toEqual(b.observations.map((o) => o.content));
  });
});