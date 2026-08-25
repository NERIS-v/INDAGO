import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpArtifactFetcher } from '../../src/acquisition/artifact-fetcher.js';
import type { ArtifactReference } from '@indago/contracts';
import {
  TEXT_ARTIFACT_CONTENT,
  generateOversizedContent,
  EMPTY_ARTIFACT_CONTENT,
} from './fixtures.js';

// ============================================================================
// Artifact Fetcher Tests
//
// Verifies HTTP fetching with streaming byte enforcement.
// Mocks globalThis.fetch to control response behavior.
// ============================================================================

function makeReference(url = 'https://example.com/artifact/test.txt'): ArtifactReference {
  return { url };
}

function makeFetchResponse(config: {
  body?: Uint8Array;
  status?: number;
  contentType?: string;
  contentLength?: number;
}): Response {
  const body = config.body ?? new Uint8Array(0);
  const status = config.status ?? 200;
  const headers = new Headers();
  if (config.contentType) headers.set('content-type', config.contentType);
  if (config.contentLength !== undefined) {
    headers.set('content-length', String(config.contentLength));
  }

  return new Response(body.length > 0 ? body : null, {
    status,
    headers,
  });
}

describe('HttpArtifactFetcher', () => {
  let fetcher: HttpArtifactFetcher;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    fetcher = new HttpArtifactFetcher();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('successful fetches', () => {
    it('fetches text content successfully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse({
          body: TEXT_ARTIFACT_CONTENT,
          contentType: 'text/plain',
        }),
      );

      const result = await fetcher.fetch(makeReference(), {
        timeoutMs: 5000,
        maxBytes: 1024 * 1024,
      });

      expect(result.status).toBe(200);
      expect(result.contentType).toBe('text/plain');
      expect(result.body).toEqual(TEXT_ARTIFACT_CONTENT);
    });

    it('fetches binary content successfully', async () => {
      const binary = new Uint8Array([0x00, 0xff, 0x80]);
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse({
          body: binary,
          contentType: 'application/octet-stream',
        }),
      );

      const result = await fetcher.fetch(makeReference(), {
        timeoutMs: 5000,
        maxBytes: 1024 * 1024,
      });

      expect(result.status).toBe(200);
      expect(result.body).toEqual(binary);
    });

    it('returns correct contentLength from header', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse({
          body: TEXT_ARTIFACT_CONTENT,
          contentLength: TEXT_ARTIFACT_CONTENT.byteLength,
        }),
      );

      const result = await fetcher.fetch(makeReference(), {
        timeoutMs: 5000,
        maxBytes: 1024 * 1024,
      });

      expect(result.contentLength).toBe(TEXT_ARTIFACT_CONTENT.byteLength);
    });
  });

  describe('HTTP errors', () => {
    it('returns status for 404', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse({ status: 404 }),
      );

      const result = await fetcher.fetch(makeReference(), {
        timeoutMs: 5000,
        maxBytes: 1024 * 1024,
      });

      expect(result.status).toBe(404);
    });

    it('returns status for 403', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse({ status: 403 }),
      );

      const result = await fetcher.fetch(makeReference(), {
        timeoutMs: 5000,
        maxBytes: 1024 * 1024,
      });

      expect(result.status).toBe(403);
    });

    it('returns status for 500', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse({ status: 500 }),
      );

      const result = await fetcher.fetch(makeReference(), {
        timeoutMs: 5000,
        maxBytes: 1024 * 1024,
      });

      expect(result.status).toBe(500);
    });
  });

  describe('network failures', () => {
    it('throws FetchFailedError on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        fetcher.fetch(makeReference(), {
          timeoutMs: 5000,
          maxBytes: 1024 * 1024,
        }),
      ).rejects.toThrow('Network error');
    });
  });

  describe('timeout', () => {
    it('throws FetchTimeoutError on abort', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          }, 10);
        });
      });

      await expect(
        fetcher.fetch(makeReference(), {
          timeoutMs: 1, // Very short timeout
          maxBytes: 1024 * 1024,
        }),
      ).rejects.toThrow('timed out');
    });
  });

  describe('size enforcement', () => {
    it('rejects when Content-Length exceeds maxBytes', async () => {
      const oversized = generateOversizedContent(1024);
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse({
          status: 200,
          contentLength: oversized.byteLength,
        }),
      );

      await expect(
        fetcher.fetch(makeReference(), {
          timeoutMs: 5000,
          maxBytes: 1024,
        }),
      ).rejects.toThrow('exceeds maximum');
    });

    it('accepts when Content-Length equals maxBytes', async () => {
      const exactSize = new Uint8Array(1024);
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse({
          body: exactSize,
          contentLength: 1024,
        }),
      );

      const result = await fetcher.fetch(makeReference(), {
        timeoutMs: 5000,
        maxBytes: 1024,
      });

      expect(result.body.byteLength).toBe(1024);
    });

    it('handles missing Content-Length by streaming', async () => {
      const content = TEXT_ARTIFACT_CONTENT;
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse({
          body: content,
          // No contentLength header
        }),
      );

      const result = await fetcher.fetch(makeReference(), {
        timeoutMs: 5000,
        maxBytes: 1024 * 1024,
      });

      expect(result.body).toEqual(content);
    });

    it('throws when streamed body exceeds maxBytes', async () => {
      const oversized = generateOversizedContent(2048);
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse({
          body: oversized,
          // No content-length — must stream to discover size
        }),
      );

      await expect(
        fetcher.fetch(makeReference(), {
          timeoutMs: 5000,
          maxBytes: 1024,
        }),
      ).rejects.toThrow('exceeding maximum');
    });
  });

  describe('empty body', () => {
    it('returns empty Uint8Array for null body', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse({ body: EMPTY_ARTIFACT_CONTENT }),
      );

      const result = await fetcher.fetch(makeReference(), {
        timeoutMs: 5000,
        maxBytes: 1024,
      });

      expect(result.body.byteLength).toBe(0);
    });
  });

  describe('URL validation', () => {
    it('rejects malformed URL', async () => {
      await expect(
        fetcher.fetch(makeReference('not-a-url'), {
          timeoutMs: 5000,
          maxBytes: 1024,
        }),
      ).rejects.toThrow('Invalid URL');
    });
  });

  describe('declared size fast reject', () => {
    it('rejects without fetching when declared size exceeds max', async () => {
      globalThis.fetch = vi.fn();

      await expect(
        fetcher.fetch(
          { url: 'https://example.com/file.bin', declaredSizeBytes: 2048 },
          { timeoutMs: 5000, maxBytes: 1024 },
        ),
      ).rejects.toThrow('Declared size');

      // Should not have called fetch
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });
});
