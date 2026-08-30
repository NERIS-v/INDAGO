import { describe, it, expect } from 'vitest';
import {
  ObservationSchema,
  ObservationTypeSchema,
  SourceCatalogSchema,
  DEFAULT_SOURCE_CATALOG,
  ObservationExtractedEventSchema,
  ObservationEventSchema,
  AuditActionSchema,
  EvidenceSubmissionRequestSchema,
} from '../src/index.js';
import { FIXTURE_OBSERVATION_1, FIXTURE_OBSERVATION_2, FIXTURE_OBSERVATION_3 } from '../fixtures/observations.js';
import { FIXTURE_IDS } from '../fixtures/ids.js';

// ============================================================================
// M-A06 Observation Contract Tests
//
// Verifies: candidateMentions contract, strictness, no-confidence guarantee,
// source catalog single source of truth, observation event payload, and
// audit additions.
// ============================================================================

describe('M-A06: candidateMentions', () => {
  it('all observation fixtures carry candidateMentions', () => {
    expect(Array.isArray(FIXTURE_OBSERVATION_1.candidateMentions)).toBe(true);
    expect(Array.isArray(FIXTURE_OBSERVATION_2.candidateMentions)).toBe(true);
    expect(Array.isArray(FIXTURE_OBSERVATION_3.candidateMentions)).toBe(true);
  });

  it('fixtures with candidateMentions validate against ObservationSchema', () => {
    expect(ObservationSchema.safeParse(FIXTURE_OBSERVATION_1).success).toBe(true);
    expect(ObservationSchema.safeParse(FIXTURE_OBSERVATION_2).success).toBe(true);
    expect(ObservationSchema.safeParse(FIXTURE_OBSERVATION_3).success).toBe(true);
  });

  it('missing candidateMentions is rejected (required field)', () => {
    const { candidateMentions: _candidateMentions, ...rest } = FIXTURE_OBSERVATION_1;
    const result = ObservationSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('empty candidateMentions is allowed', () => {
    const result = ObservationSchema.safeParse({
      ...FIXTURE_OBSERVATION_1,
      candidateMentions: [],
    });
    expect(result.success).toBe(true);
  });

  it('exceeding candidateMentions bound is rejected', () => {
    const result = ObservationSchema.safeParse({
      ...FIXTURE_OBSERVATION_1,
      candidateMentions: Array.from({ length: 51 }, (_x, i) => `mention-${i}`),
    });
    expect(result.success).toBe(false);
  });

  it('candidateMentions items are non-empty and bounded in length', () => {
    const longMention = ObservationSchema.safeParse({
      ...FIXTURE_OBSERVATION_1,
      candidateMentions: ['x'.repeat(201)],
    });
    expect(longMention.success).toBe(false);

    const emptyMention = ObservationSchema.safeParse({
      ...FIXTURE_OBSERVATION_1,
      candidateMentions: [''],
    });
    expect(emptyMention.success).toBe(false);
  });
});

describe('M-A06: Observation strictness & strength', () => {
  it('no confidence field on observations', () => {
    expect('confidence' in FIXTURE_OBSERVATION_1).toBe(false);
    expect('confidence' in FIXTURE_OBSERVATION_2).toBe(false);
    expect('confidence' in FIXTURE_OBSERVATION_3).toBe(false);
  });

  it('all fixture strengths are in [0,1]', () => {
    for (const fixture of [FIXTURE_OBSERVATION_1, FIXTURE_OBSERVATION_2, FIXTURE_OBSERVATION_3]) {
      expect(fixture.strength >= 0 && fixture.strength <= 1).toBe(true);
    }
  });

  it('rejects unknown keys on an Observation', () => {
    const result = ObservationSchema.safeParse({
      ...FIXTURE_OBSERVATION_1,
      hackerField: 'inject',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a nonsense observation type', () => {
    const result = ObservationTypeSchema.safeParse('NOT_A_TYPE');
    expect(result.success).toBe(false);
  });
});

describe('M-A06: Source catalog single source of truth', () => {
  it('catalog contains the locked values exactly', () => {
    expect(SourceCatalogSchema.options).toEqual([
      'FIR',
      'CDR',
      'FINANCIAL',
      'SURVEILLANCE',
      'SOCIAL',
      'INTEL',
      'MANUAL',
    ]);
  });

  it('default catalog is MANUAL', () => {
    expect(DEFAULT_SOURCE_CATALOG).toBe('MANUAL');
  });

  it('rejects values outside the fixed catalog', () => {
    expect(SourceCatalogSchema.safeParse('cement-cds').success).toBe(false);
    expect(SourceCatalogSchema.safeParse('cdr').success).toBe(false); // wrong casing
  });
});

describe('M-A06: OBSERVATION_EXTRACTED event (bounded payload)', () => {
  const validEvent = {
    eventId: FIXTURE_IDS.event1,
    version: 1,
    timestamp: { value: '2025-01-15T10:01:00Z', precision: 'exact' },
    investigationId: FIXTURE_IDS.investigation1,
    correlationId: FIXTURE_IDS.correlation1,
    operationId: FIXTURE_IDS.operation1,
    actor: 'SYSTEM',
    eventType: 'OBSERVATION_EXTRACTED',
    payload: {
      observationId: FIXTURE_IDS.observation1,
      evidenceId: FIXTURE_IDS.evidence1,
      sourceId: FIXTURE_IDS.source1,
      caseId: FIXTURE_IDS.case1,
      type: 'FINANCIAL',
      strength: 0.85,
      candidateMentionCount: 3,
    },
  };

  it('valid OBSERVATION_EXTRACTED event parses', () => {
    const result = ObservationExtractedEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it('discriminated union discriminates on eventType', () => {
    const result = ObservationEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eventType).toBe('OBSERVATION_EXTRACTED');
      expect(result.data.payload.type).toBe('FINANCIAL');
    }
  });

  it('payload intentionally excludes unbounded content', () => {
    expect('content' in validEvent.payload).toBe(false);
    expect('candidateMentions' in validEvent.payload).toBe(false);
  });

  it('rejects a foreign eventType', () => {
    const result = ObservationExtractedEventSchema.safeParse({
      ...validEvent,
      eventType: 'OBSERVATION_VALIDATED',
    });
    expect(result.success).toBe(false);
  });

  it('OBSERVATION_VALIDATED is NOT produced by the MA06 union', () => {
    const members = ObservationEventSchema.options.map((s) => s.shape.eventType._def.value as string);
    expect(members).toEqual(['OBSERVATION_EXTRACTED']);
  });

  it('rejects invalid strength outside [0,1]', () => {
    const result = ObservationExtractedEventSchema.safeParse({
      ...validEvent,
      payload: { ...validEvent.payload, strength: 1.5 },
    });
    expect(result.success).toBe(false);
  });
});

describe('M-A06: audit additions', () => {
  it('OBSERVATION_EXTRACTED is a valid audit action', () => {
    expect(AuditActionSchema.safeParse('OBSERVATION_EXTRACTED').success).toBe(true);
  });

  it('OBSERVATION_VALIDATED / OBSERVATION_CONTRADICTED are NOT audit actions', () => {
    expect(AuditActionSchema.safeParse('OBSERVATION_VALIDATED').success).toBe(false);
    expect(AuditActionSchema.safeParse('OBSERVATION_CONTRADICTED').success).toBe(false);
  });
});

describe('M-A06: evidence submission sourceCatalog (untrusted string)', () => {
  const validRequest = {
    investigationId: FIXTURE_IDS.investigation1,
    sourceName: 'CDR Export from Telecom A',
    evidenceType: 'COMMUNICATION',
    evidenceTitle: 'Call records for suspect phone number',
    files: [
      {
        fileKey: 'key1',
        fileUrl: 'https://utfs.io/f/abc123.pdf',
        fileName: 'cdr-export.csv',
        fileSize: 51200,
      },
    ],
  };

  it('accepts a valid catalog declaration', () => {
    const result = EvidenceSubmissionRequestSchema.safeParse({
      ...validRequest,
      sourceCatalog: 'CDR',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an unknown declaration (server-side decides, payload is untrusted)', () => {
    const result = EvidenceSubmissionRequestSchema.safeParse({
      ...validRequest,
      sourceCatalog: 'stale-frontend-value',
    });
    expect(result.success).toBe(true);
  });

  it('accepts the absence of a declaration', () => {
    const result = EvidenceSubmissionRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });
});