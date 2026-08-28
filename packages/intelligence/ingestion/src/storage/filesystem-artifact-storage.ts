// ============================================================================
// Filesystem Artifact Storage
//
// Durable content-addressed artifact storage on the local filesystem.
// This is the production implementation of the ArtifactStorage interface.
//
// Storage layout: {root}/{hash[0:2]}/{hash}
//   - Same hash → same storage path (deterministic, content-addressed)
//   - Restart-safe: bytes are durable on disk; a new instance can read
//     any path previously written by another instance on the same volume
//   - Multi-process safe: atomic writes via temp file + rename
//
// The storage path IS the fully resolved file path, so a persisted
// storagePath column can always be read back, even after a restart.
// ============================================================================

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ArtifactStorage, StorageWriteResult } from './artifact-storage.js';

export class FilesystemArtifactStorage implements ArtifactStorage {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  async write(params: {
    readonly content: Uint8Array;
    readonly mimeType: string;
    readonly hash: string;
    readonly filename?: string;
  }): Promise<StorageWriteResult> {
    const filePath = this.resolvePath(params.hash);
    if (!(await this.exists(filePath))) {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Atomic write: write to a temp file in the same directory, then rename.
      const tmpPath = path.join(dir, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
      await fs.writeFile(tmpPath, params.content);
      try {
        await fs.rename(tmpPath, filePath);
      } catch (err) {
        await fs.rm(tmpPath, { force: true }).catch(() => {});
        throw err;
      }
    }

    return {
      storagePath: filePath,
      sizeBytes: params.content.byteLength,
    };
  }

  async read(storagePath: string): Promise<Uint8Array> {
    try {
      return await fs.readFile(this.resolvePath(storagePath));
    } catch {
      throw new Error(`Artifact not found: ${storagePath}`);
    }
  }

  async exists(storagePath: string): Promise<boolean> {
    try {
      await fs.stat(this.resolvePath(storagePath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Content-addressed file path for a given content hash.
   * Also resolves a persisted storagePath (which is already a path).
   */
  private resolvePath(hashOrPath: string): string {
    if (path.isAbsolute(hashOrPath)) {
      return hashOrPath;
    }
    const shard = hashOrPath.slice(0, 2);
    return path.join(this.rootDir, shard, hashOrPath);
  }
}

export function isFilesystemStoragePath(storagePath: string): boolean {
  return storagePath !== 'mem:' && !storagePath.startsWith('mem://');
}