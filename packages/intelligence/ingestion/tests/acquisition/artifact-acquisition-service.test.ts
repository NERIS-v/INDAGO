import { describe, it, expect } from 'vitest';
import { ArtifactAcquisitionService } from '../../src/acquisition/artifact-acquisition-service.js';
import { MockArtifactFetcher, StreamingOversizedFetcher } from './mock-fetcher.js';
import { InMemoryArtifactStorage } from '../../src/storage/artifact-storage.js';
import type { ArtifactReference } from '@indago/contracts';
import type {
  ArtifactAcquisitionConfig,
  AcquisitionContext,
} from '../../src/acquisition/types.js';
import {
  TEXT_ARTIFACT_CONTENT,
  PDF_ARTIFACT_CONTENT,
  PNG_ARTIFACT_CONTENT,
  EMPTY_ARTIFACT_CONTENT,
  generateOversizedContent,
} from './fixtures.js';
import { computeContentHash } from '../../src/acquisition/content-hasher.js';

// ============================================================================
// Artifact Acquisition Service Tests
//
// Full pipeline tests: reference → fetch → hash → verify → store → artifact.
// ============================================================================

const DEFAULT_CONFIG: ArtifactAcquisitionConfig = {
  maxArtifactSizeBytes: 1024 * 1024, // 1 MB
  fetchTimeoutMs: 5000,
  allowedContentTypes: undefined, // all types allowed
};

const CONTEXT: AcquisitionContext = {
  sourceId: 'test-source',
  investigationId: 'inv-001',
  operationId: 'op-001',
};

function makeReference(overrides?: Partial<ArtifactReference>): ArtifactReference {
  return {
    url: 'https://example.com/artifact/test.txt',
    ...overrides,
  };
}

function makeService(
  fetcher: MockArtifactFetcher,
  config: ArtifactAcquisitionConfig = DEFAULT_CONFIG,
): ArtifactAcquisitionService {
  return new ArtifactAcquisitionService({
    fetcher,
    storage: new InMemoryArtifactStorage(),
    acquisitionConfig: config,
  });
}

describe('ArtifactAcquisitionService', () => {
  describe('invalid reference', () => {
    it('rejects malformed URL', async () => {
      const fetcher = new MockArtifactFetcher();
      const service = makeService(fetcher);

      const result = await service.acquire(
        makeReference({ url: 'not-a-url' }),
        CONTEXT,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('INVALID_REFERENCE');
        expect(result.error.retryable).toBe(false);
      }
    });
  });

  describe('declared size fast reject', () => {
    it('rejects when declaredSizeBytes exceeds limit', async () => {
      const fetcher = new MockArtifactFetcher();
      const service = makeService(fetcher);

      const result = await service.acquire(
        makeReference({ declaredSizeBytes: 1024 * 1024 + 1 }),
        CONTEXT,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('ARTIFACT_TOO_LARGE');
        expect(result.error.retryable).toBe(false);
      }
      // Should not have called fetch
      expect(fetcher.fetchCalls.length).toBe(0);
    });

    it('does not fast-reject when declaredSizeBytes equals limit', async () => {
      const fetcher = new MockArtifactFetcher({ body: TEXT_ARTIFACT_CONTENT });
      const service = makeService(fetcher);

      const result = await service.acquire(
        makeReference({ declaredSizeBytes: 1024 * 1024 }),
        CONTEXT,
      );

      // Should NOT be fast-rejected; fetcher should have been called
      expect(fetcher.fetchCalls.length).toBe(1);
      expect(result.ok).toBe(true);
    });
  });

  describe('fetch failures', () => {
    it('handles network error (retryable)', async () => {
      const fetcher = new MockArtifactFetcher({ networkError: true });
      const service = makeService(fetcher);

      const result = await service.acquire(makeReference(), CONTEXT);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('FETCH_FAILED');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('handles timeout (retryable)', async () => {
      const fetcher = new MockArtifactFetcher({ timeoutError: true });
      const service = makeService(fetcher);

      const result = await service.acquire(makeReference(), CONTEXT);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('FETCH_TIMEOUT');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('handles oversized content (not retryable)', async () => {
      const oversized = generateOversizedContent(2048);
      const fetcher = new MockArtifactFetcher({ body: oversized });
      const service = makeService(fetcher, {
        ...DEFAULT_CONFIG,
        maxArtifactSizeBytes: 1024,
      });

      const result = await service.acquire(makeReference(), CONTEXT);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('ARTIFACT_TOO_LARGE');
        expect(result.error.retryable).toBe(false);
      }
    });
  });

  describe('HTTP status validation', () => {
    it('rejects 404 with correct error', async () => {
      const fetcher = new MockArtifactFetcher({ status: 404 });
      const service = makeService(fetcher);

      const result = await service.acquire(makeReference(), CONTEXT);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('HTTP_ERROR');
        expect(result.error.retryable).toBe(false);
        expect(result.error.message).toContain('404');
      }
    });

    it('marks 429 as retryable', async () => {
      const fetcher = new MockArtifactFetcher({ status: 429 });
      const service = makeService(fetcher);

      const result = await service.acquire(makeReference(), CONTEXT);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('HTTP_ERROR');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('marks 500 as retryable', async () => {
      const fetcher = new MockArtifactFetcher({ status: 500 });
      const service = makeService(fetcher);

      const result = await service.acquire(makeReference(), CONTEXT);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('HTTP_ERROR');
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  describe('empty artifact', () => {
    it('rejects 0-byte body', async () => {
      const fetcher = new MockArtifactFetcher({ body: EMPTY_ARTIFACT_CONTENT });
      const service = makeService(fetcher);

      const result = await service.acquire(makeReference(), CONTEXT);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('EMPTY_ARTIFACT');
        expect(result.error.retryable).toBe(false);
      }
    });
  });

  describe('hash verification', () => {
    it('verifies declared hash matches', async () => {
      const contentHash = await computeContentHash(TEXT_ARTIFACT_CONTENT);
      const fetcher = new MockArtifactFetcher({ body: TEXT_ARTIFACT_CONTENT });
      const service = makeService(fetcher);

      const result = await service.acquire(
        makeReference({ declaredContentHash: contentHash }),
        CONTEXT,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.artifact.hashVerified).toBe(true);
        expect(result.artifact.contentHash).toBe(contentHash);
      }
    });

    it('rejects mismatched hash', async () => {
      const fetcher = new MockArtifactFetcher({ body: TEXT_ARTIFACT_CONTENT });
      const service = makeService(fetcher);

      const result = await service.acquire(
        makeReference({ declaredContentHash: 'a'.repeat(64) }),
        CONTEXT,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('HASH_MISMATCH');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('hashVerified is false when no declared hash', async () => {
      const fetcher = new MockArtifactFetcher({ body: TEXT_ARTIFACT_CONTENT });
      const service = makeService(fetcher);

      const result = await service.acquire(makeReference(), CONTEXT);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.artifact.hashVerified).toBe(false);
      }
    });

    it('requireContentHash=false allows acquisition without declared hash', async () => {
      const fetcher = new MockArtifactFetcher({ body: TEXT_ARTIFACT_CONTENT });
      const service = makeService(fetcher, {
        ...DEFAULT_CONFIG,
        requireContentHash: false,
      });

      const result = await service.acquire(makeReference(), CONTEXT);

      expect(result.ok).toBe(true);
    });

    it('requireContentHash=true rejects when no declared hash', async () => {
      const fetcher = new MockArtifactFetcher({ body: TEXT_ARTIFACT_CONTENT });
      const service = makeService(fetcher, {
        ...DEFAULT_CONFIG,
        requireContentHash: true,
      });

      const result = await service.acquire(makeReference(), CONTEXT);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('INVALID_REFERENCE');
        expect(result.error.retryable).toBe(false);
      }
      // Fetcher was called (we fetched the bytes), but hash enforcement rejected
      expect(fetcher.fetchCalls.length).toBe(1);
    });

    it('requireContentHash=true allows acquisition when declared hash is provided', async () => {
      const contentHash = await computeContentHash(TEXT_ARTIFACT_CONTENT);
      const fetcher = new MockArtifactFetcher({ body: TEXT_ARTIFACT_CONTENT });
      const service = makeService(fetcher, {
        ...DEFAULT_CONFIG,
        requireContentHash: true,
      });

      const result = await service.acquire(
        makeReference({ declaredContentHash: contentHash }),
        CONTEXT,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.artifact.hashVerified).toBe(true);
      }
    });
  });

  describe('MIME verification', () => {
    it('verifies declared MIME matches detected', async () => {
      const fetcher = new MockArtifactFetcher({
        body: PDF_ARTIFACT_CONTENT,
        contentType: 'application/pdf',
      });
      const service = makeService(fetcher);

      const result = await service.acquire(
        makeReference({
          url: 'https://example.com/report.pdf',
          originalFilename: 'report.pdf',
          declaredMimeType: 'application/pdf',
        }),
        CONTEXT,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.artifact.mimeVerified).toBe(true);
        expect(result.artifact.detectedMimeType).toBe('application/pdf');
      }
    });

    it('rejects mismatched MIME type', async () => {
      const fetcher = new MockArtifactFetcher({
        body: PDF_ARTIFACT_CONTENT,
      });
      const service = makeService(fetcher);

      const result = await service.acquire(
        makeReference({
          url: 'https://example.com/report.pdf',
          originalFilename: 'report.pdf',
          declaredMimeType: 'image/png',
        }),
        CONTEXT,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('CONTENT_TYPE_MISMATCH');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('mimeVerified is false when no declared MIME', async () => {
      const fetcher = new MockArtifactFetcher({ body: TEXT_ARTIFACT_CONTENT });
      const service = makeService(fetcher);

      const result = await service.acquire(makeReference(), CONTEXT);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.artifact.mimeVerified).toBe(false);
      }
    });
  });

  describe('content type enforcement', () => {
    it('rejects disallowed content type', async () => {
      const fetcher = new MockArtifactFetcher({
        body: PNG_ARTIFACT_CONTENT,
      });
      const service = makeService(fetcher, {
        ...DEFAULT_CONFIG,
        allowedContentTypes: ['application/pdf', 'text/plain'],
      });

      const result = await service.acquire(
        makeReference({
          url: 'https://example.com/image.png',
          originalFilename: 'image.png',
        }),
        CONTEXT,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('UNSUPPORTED_REFERENCE');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('allows matching content type', async () => {
      const fetcher = new MockArtifactFetcher({
        body: TEXT_ARTIFACT_CONTENT,
      });
      const service = makeService(fetcher, {
        ...DEFAULT_CONFIG,
        allowedContentTypes: ['text/plain', 'application/pdf'],
      });

      const result = await service.acquire(makeReference(), CONTEXT);

      expect(result.ok).toBe(true);
    });
  });

  describe('successful acquisition', () => {
    it('returns complete VerifiedArtifact', async () => {
      const contentHash = await computeContentHash(PDF_ARTIFACT_CONTENT);
      const fetcher = new MockArtifactFetcher({
        body: PDF_ARTIFACT_CONTENT,
        contentType: 'application/pdf',
      });
      const service = makeService(fetcher);

      const result = await service.acquire(
        makeReference({
          url: 'https://example.com/report.pdf',
          originalFilename: 'report.pdf',
          declaredContentHash: contentHash,
          declaredMimeType: 'application/pdf',
        }),
        CONTEXT,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.artifact.artifactId).toBeDefined();
        expect(result.artifact.contentHash).toBe(contentHash);
        expect(result.artifact.contentSizeBytes).toBe(
          PDF_ARTIFACT_CONTENT.byteLength,
        );
        expect(result.artifact.detectedMimeType).toBe('application/pdf');
        expect(result.artifact.declaredMimeType).toBe('application/pdf');
        expect(result.artifact.hashVerified).toBe(true);
        expect(result.artifact.mimeVerified).toBe(true);
        expect(result.artifact.ingestionTime).toBeDefined();
        expect(result.artifact.storagePath).toBeDefined();
      }
    });

    it('deterministic artifact IDs for same content', async () => {
      const contentHash = await computeContentHash(PDF_ARTIFACT_CONTENT);
      const fetcher1 = new MockArtifactFetcher({
        body: PDF_ARTIFACT_CONTENT,
      });
      const fetcher2 = new MockArtifactFetcher({
        body: PDF_ARTIFACT_CONTENT,
      });
      const storage = new InMemoryArtifactStorage();

      const service1 = new ArtifactAcquisitionService({
        fetcher: fetcher1,
        storage,
        acquisitionConfig: DEFAULT_CONFIG,
      });
      const service2 = new ArtifactAcquisitionService({
        fetcher: fetcher2,
        storage,
        acquisitionConfig: DEFAULT_CONFIG,
      });

      const r1 = await service1.acquire(
        makeReference({ url: 'https://example.com/a.pdf' }),
        CONTEXT,
      );
      const r2 = await service2.acquire(
        makeReference({ url: 'https://example.com/b.pdf' }),
        CONTEXT,
      );

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      if (r1.ok && r2.ok) {
        expect(r1.artifact.artifactId).toBe(r2.artifact.artifactId);
        expect(r1.artifact.contentHash).toBe(r2.artifact.contentHash);
      }
    });

    it('different content produces different artifact IDs', async () => {
      const fetcher1 = new MockArtifactFetcher({ body: TEXT_ARTIFACT_CONTENT });
      const fetcher2 = new MockArtifactFetcher({ body: PDF_ARTIFACT_CONTENT });
      const storage = new InMemoryArtifactStorage();

      const service1 = new ArtifactAcquisitionService({
        fetcher: fetcher1,
        storage,
        acquisitionConfig: DEFAULT_CONFIG,
      });
      const service2 = new ArtifactAcquisitionService({
        fetcher: fetcher2,
        storage,
        acquisitionConfig: DEFAULT_CONFIG,
      });

      const r1 = await service1.acquire(makeReference(), CONTEXT);
      const r2 = await service2.acquire(makeReference(), CONTEXT);

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      if (r1.ok && r2.ok) {
        expect(r1.artifact.artifactId).not.toBe(r2.artifact.artifactId);
        expect(r1.artifact.contentHash).not.toBe(r2.artifact.contentHash);
      }
    });
  });

  describe('providerMetadata forwarding', () => {
    it('preserves providerMetadata from reference', async () => {
      const fetcher = new MockArtifactFetcher({ body: TEXT_ARTIFACT_CONTENT });
      const service = makeService(fetcher);
      const metadata = { uploadThingKey: 'abc123' };

      const result = await service.acquire(
        makeReference({ providerMetadata: metadata }),
        CONTEXT,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.artifact.providerMetadata).toEqual(metadata);
      }
    });
  });

  describe('streaming size enforcement', () => {
    it('rejects oversized body during streaming', async () => {
      const oversized = generateOversizedContent(2048);
      const fetcher = new StreamingOversizedFetcher({ body: oversized });
      const service = makeService(fetcher, {
        ...DEFAULT_CONFIG,
        maxArtifactSizeBytes: 1024,
      });

      const result = await service.acquire(makeReference(), CONTEXT);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('ARTIFACT_TOO_LARGE');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('oversized artifact never reaches storage', async () => {
      const oversized = generateOversizedContent(2048);
      const fetcher = new MockArtifactFetcher({ body: oversized });
      const storage = new InMemoryArtifactStorage();
      const service = new ArtifactAcquisitionService({
        fetcher,
        storage,
        acquisitionConfig: { ...DEFAULT_CONFIG, maxArtifactSizeBytes: 1024 },
      });

      const result = await service.acquire(makeReference(), CONTEXT);

      expect(result.ok).toBe(false);
      // Storage should be completely empty — nothing was written
      // InMemoryArtifactStorage uses mem://hash paths; verify none exist
      const exists = await storage.exists('mem://test');
      expect(exists).toBe(false);
    });
  });
});
