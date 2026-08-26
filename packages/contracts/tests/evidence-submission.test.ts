import { describe, it, expect } from 'vitest';
import {
  EvidenceSubmissionRequestSchema,
  UploadedFileReferenceSchema,
} from '../src/intelligence/evidence-submission.js';

// ============================================================================
// Evidence Submission Contract Tests
//
// I-PR2 boundary: validates that UI → platform and platform → BullMQ
// contracts are correct and reject malformed data.
// ============================================================================

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_URL = 'https://utfs.io/f/abc123-file.pdf';

// ============================================================================
// UploadedFileReferenceSchema
// ============================================================================

describe('UploadedFileReferenceSchema', () => {
  it('accepts valid uploaded file reference', () => {
    const result = UploadedFileReferenceSchema.safeParse({
      fileKey: 'abc123',
      fileUrl: VALID_URL,
      fileName: 'report.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
    });
    expect(result.success).toBe(true);
  });

  it('accepts without optional mimeType', () => {
    const result = UploadedFileReferenceSchema.safeParse({
      fileKey: 'abc123',
      fileUrl: VALID_URL,
      fileName: 'report.pdf',
      fileSize: 1024,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing fileKey', () => {
    const result = UploadedFileReferenceSchema.safeParse({
      fileUrl: VALID_URL,
      fileName: 'report.pdf',
      fileSize: 1024,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid URL', () => {
    const result = UploadedFileReferenceSchema.safeParse({
      fileKey: 'abc123',
      fileUrl: 'not-a-url',
      fileName: 'report.pdf',
      fileSize: 1024,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative fileSize', () => {
    const result = UploadedFileReferenceSchema.safeParse({
      fileKey: 'abc123',
      fileUrl: VALID_URL,
      fileName: 'report.pdf',
      fileSize: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty fileName', () => {
    const result = UploadedFileReferenceSchema.safeParse({
      fileKey: 'abc123',
      fileUrl: VALID_URL,
      fileName: '',
      fileSize: 1024,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// EvidenceSubmissionRequestSchema
// ============================================================================

describe('EvidenceSubmissionRequestSchema', () => {
  const validRequest = {
    investigationId: VALID_UUID,
    sourceName: 'CDR Export from Telecom A',
    evidenceType: 'COMMUNICATION',
    evidenceTitle: 'Call records for suspect phone number',
    files: [
      {
        fileKey: 'key1',
        fileUrl: VALID_URL,
        fileName: 'cdr-export.csv',
        fileSize: 51200,
        mimeType: 'text/csv',
      },
    ],
  };

  it('accepts valid minimal request', () => {
    const result = EvidenceSubmissionRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it('accepts with all optional fields', () => {
    const result = EvidenceSubmissionRequestSchema.safeParse({
      ...validRequest,
      sourceDescription: 'Exported from telecom provider database',
      evidenceDescription: 'CDR records for +91-XXXXXXXXXX',
      observedAt: { value: '2024-01-15', precision: 'day' },
      notes: 'Obtained via court order dated 2024-01-10',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing sourceName', () => {
    const result = EvidenceSubmissionRequestSchema.safeParse({
      ...validRequest,
      sourceName: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing evidenceTitle', () => {
    const result = EvidenceSubmissionRequestSchema.safeParse({
      ...validRequest,
      evidenceTitle: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid investigationId', () => {
    const result = EvidenceSubmissionRequestSchema.safeParse({
      ...validRequest,
      investigationId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid evidenceType', () => {
    const result = EvidenceSubmissionRequestSchema.safeParse({
      ...validRequest,
      evidenceType: 'INVALID_TYPE',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty files array', () => {
    const result = EvidenceSubmissionRequestSchema.safeParse({
      ...validRequest,
      files: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts multiple files', () => {
    const result = EvidenceSubmissionRequestSchema.safeParse({
      ...validRequest,
      files: [
        { fileKey: 'k1', fileUrl: VALID_URL, fileName: 'a.pdf', fileSize: 1000 },
        { fileKey: 'k2', fileUrl: VALID_URL, fileName: 'b.pdf', fileSize: 2000 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects notes exceeding max length', () => {
    const result = EvidenceSubmissionRequestSchema.safeParse({
      ...validRequest,
      notes: 'x'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });
});
