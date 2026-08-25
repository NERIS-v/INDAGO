import { describe, it, expect } from 'vitest';
import { classifyArtifact } from '../../src/classification/artifact-classifier.js';
import { createDefaultParserRegistry } from '../../src/parser/builtins/index.js';
import { selectParser } from '../../src/parser/parser-router.js';
import type { VerifiedArtifact } from '../../src/acquisition/types.js';

// ============================================================================
// M-PR2 Integration Tests
//
// Verifies the full classify → registry → route pipeline end-to-end.
// Tests deterministic routing from VerifiedArtifact to ParserRoute.
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

describe('M-PR2 Integration: Classify → Registry → Route', () => {
  const registry = createDefaultParserRegistry();

  it('PDF: full pipeline from VerifiedArtifact to ParserRoute', () => {
    const artifact = createVerifiedArtifact({ detectedMimeType: 'application/pdf' });
    const classification = classifyArtifact(artifact);
    const route = selectParser(classification, registry);

    expect(route.ok).toBe(true);
    if (route.ok) {
      expect(route.route.parserId).toBe('pdf-parser');
      expect(route.route.format).toBe('PDF');
      expect(route.route.family).toBe('DOCUMENT');
      expect(route.route.encoding).toBe('BINARY');
      expect(route.route.confidence).toBe('definite');
    }
  });

  it('DOCX: full pipeline', () => {
    const artifact = createVerifiedArtifact({
      detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const classification = classifyArtifact(artifact);
    const route = selectParser(classification, registry);

    expect(route.ok).toBe(true);
    if (route.ok) {
      expect(route.route.parserId).toBe('docx-parser');
    }
  });

  it('CSV: full pipeline', () => {
    const artifact = createVerifiedArtifact({ detectedMimeType: 'text/csv' });
    const classification = classifyArtifact(artifact);
    const route = selectParser(classification, registry);

    expect(route.ok).toBe(true);
    if (route.ok) {
      expect(route.route.parserId).toBe('csv-parser');
    }
  });

  it('JSON: full pipeline', () => {
    const artifact = createVerifiedArtifact({ detectedMimeType: 'application/json' });
    const classification = classifyArtifact(artifact);
    const route = selectParser(classification, registry);

    expect(route.ok).toBe(true);
    if (route.ok) {
      expect(route.route.parserId).toBe('json-parser');
    }
  });

  it('TXT: full pipeline', () => {
    const artifact = createVerifiedArtifact({ detectedMimeType: 'text/plain' });
    const classification = classifyArtifact(artifact);
    const route = selectParser(classification, registry);

    expect(route.ok).toBe(true);
    if (route.ok) {
      expect(route.route.parserId).toBe('txt-parser');
    }
  });

  it('UNKNOWN format: full pipeline returns UNSUPPORTED_FORMAT', () => {
    const artifact = createVerifiedArtifact({
      detectedMimeType: 'application/octet-stream',
      originalFilename: undefined,
    });
    const classification = classifyArtifact(artifact);
    const route = selectParser(classification, registry);

    expect(route.ok).toBe(false);
    if (!route.ok) {
      expect(route.error.category).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('pipeline is deterministic — same artifact always routes to same parser', () => {
    const artifact = createVerifiedArtifact();
    const c1 = classifyArtifact(artifact);
    const c2 = classifyArtifact(artifact);
    const r1 = selectParser(c1, registry);
    const r2 = selectParser(c2, registry);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.route.parserId).toBe(r2.route.parserId);
      expect(r1.route.reason).toBe(r2.route.reason);
    }
  });

  it('pipeline works with extension fallback for unknown MIME', () => {
    const artifact = createVerifiedArtifact({
      detectedMimeType: 'application/octet-stream',
      originalFilename: 'data.xlsx',
    });
    const classification = classifyArtifact(artifact);
    const route = selectParser(classification, registry);

    expect(route.ok).toBe(true);
    if (route.ok) {
      expect(route.route.parserId).toBe('xlsx-parser');
      expect(route.route.format).toBe('XLSX');
    }
  });

  it('pipeline preserves all metadata through the full chain', () => {
    const artifact = createVerifiedArtifact({
      artifactId: 'test-meta-id',
      contentHash: 'test-hash-value',
    });
    const classification = classifyArtifact(artifact);
    const route = selectParser(classification, registry);

    expect(route.ok).toBe(true);
    if (route.ok) {
      expect(route.route.artifactId).toBe('test-meta-id');
      expect(route.route.contentHash).toBe('test-hash-value');
      expect(route.route.format).toBe(classification.format);
      expect(route.route.family).toBe(classification.family);
      expect(route.route.encoding).toBe(classification.encoding);
    }
  });
});
