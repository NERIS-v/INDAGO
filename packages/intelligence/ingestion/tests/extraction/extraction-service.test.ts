import { describe, it, expect } from 'vitest';
import { ExtractionService } from '../../src/extraction/extraction-service.js';
import { InMemoryArtifactStorage } from '../../src/storage/artifact-storage.js';
import { createDefaultParserRegistry } from '../../src/parser/builtins/index.js';
import { createVerifiedArtifact } from './fixtures.js';
import type { ArtifactClassification } from '../../src/classification/types.js';

// ============================================================================
// M-PR3 ExtractionService Tests
//
// Tests the orchestration layer: Storage Read → Classify → Route → Parse.
// Verifies error handling at each stage.
// ============================================================================

describe('ExtractionService', () => {
  const storage = new InMemoryArtifactStorage();
  const registry = createDefaultParserRegistry();
  const service = new ExtractionService(storage, registry);

  async function storeArtifact(
    content: Uint8Array,
    mime: string,
  ) {
    const hash = 'abc123def456abc123def456abc123def456abc123def456abc123def456abc01';
    const result = await storage.write({ content, mimeType: mime, hash });
    return { storagePath: result.storagePath, contentHash: hash };
  }

  it('extracts text from a stored TXT artifact', async () => {
    const content = new TextEncoder().encode('Hello, INDAGO!\nSecond line.');
    const { storagePath, contentHash } = await storeArtifact(content, 'text/plain');

    const artifact = createVerifiedArtifact({
      artifactId: 'test-txt',
      storagePath,
      contentHash,
      detectedMimeType: 'text/plain',
      contentSizeBytes: content.byteLength,
    });

    const result = await service.extract(artifact);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.extraction.format).toBe('TXT');
    expect(result.extraction.parserId).toBe('txt-parser');
    expect(result.extraction.artifactId).toBe('test-txt');
  });

  it('extracts from JSON artifact', async () => {
    const data = { key: 'value', nested: { a: 1 } };
    const content = new TextEncoder().encode(JSON.stringify(data));
    const { storagePath, contentHash } = await storeArtifact(content, 'application/json');

    const artifact = createVerifiedArtifact({
      artifactId: 'test-json',
      storagePath,
      contentHash,
      detectedMimeType: 'application/json',
      contentSizeBytes: content.byteLength,
    });

    const result = await service.extract(artifact);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.format).toBe('JSON');
    expect(result.extraction.data).toEqual(data);
  });

  it('returns error for storage read failure', async () => {
    const artifact = createVerifiedArtifact({
      artifactId: 'test-missing',
      storagePath: 'mem://nonexistent-hash',
      contentHash: 'deadbeef00000000000000000000000000000000000000000000000000000000',
    });

    const result = await service.extract(artifact);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.category).toBe('EXTRACTION_FAILED');
    expect(result.error.code).toBe('STORAGE_READ_FAILED');
  });

  it('uses provided content to skip storage read', async () => {
    const content = new TextEncoder().encode('Provided directly');
    const artifact = createVerifiedArtifact({
      artifactId: 'test-bypass',
      detectedMimeType: 'text/plain',
    });

    const result = await service.extract(artifact, { content });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.format).toBe('TXT');
  });

  it('uses provided classification to skip re-classification', async () => {
    const content = new TextEncoder().encode('{"a":1}');
    const { storagePath, contentHash } = await storeArtifact(content, 'application/json');

    const artifact = createVerifiedArtifact({
      artifactId: 'test-classification-override',
      storagePath,
      contentHash,
      detectedMimeType: 'application/json',
      contentSizeBytes: content.byteLength,
    });

    const classification: ArtifactClassification = {
      artifactId: 'test-classification-override',
      contentHash,
      detectedMimeType: 'application/json',
      format: 'JSON',
      family: 'STRUCTURED_DATA',
      encoding: 'UTF8',
      confidence: 'definite',
      detectionMethod: 'mime-detection',
      originalFilename: undefined,
    };

    const result = await service.extract(artifact, { classification });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.format).toBe('JSON');
  });

  it('returns MALFORMED_ARTIFACT for invalid JSON', async () => {
    const content = new TextEncoder().encode('{ broken json }}}');
    const { storagePath, contentHash } = await storeArtifact(content, 'application/json');

    const artifact = createVerifiedArtifact({
      artifactId: 'test-invalid-json',
      storagePath,
      contentHash,
      detectedMimeType: 'application/json',
      contentSizeBytes: content.byteLength,
    });

    const result = await service.extract(artifact);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.category).toBe('MALFORMED_ARTIFACT');
  });

  it('returns UNSUPPORTED_FORMAT for unknown format', async () => {
    const content = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const { storagePath, contentHash } = await storeArtifact(content, 'application/octet-stream');

    const artifact = createVerifiedArtifact({
      artifactId: 'test-unknown',
      storagePath,
      contentHash,
      detectedMimeType: 'application/octet-stream',
      contentSizeBytes: content.byteLength,
    });

    const result = await service.extract(artifact);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.category).toBe('UNSUPPORTED_FORMAT');
  });

  it('returns error for XLSX (stub)', async () => {
    const content = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const { storagePath, contentHash } = await storeArtifact(content, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const artifact = createVerifiedArtifact({
      artifactId: 'test-xlsx',
      storagePath,
      contentHash,
      detectedMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentSizeBytes: content.byteLength,
    });

    const result = await service.extract(artifact);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.category).toBe('EXTRACTION_FAILED');
    expect(result.error.code).toBe('XLSX_NOT_IMPLEMENTED');
  });

  it('does NOT create observations or entities', async () => {
    const content = new TextEncoder().encode('test');
    const { storagePath, contentHash } = await storeArtifact(content, 'text/plain');

    const artifact = createVerifiedArtifact({
      artifactId: 'test-no-obs',
      storagePath,
      contentHash,
      detectedMimeType: 'text/plain',
      contentSizeBytes: content.byteLength,
    });

    const result = await service.extract(artifact);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ext = result.extraction as Record<string, unknown>;
    expect(ext.observations).toBeUndefined();
    expect(ext.entities).toBeUndefined();
    expect(ext.entityHypotheses).toBeUndefined();
    expect(ext.relationHypotheses).toBeUndefined();
    expect(ext.graphNodes).toBeUndefined();
    expect(ext.graphEdges).toBeUndefined();
  });

  it('preserves artifactId and contentHash in extraction', async () => {
    const content = new TextEncoder().encode('test provenance');
    const { storagePath, contentHash } = await storeArtifact(content, 'text/plain');

    const artifact = createVerifiedArtifact({
      artifactId: 'test-provenance',
      storagePath,
      contentHash,
      detectedMimeType: 'text/plain',
      contentSizeBytes: content.byteLength,
    });

    const result = await service.extract(artifact);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.artifactId).toBe('test-provenance');
    expect(result.extraction.parserId).toBeDefined();
    expect(result.extraction.parserVersion).toBeDefined();
    expect(result.extraction.extractedAt).toBeDefined();
  });
});
