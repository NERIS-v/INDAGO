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

function makeChunkedFetchResponse(
  chunks: Uint8Array[],
  status = 200,
): Response {
  let index = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index]!);
        index++;
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, { status });
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

    it('rejects maxBytes+1 across multiple small chunks', async () => {
      // 4 chunks of 256 bytes = 1024 bytes total, plus 5th chunk of 1 byte = 1025 bytes
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < 4; i++) {
        chunks.push(new Uint8Array(256));
      }
      chunks.push(new Uint8Array([0x01])); // 1025th byte

      globalThis.fetch = vi.fn().mockResolvedValue(
        makeChunkedFetchResponse(chunks),
      );

      await expect(
        fetcher.fetch(makeReference(), {
          timeoutMs: 5000,
          maxBytes: 1024,
        }),
      ).rejects.toThrow('exceeding maximum');
    });

    it('rejects when overflow occurs only on a later chunk', async () => {
      // First chunk fits (512 bytes), second chunk pushes past limit (600 bytes)
      const chunk1 = new Uint8Array(512);
      const chunk2 = new Uint8Array(600); // total: 1112 > 1024

      globalThis.fetch = vi.fn().mockResolvedValue(
        makeChunkedFetchResponse([chunk1, chunk2]),
      );

      await expect(
        fetcher.fetch(makeReference(), {
          timeoutMs: 5000,
          maxBytes: 1024,
        }),
      ).rejects.toThrow('exceeding maximum');
    });

    it('does not return partial oversized body on overflow', async () => {
      // 2 chunks: first is 800 bytes (within limit), second is 300 bytes (total 1100 > 1024)
      const chunk1 = new Uint8Array(800);
      const chunk2 = new Uint8Array(300);

      globalThis.fetch = vi.fn().mockResolvedValue(
        makeChunkedFetchResponse([chunk1, chunk2]),
      );

      // Must throw, never return
      const resultOrError = await fetcher
        .fetch(makeReference(), { timeoutMs: 5000, maxBytes: 1024 })
        .then(
          (r) => ({ ok: true as const, value: r }),
          (e) => ({ ok: false as const, error: e }),
        );

      expect(resultOrError.ok).toBe(false);
      if (!resultOrError.ok) {
        expect(resultOrError.error).toBeInstanceOf(Error);
        expect((resultOrError.error as Error).message).toContain('exceeding maximum');
      }
    });

    it('Content-Length greater than maxBytes rejects before body consumption', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse({
          status: 200,
          contentLength: 2048,
          // Body is intentionally empty or absent — rejection happens on header
        }),
      );

      await expect(
        fetcher.fetch(makeReference(), {
          timeoutMs: 5000,
          maxBytes: 1024,
        }),
      ).rejects.toThrow('exceeds maximum');
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

describe('SSRF / fetch policy (positive, no blacklists)', () => {
  let fetcher: HttpArtifactFetcher;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    fetcher = new HttpArtifactFetcher(); // strict defaults
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('rejects non-https schemes by default (http, ftp, file, data) and never fetches', async () => {
    globalThis.fetch = vi.fn();

    for (const url of [
      'http://example.com/a.txt',
      'ftp://example.com/a.txt',
      'file:///etc/passwd',
      'data:text/plain;base64,SGVsbG8=',
    ]) {
      await expect(fetcher.fetch({ url }, { timeoutMs: 5000, maxBytes: 1024 })).rejects.toThrow(
        'Unsupported URL scheme',
      );
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('allows http only when explicitly opted in', async () => {
    const permissive = new HttpArtifactFetcher({
      allowedSchemes: new Set(['https', 'http']),
    });
    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse({ status: 200 }));

    const result = await permissive.fetch(
      { url: 'http://example.com/a.txt' },
      { timeoutMs: 5000, maxBytes: 1024 },
    );
    expect(result.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects private / loopback / link-local / metadata / CGNAT / ULA destinations before any fetch', async () => {
    globalThis.fetch = vi.fn();

    const privateHosts = [
      'https://127.0.0.1/x',
      'https://10.0.0.1/x',
      'https://169.254.169.254/latest/meta-data', // cloud metadata
      'https://192.168.1.1/x',
      'https://172.16.0.1/x',
      'https://100.64.0.1/x',
      'https://0.0.0.0/x',
      'https://[::1]/x',
      'https://[fe80::1]/x',
      'https://[fc00::1]/x',
      'https://localhost:3000/x',
    ];

    for (const url of privateHosts) {
      await expect(fetcher.fetch({ url }, { timeoutMs: 5000, maxBytes: 1024 })).rejects.toThrow(
        'not permitted',
      );
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects reserved hostnames (.local, .internal, ...) even on https', async () => {
    globalThis.fetch = vi.fn();
    await expect(
      fetcher.fetch({ url: 'https://db.internal/x' }, { timeoutMs: 5000, maxBytes: 1024 }),
    ).rejects.toThrow('not permitted');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('positive allowlist: only listed origins (+subdomains) are reachable', async () => {
    const allowlisted = new HttpArtifactFetcher({
      allowedOrigins: new Set(['utfs.io']),
    });
    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse({ status: 200 }));

    const result = await allowlisted.fetch(
      { url: 'https://utfs.io/f/abc.txt' },
      { timeoutMs: 5000, maxBytes: 1024 },
    );
    expect(result.status).toBe(200);

    // Subdomain of an allowed origin passes (UploadThing serves from x.utfs.io).
    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse({ status: 200 }));
    await allowlisted.fetch(
      { url: 'https://files.utfs.io/f/abc.txt' },
      { timeoutMs: 5000, maxBytes: 1024 },
    );

    // Anything outside the allowlist is rejected.
    globalThis.fetch = vi.fn();
    await expect(
      allowlisted.fetch({ url: 'https://evil.example/x' }, { timeoutMs: 5000, maxBytes: 1024 }),
    ).rejects.toThrow('not permitted');
    await expect(
      allowlisted.fetch({ url: 'https://utfs.io.evil.example/x' }, { timeoutMs: 5000, maxBytes: 1024 }),
    ).rejects.toThrow('not permitted');
  });

  it('redirect to a disallowed destination is rejected and never followed (fetch interrupted)', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/internal' } }),
      )
      .mockResolvedValueOnce(makeFetchResponse({ body: TEXT_ARTIFACT_CONTENT }));

    await expect(
      fetcher.fetch(makeReference(), { timeoutMs: 5000, maxBytes: 1024 }),
    ).rejects.toThrow('not permitted');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('redirect within the allowlist is followed and re-validated', async () => {
    const allowlisted = new HttpArtifactFetcher({
      allowedOrigins: new Set(['utfs.io']),
    });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'https://files.utfs.io/b.txt' } }),
      )
      .mockResolvedValueOnce(makeFetchResponse({ body: TEXT_ARTIFACT_CONTENT, status: 200 }));

    const result = await allowlisted.fetch(
      { url: 'https://utfs.io/a.txt' },
      { timeoutMs: 5000, maxBytes: 1024 },
    );
    expect(result.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      'https://files.utfs.io/b.txt',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('caps redirects at maxRedirects (default 5) → FetchFailedError', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: 'https://example.com/hop' },
        }),
      ),
    );

    await expect(
      fetcher.fetch(makeReference(), { timeoutMs: 5000, maxBytes: 1024 }),
    ).rejects.toThrow('Too many redirects');
    expect(globalThis.fetch).toHaveBeenCalledTimes(6); // 5 redirects + the terminal hop
  });

  it('body deadline stays ACTIVE during body consumption (slow-drip body cannot outlive timeout)', async () => {
    // ReadableStream with no pull → reader.read() never settles → watchdog fires.
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(new ReadableStream({}), { status: 200 }),
    );

    await expect(
      fetcher.fetch(makeReference(), { timeoutMs: 50, maxBytes: 1024 }),
    ).rejects.toThrow('timed out');
  });
});
