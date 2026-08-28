import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { FilesystemArtifactStorage } from '../../src/storage/filesystem-artifact-storage.js';

// ============================================================================
// FilesystemArtifactStorage Tests
//
// Durable, content-addressed artifact storage. Restart-safety is proven by
// constructing a NEW instance pointing at the same directory and reading
// the previously written path.
// ============================================================================

const TEST_DIRS: string[] = [];

function makeTempRoot(): string {
  const dir = path.join(os.tmpdir(), `indago-fs-storage-${randomUUID()}`);
  TEST_DIRS.push(dir);
  return dir;
}

describe('FilesystemArtifactStorage', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = makeTempRoot();
  });

  afterAll(async () => {
    for (const dir of TEST_DIRS) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('write stores content and returns a deterministic, content-addressed path', async () => {
    const storage = new FilesystemArtifactStorage(rootDir);
    const content = new TextEncoder().encode('hello world');
    const result = await storage.write({ content, mimeType: 'text/plain', hash: 'abc123def' });

    expect(result.storagePath).toContain(path.join('ab', 'abc123def'));
    expect(result.sizeBytes).toBe(11);
    expect(await storage.exists(result.storagePath)).toBe(true);
  });

  it('read retrieves stored content bytes', async () => {
    const storage = new FilesystemArtifactStorage(rootDir);
    const content = new TextEncoder().encode('durable bytes');
    const result = await storage.write({ content, mimeType: 'text/plain', hash: 'h1' });

    const retrieved = await storage.read(result.storagePath);
    expect(new TextDecoder().decode(retrieved)).toBe('durable bytes');
  });

  it('read throws a descriptive error for non-existent content', async () => {
    const storage = new FilesystemArtifactStorage(rootDir);
    const missing = path.join(rootDir, 'ab', 'missing-hash');
    await expect(storage.read(missing)).rejects.toThrow('Artifact not found');
  });

  it('exists returns false for content never written', async () => {
    const storage = new FilesystemArtifactStorage(rootDir);
    expect(await storage.exists(path.join(rootDir, 'zz', 'nope'))).toBe(false);
  });

  it('same content hash → same storage path (content addressing)', async () => {
    const storage = new FilesystemArtifactStorage(rootDir);
    const content = new TextEncoder().encode('same content');
    const r1 = await storage.write({ content, mimeType: 'text/plain', hash: 'same-hash' });
    const r2 = await storage.write({ content, mimeType: 'text/plain', hash: 'same-hash' });
    expect(r1.storagePath).toBe(r2.storagePath);
  });

  it('different content hash → different storage path', async () => {
    const storage = new FilesystemArtifactStorage(rootDir);
    const r1 = await storage.write({ content: new TextEncoder().encode('a'), mimeType: 'text/plain', hash: 'hash-a' });
    const r2 = await storage.write({ content: new TextEncoder().encode('b'), mimeType: 'text/plain', hash: 'hash-b' });
    expect(r1.storagePath).not.toBe(r2.storagePath);
  });

  it('a NEW instance on the same directory can read previously written content (restart-safe)', async () => {
    const first = new FilesystemArtifactStorage(rootDir);
    const content = new TextEncoder().encode('survives restart');
    const result = await first.write({ content, mimeType: 'text/plain', hash: 'restart-hash' });

    // Simulates process restart: a brand-new instance, same root.
    const second = new FilesystemArtifactStorage(rootDir);
    expect(await second.exists(result.storagePath)).toBe(true);
    const retrieved = await second.read(result.storagePath);
    expect(new TextDecoder().decode(retrieved)).toBe('survives restart');
  });

  it('writes binary content byte-exact', async () => {
    const storage = new FilesystemArtifactStorage(rootDir);
    const content = new Uint8Array([0x00, 0xff, 0x80, 0x7f, 0x01]);
    const result = await storage.write({ content, mimeType: 'application/octet-stream', hash: 'binary' });
    const retrieved = await storage.read(result.storagePath);
    expect(Array.from(retrieved)).toEqual([0x00, 0xff, 0x80, 0x7f, 0x01]);
  });
});