import type {
  IngestionError,
} from '@indago/contracts';
import type {
  IngestionContext,
  IngestionInput,
  IngestionResult,
  SourceAdapter,
} from '../adapters/source-adapter.js';
import { AdapterRegistry } from '../registry/adapter-registry.js';

// ============================================================================
// Ingestion Service
//
// The deterministic ingestion boundary. Callable from async workers.
// Does NOT implement BullMQ, Redis, or worker lifecycle.
//
// Flow:
//   1. Resolve adapter (by ID or source type)
//   2. Validate adapter canHandle(input)
//   3. Delegate to adapter for envelope construction
//   4. Return IngestionEnvelope or IngestionError
//
// The service does NOT:
//   - Extract entities/relations/observations
//   - Normalize source data
//   - Build graphs
//   - Assign roles or criminal relevance
//   - Own investigation lifecycle
//
// Storage is the adapter's responsibility — the adapter receives
// an ArtifactStorage at construction time and handles raw artifact
// persistence internally.
// ============================================================================

export interface IngestionServiceConfig {
  readonly adapterRegistry: AdapterRegistry;
}

export class IngestionService {
  private readonly registry: AdapterRegistry;

  constructor(config: IngestionServiceConfig) {
    this.registry = config.adapterRegistry;
  }

  /**
   * Ingest a raw input using the adapter identified by adapterId.
   */
  async ingest(
    input: IngestionInput,
    context: IngestionContext,
  ): Promise<IngestionResult> {
    const adapter = this.registry.getById(context.adapterId);
    if (!adapter) {
      return {
        ok: false,
        error: makeIngestionError('UNSUPPORTED_SOURCE', context),
      };
    }

    return this.ingestWithAdapter(adapter, input, context);
  }

  /**
   * Ingest a raw input using the adapter for the given source type.
   */
  async ingestBySourceType(
    input: IngestionInput,
    context: IngestionContext,
  ): Promise<IngestionResult> {
    const sourceType = input.sourceMetadata?.sourceType;
    if (typeof sourceType !== 'string') {
      return {
        ok: false,
        error: makeIngestionError('INVALID_INPUT', context, {
          detail: 'sourceMetadata.sourceType is required for source type routing',
        }),
      };
    }

    const adapter = this.registry.getBySourceType(sourceType);
    if (!adapter) {
      return {
        ok: false,
        error: makeIngestionError('UNSUPPORTED_SOURCE', context, {
          detail: `No adapter registered for source type "${sourceType}"`,
        }),
      };
    }

    return this.ingestWithAdapter(adapter, input, context);
  }

  private async ingestWithAdapter(
    adapter: SourceAdapter,
    input: IngestionInput,
    context: IngestionContext,
  ): Promise<IngestionResult> {
    if (!adapter.canHandle(input)) {
      return {
        ok: false,
        error: makeIngestionError('UNSUPPORTED_INPUT', context, {
          detail: `Adapter "${context.adapterId}" cannot handle this input`,
        }),
      };
    }

    return adapter.ingest(input, context);
  }
}

function makeIngestionError(
  category: IngestionError['category'],
  context: IngestionContext,
  extra?: { detail?: string; retryable?: boolean },
): IngestionError {
  return {
    category,
    code: `INGESTION_${category}`,
    message: extra?.detail ?? `Ingestion failed: ${category}`,
    sourceId: context.sourceId,
    retryable: extra?.retryable ?? false,
    timestamp: new Date().toISOString(),
  };
}
