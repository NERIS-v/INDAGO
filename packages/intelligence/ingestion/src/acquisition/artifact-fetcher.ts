import type { ArtifactReference } from '@indago/contracts';

// ============================================================================
// Artifact Fetcher
//
// Abstracts HTTP retrieval of artifacts from remote URLs.
// The URL is treated as opaque — no provider SDK coupling.
//
// HARD RULE: The fetcher MUST enforce maxBytes while streaming.
// It NEVER accumulates an unbounded response in memory.
// ============================================================================

export interface FetchOptions {
  readonly timeoutMs: number;
  readonly maxBytes: number;
}

export interface FetchedArtifact {
  readonly status: number;
  readonly contentType: string | undefined;
  readonly contentLength: number | undefined;
  readonly body: Uint8Array;
}

export interface ArtifactFetcher {
  fetch(
    reference: ArtifactReference,
    options: FetchOptions,
  ): Promise<FetchedArtifact>;
}

// ============================================================================
// HTTP Error Types
//
// Distinguishable failure modes for the acquisition service.
// ============================================================================

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class FetchFailedError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'FetchFailedError';
  }
}

export class FetchTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchTimeoutError';
  }
}

export class ArtifactTooLargeError extends Error {
  constructor(
    message: string,
    public readonly maxBytes: number,
    public readonly actualBytes?: number,
  ) {
    super(message);
    this.name = 'ArtifactTooLargeError';
  }
}

export class InvalidReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReferenceError';
  }
}

// ============================================================================
// HTTP Artifact Fetcher
//
// Uses Node's built-in fetch with streaming byte enforcement.
// Guarantees: returned body.byteLength <= maxBytes, always.
// ============================================================================

export class HttpArtifactFetcher implements ArtifactFetcher {
  async fetch(
    reference: ArtifactReference,
    options: FetchOptions,
  ): Promise<FetchedArtifact> {
    // Validate URL
    let url: URL;
    try {
      url = new URL(reference.url);
    } catch {
      throw new InvalidReferenceError(`Invalid URL: ${reference.url}`);
    }

    // Fast reject: declared size exceeds limit
    if (
      reference.declaredSizeBytes !== undefined &&
      reference.declaredSizeBytes > options.maxBytes
    ) {
      throw new ArtifactTooLargeError(
        `Declared size ${reference.declaredSizeBytes} exceeds maximum ${options.maxBytes}`,
        options.maxBytes,
        reference.declaredSizeBytes,
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      let response: Response;
      try {
        response = await fetch(url.toString(), {
          signal: controller.signal,
        });
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new FetchTimeoutError(
            `Fetch timed out after ${options.timeoutMs}ms`,
          );
        }
        throw new FetchFailedError(
          `Network error fetching ${reference.url}`,
          err instanceof Error ? err : undefined,
        );
      }

      clearTimeout(timeoutId);

      // Check Content-Length before downloading body
      const contentLengthHeader = response.headers.get('content-length');
      const contentLength = contentLengthHeader
        ? parseInt(contentLengthHeader, 10)
        : undefined;

      if (contentLength !== undefined && contentLength > options.maxBytes) {
        response.body?.cancel();
        throw new ArtifactTooLargeError(
          `Content-Length ${contentLength} exceeds maximum ${options.maxBytes}`,
          options.maxBytes,
          contentLength,
        );
      }

      const contentType = response.headers.get('content-type') ?? undefined;

      // Stream body with byte enforcement
      if (!response.body) {
        return {
          status: response.status,
          contentType,
          contentLength: contentLength ?? 0,
          body: new Uint8Array(0),
        };
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          totalBytes += value.byteLength;
          if (totalBytes > options.maxBytes) {
            // Abort and discard all partial data
            await reader.cancel();
            controller.abort();
            throw new ArtifactTooLargeError(
              `Downloaded ${totalBytes} bytes, exceeding maximum ${options.maxBytes}`,
              options.maxBytes,
              totalBytes,
            );
          }
          chunks.push(value);
        }
      } catch (err) {
        // Re-throw our own errors, wrap unexpected ones
        if (
          err instanceof ArtifactTooLargeError ||
          err instanceof FetchTimeoutError
        ) {
          throw err;
        }
        throw new FetchFailedError(
          'Error reading response body',
          err instanceof Error ? err : undefined,
        );
      }

      // Concatenate chunks only after full validation
      return {
        status: response.status,
        contentType,
        contentLength: contentLength ?? totalBytes,
        body: concatChunks(chunks),
      };
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 0) return new Uint8Array(0);
  if (chunks.length === 1) return chunks[0]!;

  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.byteLength;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}
