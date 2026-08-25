import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryArtifactStorage } from '../src/storage/artifact-storage.js';

// ============================================================================
// Storage Tests
//
// Verifies the ArtifactStorage contract through InMemoryArtifactStorage.
// ============================================================================

describe('ArtifactStorage', () => {
  let storage: InMemoryArtifactStorage;

  beforeEach(() => {
    storage = new InMemoryArtifactStorage();
  });

  it('write stores content and returns storage path', async () => {
    const content = new TextEncoder().encode('hello world');
    const result = await storage.write({
      content,
      mimeType: 'text/plain',
      hash: 'abc123',
    });

    expect(result.storagePath).toBe('mem://abc123');
    expect(result.sizeBytes).toBe(11);
  });

  it('read retrieves stored content', async () => {
    const content = new TextEncoder().encode('test data');
    await storage.write({ content, mimeType: 'text/plain', hash: 'h1' });

    const retrieved = await storage.read('mem://h1');
    expect(new TextDecoder().decode(retrieved)).toBe('test data');
  });

  it('read throws for non-existent path', async () => {
    await expect(storage.read('mem://nonexistent')).rejects.toThrow('Artifact not found');
  });

  it('exists returns true for stored content', async () => {
    const content = new TextEncoder().encode('exists');
    await storage.write({ content, mimeType: 'text/plain', hash: 'h2' });

    expect(await storage.exists('mem://h2')).toBe(true);
    expect(await storage.exists('mem://nope')).toBe(false);
  });

  it('deterministic hashing produces same path for same content', async () => {
    const content = new TextEncoder().encode('same content');
    const r1 = await storage.write({ content, mimeType: 'text/plain', hash: 'same-hash' });
    const r2 = await storage.write({ content, mimeType: 'text/plain', hash: 'same-hash' });

    expect(r1.storagePath).toBe(r2.storagePath);
  });

  it('handles empty content', async () => {
    const content = new Uint8Array(0);
    const result = await storage.write({ content, mimeType: 'application/octet-stream', hash: 'empty' });

    expect(result.sizeBytes).toBe(0);
    const retrieved = await storage.read('mem://empty');
    expect(retrieved.byteLength).toBe(0);
  });

  it('handles large content', async () => {
    const content = new Uint8Array(1024 * 1024); // 1 MB
    content.fill(42);
    const result = await storage.write({ content, mimeType: 'application/octet-stream', hash: 'large' });

    expect(result.sizeBytes).toBe(1024 * 1024);
    const retrieved = await storage.read('mem://large');
    expect(retrieved.byteLength).toBe(1024 * 1024);
    expect(retrieved[0]).toBe(42);
  });

  it('handles binary content', async () => {
    const content = new Uint8Array([0x00, 0xFF, 0x80, 0x7F, 0x01]);
    await storage.write({ content, mimeType: 'application/octet-stream', hash: 'binary' });

    const retrieved = await storage.read('mem://binary');
    expect(retrieved).toEqual(content);
  });
});
