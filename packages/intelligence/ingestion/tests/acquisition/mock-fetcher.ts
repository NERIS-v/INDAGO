import type { ArtifactReference } from '@indago/contracts';
import type {
  ArtifactFetcher,
  FetchOptions,
  FetchedArtifact,
} from '../../src/acquisition/artifact-fetcher.js';
import {
  FetchFailedError,
  FetchTimeoutError,
  ArtifactTooLargeError,
} from '../../src/acquisition/artifact-fetcher.js';

// ============================================================================
// Mock Artifact Fetcher
//
// Deterministic test double for ArtifactFetcher.
// Allows fine-grained control over response behavior.
// ============================================================================

export interface MockFetcherConfig {
  /** Bytes to return as body */
  readonly body?: Uint8Array;
  /** HTTP status code (default: 200) */
  readonly status?: number;
  /** Content-Type header value */
  readonly contentType?: string;
  /** Content-Length header value (if different from body length) */
  readonly contentLength?: number;
  /** Throw a network error */
  readonly networkError?: boolean;
  /** Throw a timeout error */
  readonly timeoutError?: boolean;
}

export class MockArtifactFetcher implements ArtifactFetcher {
  private readonly config: MockFetcherConfig;
  public readonly fetchCalls: Array<{
    reference: ArtifactReference;
    options: FetchOptions;
  }> = [];

  constructor(config: MockFetcherConfig = {}) {
    this.config = config;
  }

  async fetch(
    reference: ArtifactReference,
    options: FetchOptions,
  ): Promise<FetchedArtifact> {
    this.fetchCalls.push({ reference, options });

    if (this.config.networkError) {
      throw new FetchFailedError('Network error');
    }

    if (this.config.timeoutError) {
      throw new FetchTimeoutError('Request timed out');
    }

    const body = this.config.body ?? new Uint8Array(0);
    const status = this.config.status ?? 200;

    // Simulate oversized response for size enforcement tests
    if (body.byteLength > options.maxBytes) {
      throw new ArtifactTooLargeError(
        `Content ${body.byteLength} exceeds max ${options.maxBytes}`,
        options.maxBytes,
        body.byteLength,
      );
    }

    return {
      status,
      contentType: this.config.contentType,
      contentLength: this.config.contentLength ?? body.byteLength,
      body,
    };
  }
}

/**
 * Create a mock fetcher that returns a body larger than maxBytes
 * during streaming (after Content-Length check passes).
 *
 * This simulates the case where Content-Length is absent or lying.
 */
export class StreamingOversizedFetcher implements ArtifactFetcher {
  private readonly realBody: Uint8Array;
  private readonly chunkSize: number;
  public readonly fetchCalls: Array<{
    reference: ArtifactReference;
    options: FetchOptions;
  }> = [];

  constructor(config: { body: Uint8Array; chunkSize?: number }) {
    this.realBody = config.body;
    this.chunkSize = config.chunkSize ?? 1024;
  }

  async fetch(
    reference: ArtifactReference,
    options: FetchOptions,
  ): Promise<FetchedArtifact> {
    this.fetchCalls.push({ reference, options });

    // No Content-Length header — the real fetcher will stream and enforce
    // Simulate: initial response looks OK, but body is too large
    const totalBytes = this.realBody.byteLength;

    if (totalBytes > options.maxBytes) {
      // Simulate the real streaming behavior: accumulate chunks, then abort
      throw new ArtifactTooLargeError(
        `Streamed ${totalBytes} bytes, exceeding max ${options.maxBytes}`,
        options.maxBytes,
        totalBytes,
      );
    }

    return {
      status: 200,
      contentType: 'application/octet-stream',
      contentLength: undefined, // No Content-Length — must stream
      body: this.realBody,
    };
  }
}
