import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  IngestionJobPayloadSchema,
  AuditActionSchema,
  ArtifactReferenceSchema,
} from '../src/index.js';

const VALID_INVESTIGATION_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_CASE_ID = '550e8400-e29b-41d4-a716-446655440010';
const VALID_CORRELATION_ID = '660e8400-e29b-41d4-a716-446655440001';
const VALID_OPERATION_ID = '770e8400-e29b-41d4-a716-446655440002';

const validReference = {
  url: 'https://utfs.io/f/abc123.pdf',
  originalFilename: 'bank-statement.pdf',
  declaredMimeType: 'application/pdf',
  declaredSizeBytes: 102400,
  sourceType: 'UPLOADTHING',
  providerMetadata: {
    uploadThingKey: 'abc123.pdf',
    uploadThingFileHash: 'md5hash',
  },
};

const validPayload = {
  investigationId: VALID_INVESTIGATION_ID,
  caseId: VALID_CASE_ID,
  artifactReference: validReference,
  idempotencyKey: createHash('sha256').update(`${VALID_INVESTIGATION_ID}:abc123.pdf`).digest('hex'),
  correlationId: VALID_CORRELATION_ID,
  operationId: VALID_OPERATION_ID,
  sourceName: 'CDR Export from Telecom A',
  sourceCatalog: 'CDR',
  evidenceType: 'COMMUNICATION',
  evidenceTitle: 'Call records for suspect phone number',
};

describe('AuditActionSchema: I-PR2 additions', () => {
  it('accepts EVIDENCE_UPLOADED', () => {
    expect(AuditActionSchema.safeParse('EVIDENCE_UPLOADED').success).toBe(true);
  });

  it('accepts EVIDENCE_QUEUED', () => {
    expect(AuditActionSchema.safeParse('EVIDENCE_QUEUED').success).toBe(true);
  });

  it('accepts INGESTION_JOB_QUEUED', () => {
    expect(AuditActionSchema.safeParse('INGESTION_JOB_QUEUED').success).toBe(true);
  });

  it('accepts INGESTION_JOB_FAILED', () => {
    expect(AuditActionSchema.safeParse('INGESTION_JOB_FAILED').success).toBe(true);
  });

  it('rejects invalid action', () => {
    expect(AuditActionSchema.safeParse('UPLOAD_FAILED').success).toBe(false);
  });
});

describe('IngestionJobPayloadSchema', () => {
  it('accepts valid payload', () => {
    const result = IngestionJobPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rejects missing investigationId', () => {
    const { investigationId: _, ...rest } = validPayload;
    const result = IngestionJobPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID investigationId', () => {
    const result = IngestionJobPayloadSchema.safeParse({
      ...validPayload,
      investigationId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing artifactReference', () => {
    const { artifactReference: _, ...rest } = validPayload;
    const result = IngestionJobPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects artifactReference with invalid URL', () => {
    const result = IngestionJobPayloadSchema.safeParse({
      ...validPayload,
      artifactReference: { ...validReference, url: 'not-a-url' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing idempotencyKey', () => {
    const { idempotencyKey: _, ...rest } = validPayload;
    const result = IngestionJobPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects empty idempotencyKey', () => {
    const result = IngestionJobPayloadSchema.safeParse({
      ...validPayload,
      idempotencyKey: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid correlationId', () => {
    const result = IngestionJobPayloadSchema.safeParse({
      ...validPayload,
      correlationId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields (strict)', () => {
    const result = IngestionJobPayloadSchema.safeParse({
      ...validPayload,
      hackerField: 'inject',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid sourceCatalog', () => {
    const result = IngestionJobPayloadSchema.safeParse({
      ...validPayload,
      sourceCatalog: 'NOT_A_CATALOG_VALUE',
    });
    expect(result.success).toBe(false);
  });

  it('accepts declaredSourceCatalog alongside valid sourceCatalog', () => {
    const result = IngestionJobPayloadSchema.safeParse({
      ...validPayload,
      declaredSourceCatalog: 'cdr',
    });
    expect(result.success).toBe(true);
  });

  it('JSON round-trip preserves all fields', () => {
    const parsed = IngestionJobPayloadSchema.parse(validPayload);
    const roundTripped = JSON.parse(JSON.stringify(parsed));
    expect(Object.keys(roundTripped).sort()).toEqual([
      'artifactReference',
      'caseId',
      'correlationId',
      'evidenceTitle',
      'evidenceType',
      'idempotencyKey',
      'investigationId',
      'operationId',
      'sourceCatalog',
      'sourceName',
    ]);
  });

  it('artifactReference validates correctly with all optional fields', () => {
    const result = ArtifactReferenceSchema.safeParse(validReference);
    expect(result.success).toBe(true);
  });

  it('artifactReference validates correctly with minimal fields', () => {
    const result = ArtifactReferenceSchema.safeParse({
      url: 'https://example.com/file.pdf',
    });
    expect(result.success).toBe(true);
  });

  it('artifactReference rejects extra fields (strict)', () => {
    const result = ArtifactReferenceSchema.safeParse({
      ...validReference,
      extraField: 'bad',
    });
    expect(result.success).toBe(false);
  });
});
