import { describe, it, expect } from 'vitest';
import { classifyArtifact } from '../../src/classification/artifact-classifier.js';
import type { VerifiedArtifact } from '../../src/acquisition/types.js';

// ============================================================================
// Artifact Classifier Tests
//
// Verifies deterministic classification with trust order:
//   1. M-PR1 detectedMimeType (magic bytes)
//   2. Content sniffing (JSON/XML structure)
//   3. Extension fallback
//   4. Unknown
// ============================================================================

function createVerifiedArtifact(overrides: Partial<VerifiedArtifact> = {}): VerifiedArtifact {
  return {
    artifactId: '550e8400-e29b-41d4-a716-446655440000',
    contentHash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    sourceUri: 'https://example.com/doc.pdf',
    detectedMimeType: 'application/pdf',
    sizeBytes: 1024,
    storedAt: '2026-01-01T00:00:00.000Z',
    originalFilename: 'document.pdf',
    ...overrides,
  };
}

describe('classifyArtifact', () => {
  it('classifies PDF from MIME type', () => {
    const artifact = createVerifiedArtifact({ detectedMimeType: 'application/pdf' });
    const result = classifyArtifact(artifact);
    expect(result.format).toBe('PDF');
    expect(result.family).toBe('DOCUMENT');
    expect(result.confidence).toBe('definite');
    expect(result.detectionMethod).toBe('mime-detection');
    expect(result.encoding).toBe('BINARY');
  });

  it('classifies DOCX from MIME type', () => {
    const artifact = createVerifiedArtifact({
      detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const result = classifyArtifact(artifact);
    expect(result.format).toBe('DOCX');
    expect(result.family).toBe('DOCUMENT');
    expect(result.confidence).toBe('definite');
  });

  it('classifies XLSX from MIME type', () => {
    const artifact = createVerifiedArtifact({
      detectedMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const result = classifyArtifact(artifact);
    expect(result.format).toBe('XLSX');
    expect(result.family).toBe('SPREADSHEET');
  });

  it('classifies CSV from MIME type', () => {
    const artifact = createVerifiedArtifact({ detectedMimeType: 'text/csv' });
    const result = classifyArtifact(artifact);
    expect(result.format).toBe('CSV');
    expect(result.family).toBe('STRUCTURED_DATA');
  });

  it('classifies JSON from MIME type', () => {
    const artifact = createVerifiedArtifact({ detectedMimeType: 'application/json' });
    const result = classifyArtifact(artifact);
    expect(result.format).toBe('JSON');
    expect(result.family).toBe('STRUCTURED_DATA');
  });

  it('classifies XML from MIME type', () => {
    const artifact = createVerifiedArtifact({ detectedMimeType: 'application/xml' });
    const result = classifyArtifact(artifact);
    expect(result.format).toBe('XML');
    expect(result.family).toBe('STRUCTURED_DATA');
  });

  it('classifies TXT from MIME type', () => {
    const artifact = createVerifiedArtifact({ detectedMimeType: 'text/plain' });
    const result = classifyArtifact(artifact);
    expect(result.format).toBe('TXT');
    expect(result.family).toBe('TEXT');
  });

  it('classifies IMAGE from MIME type', () => {
    const artifact = createVerifiedArtifact({ detectedMimeType: 'image/png' });
    const result = classifyArtifact(artifact);
    expect(result.format).toBe('IMAGE');
    expect(result.family).toBe('IMAGE');
    expect(result.encoding).toBe('BINARY');
  });

  it('classifies unknown MIME type to UNKNOWN with fallback confidence', () => {
    const artifact = createVerifiedArtifact({
      detectedMimeType: 'application/octet-stream',
      originalFilename: undefined,
    });
    const result = classifyArtifact(artifact);
    expect(result.format).toBe('UNKNOWN');
    expect(result.family).toBe('UNKNOWN');
    expect(result.confidence).toBe('fallback');
    expect(result.detectionMethod).toBe('unknown');
  });

  it('uses extension fallback when MIME is unknown', () => {
    const artifact = createVerifiedArtifact({
      detectedMimeType: 'application/octet-stream',
      originalFilename: 'report.xlsx',
    });
    const result = classifyArtifact(artifact);
    expect(result.format).toBe('XLSX');
    expect(result.family).toBe('SPREADSHEET');
    expect(result.confidence).toBe('heuristic');
    expect(result.detectionMethod).toBe('extension-fallback');
  });

  it('sniffs JSON structure from content bytes', () => {
    const artifact = createVerifiedArtifact({
      detectedMimeType: 'application/octet-stream',
    });
    const content = new TextEncoder().encode('{"key": "value", "nested": [1, 2, 3]}');
    const result = classifyArtifact(artifact, content);
    expect(result.format).toBe('JSON');
    expect(result.confidence).toBe('heuristic');
    expect(result.detectionMethod).toBe('content-sniffing');
  });

  it('sniffs XML structure from content bytes', () => {
    const artifact = createVerifiedArtifact({
      detectedMimeType: 'application/octet-stream',
    });
    const content = new TextEncoder().encode('<?xml version="1.0"?><root><item>test</item></root>');
    const result = classifyArtifact(artifact, content);
    expect(result.format).toBe('XML');
    expect(result.confidence).toBe('heuristic');
    expect(result.detectionMethod).toBe('content-sniffing');
  });

  it('sniffs CSV structure from content bytes', () => {
    const artifact = createVerifiedArtifact({
      detectedMimeType: 'text/plain',
    });
    const content = new TextEncoder().encode('name,age,city\nAlice,30,NYC\nBob,25,LA');
    const result = classifyArtifact(artifact, content);
    expect(result.format).toBe('CSV');
    expect(result.confidence).toBe('heuristic');
    expect(result.detectionMethod).toBe('content-sniffing');
  });

  it('preserves artifact metadata in classification', () => {
    const artifact = createVerifiedArtifact({
      artifactId: 'custom-id-123',
      contentHash: 'hash-abc',
      originalFilename: 'test.pdf',
    });
    const result = classifyArtifact(artifact);
    expect(result.artifactId).toBe('custom-id-123');
    expect(result.contentHash).toBe('hash-abc');
    expect(result.originalFilename).toBe('test.pdf');
    expect(result.detectedMimeType).toBe('application/pdf');
  });

  it('is deterministic — same artifact produces same classification', () => {
    const artifact = createVerifiedArtifact();
    const r1 = classifyArtifact(artifact);
    const r2 = classifyArtifact(artifact);
    expect(r1.format).toBe(r2.format);
    expect(r1.family).toBe(r2.family);
    expect(r1.encoding).toBe(r2.encoding);
    expect(r1.confidence).toBe(r2.confidence);
    expect(r1.detectionMethod).toBe(r2.detectionMethod);
  });

  it('detects text/plain as TXT without content', () => {
    const artifact = createVerifiedArtifact({ detectedMimeType: 'text/plain' });
    const result = classifyArtifact(artifact);
    expect(result.format).toBe('TXT');
    expect(result.confidence).toBe('definite');
  });

  it('classifies image/jpeg as IMAGE', () => {
    const artifact = createVerifiedArtifact({ detectedMimeType: 'image/jpeg' });
    const result = classifyArtifact(artifact);
    expect(result.format).toBe('IMAGE');
    expect(result.family).toBe('IMAGE');
    expect(result.encoding).toBe('BINARY');
  });

  it('classifies application/csv as CSV', () => {
    const artifact = createVerifiedArtifact({ detectedMimeType: 'application/csv' });
    const result = classifyArtifact(artifact);
    expect(result.format).toBe('CSV');
    expect(result.family).toBe('STRUCTURED_DATA');
  });

  it('text/plain with content that is not JSON/XML/CSV stays as TXT', () => {
    const artifact = createVerifiedArtifact({ detectedMimeType: 'text/plain' });
    const content = new TextEncoder().encode('Just plain text with no structure.');
    const result = classifyArtifact(artifact, content);
    expect(result.format).toBe('TXT');
  });
});
