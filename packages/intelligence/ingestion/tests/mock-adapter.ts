import { randomUUID } from 'node:crypto';
import type { AdapterCapability, IngestionEnvelope, IngestionError } from '@indago/contracts';
import type {
  SourceAdapter,
  IngestionContext,
  IngestionInput,
  IngestionResult,
} from '../src/adapters/source-adapter.js';
import type { ArtifactStorage } from '../src/storage/artifact-storage.js';

// ============================================================================
// Mock Adapter — a deterministic test adapter for MA01 verification.
//
// Simulates a source adapter without real processing logic.
// Used in all MA01 tests.
// ============================================================================

export interface MockAdapterConfig {
  readonly adapterId?: string;
  readonly sourceType?: string;
  readonly storage: ArtifactStorage;
  /**
   * If set, the adapter will fail with this category on ingest.
   */
  readonly failWith?: IngestionError['category'];
}

export class MockAdapter implements SourceAdapter {
  private readonly config: MockAdapterConfig;
  private readonly adapterCapability: AdapterCapability;

  constructor(config: MockAdapterConfig) {
    this.config = config;
    this.adapterCapability = {
      adapterId: config.adapterId ?? 'mock-adapter-v1',
      adapterVersion: '1.0.0',
      sourceType: config.sourceType ?? 'MOCK_SOURCE',
      supportedMimeTypes: ['text/plain', 'application/json'],
      supportedExtensions: ['.txt', '.json'],
      description: 'Mock adapter for testing',
    };
  }

  capability(): AdapterCapability {
    return this.adapterCapability;
  }

  canHandle(input: IngestionInput): boolean {
    if (this.config.failWith === 'UNSUPPORTED_INPUT') return false;
    return this.adapterCapability.supportedMimeTypes.includes(input.mimeType);
  }

  async ingest(
    input: IngestionInput,
    context: IngestionContext,
  ): Promise<IngestionResult> {
    if (this.config.failWith) {
      return {
        ok: false,
        error: {
          category: this.config.failWith,
          code: `MOCK_${this.config.failWith}`,
          message: `Mock failure: ${this.config.failWith}`,
          sourceId: context.sourceId,
          retryable: false,
          timestamp: new Date().toISOString(),
        },
      };
    }

    const hash = await computeHash(input.content);

    const { storagePath } = await this.config.storage.write({
      content: input.content,
      mimeType: input.mimeType,
      hash,
      filename: input.filename,
    });

    const envelope: IngestionEnvelope = {
      artifactId: randomUUID(),
      sourceContext: {
        sourceId: context.sourceId,
        caseId: context.caseId,
        investigationId: context.investigationId,
        systemOrigin: 'mock-system',
        adapterId: context.adapterId,
        adapterVersion: context.adapterVersion,
      },
      integrity: {
        contentHash: hash,
        contentSizeBytes: input.content.byteLength,
        mimeType: input.mimeType,
        originalFilename: input.filename,
      },
      storagePath,
      artifactType: 'DOCUMENT',
      ingestionTime: {
        value: new Date().toISOString(),
        precision: 'exact',
      },
      metadata: input.sourceMetadata ? { customFields: input.sourceMetadata } : undefined,
    };

    return { ok: true, envelope };
  }
}

async function computeHash(content: Uint8Array): Promise<string> {
  const hasher = await globalThis.crypto.subtle.digest('SHA-256', content);
  return Array.from(new Uint8Array(hasher))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
