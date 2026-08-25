// ============================================================================
// Artifact Storage
//
// Abstraction for storing and retrieving raw artifacts.
// MA01 defines the interface; concrete implementations (S3, local, etc.)
// are injected.
//
// The storage layer is deliberately simple:
//   - write: store raw bytes, return a storage path
//   - read: retrieve raw bytes from a storage path
//   - exists: check if a path is stored
//
// MA01 does NOT build the production object-storage subsystem.
// A deterministic in-memory implementation is provided for tests.
// ============================================================================

/**
 * Storage result for write operations.
 */
export interface StorageWriteResult {
  readonly storagePath: string;
  readonly sizeBytes: number;
}

/**
 * Abstract artifact storage interface.
 */
export interface ArtifactStorage {
  /**
   * Store raw content and return a deterministic storage reference.
   */
  write(params: {
    readonly content: Uint8Array;
    readonly mimeType: string;
    readonly hash: string;
    readonly filename?: string;
  }): Promise<StorageWriteResult>;

  /**
   * Read raw content from a storage path.
   */
  read(storagePath: string): Promise<Uint8Array>;

  /**
   * Check whether content exists at the given storage path.
   */
  exists(storagePath: string): Promise<boolean>;
}

/**
 * Deterministic in-memory storage for tests and development.
 * Content is addressed by hash — writing the same content twice
 * produces the same storage path.
 */
export class InMemoryArtifactStorage implements ArtifactStorage {
  private readonly store = new Map<string, Uint8Array>();

  async write(params: {
    readonly content: Uint8Array;
    readonly mimeType: string;
    readonly hash: string;
    readonly filename?: string;
  }): Promise<StorageWriteResult> {
    const storagePath = `mem://${params.hash}`;
    this.store.set(storagePath, params.content);
    return {
      storagePath,
      sizeBytes: params.content.byteLength,
    };
  }

  async read(storagePath: string): Promise<Uint8Array> {
    const content = this.store.get(storagePath);
    if (!content) {
      throw new Error(`Artifact not found: ${storagePath}`);
    }
    return content;
  }

  async exists(storagePath: string): Promise<boolean> {
    return this.store.has(storagePath);
  }
}
