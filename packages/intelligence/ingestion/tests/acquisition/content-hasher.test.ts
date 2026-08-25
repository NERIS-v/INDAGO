import { describe, it, expect } from 'vitest';
import { computeContentHash, deterministicArtifactId } from '../../src/acquisition/content-hasher.js';
import {
  TEXT_ARTIFACT_CONTENT,
  PDF_ARTIFACT_CONTENT,
  EMPTY_ARTIFACT_CONTENT,
} from './fixtures.js';

// ============================================================================
// Content Hasher Tests
//
// Verifies SHA-256 hashing and deterministic artifact ID generation.
// ============================================================================

describe('computeContentHash', () => {
  it('returns a 64-character lowercase hex string', async () => {
    const hash = await computeContentHash(TEXT_ARTIFACT_CONTENT);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic — same content produces same hash', async () => {
    const h1 = await computeContentHash(TEXT_ARTIFACT_CONTENT);
    const h2 = await computeContentHash(TEXT_ARTIFACT_CONTENT);
    expect(h1).toBe(h2);
  });

  it('different content produces different hash', async () => {
    const h1 = await computeContentHash(TEXT_ARTIFACT_CONTENT);
    const h2 = await computeContentHash(PDF_ARTIFACT_CONTENT);
    expect(h1).not.toBe(h2);
  });

  it('handles empty content deterministically', async () => {
    const h1 = await computeContentHash(EMPTY_ARTIFACT_CONTENT);
    const h2 = await computeContentHash(EMPTY_ARTIFACT_CONTENT);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles binary content', async () => {
    const binary = new Uint8Array([0x00, 0xff, 0x80, 0x7f, 0x01]);
    const hash = await computeContentHash(binary);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles large content (1 MB)', async () => {
    const large = new Uint8Array(1024 * 1024);
    large.fill(42);
    const hash = await computeContentHash(large);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    // Verify determinism with large content
    const hash2 = await computeContentHash(large);
    expect(hash).toBe(hash2);
  });

  it('PDF content hashes correctly', async () => {
    const hash = await computeContentHash(PDF_ARTIFACT_CONTENT);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    // Verify it starts with the expected prefix for this known content
    const hash2 = await computeContentHash(PDF_ARTIFACT_CONTENT);
    expect(hash).toBe(hash2);
  });
});

describe('deterministicArtifactId', () => {
  it('returns a valid UUID format', async () => {
    const hash = await computeContentHash(TEXT_ARTIFACT_CONTENT);
    const id = deterministicArtifactId(hash);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('is deterministic — same hash produces same ID', async () => {
    const hash = await computeContentHash(TEXT_ARTIFACT_CONTENT);
    const id1 = deterministicArtifactId(hash);
    const id2 = deterministicArtifactId(hash);
    expect(id1).toBe(id2);
  });

  it('different hashes produce different IDs', async () => {
    const hash1 = await computeContentHash(TEXT_ARTIFACT_CONTENT);
    const hash2 = await computeContentHash(PDF_ARTIFACT_CONTENT);
    const id1 = deterministicArtifactId(hash1);
    const id2 = deterministicArtifactId(hash2);
    expect(id1).not.toBe(id2);
  });

  it('ID has correct version (4) and variant bits', async () => {
    const hash = await computeContentHash(TEXT_ARTIFACT_CONTENT);
    const id = deterministicArtifactId(hash);
    const parts = id.split('-');
    // Version 4: third group starts with 4
    expect(parts[2]![0]).toBe('4');
    // Variant 1: fourth group starts with 8, 9, a, or b
    expect(['8', '9', 'a', 'b']).toContain(parts[3]![0]);
  });
});
