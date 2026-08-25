import type {
  AdapterCapability,
  IngestionEnvelope,
  IngestionError,
} from '@indago/contracts';

// ============================================================================
// Source Adapter Interface
//
// The source-agnostic adapter abstraction.
// Every source adapter implements this interface.
//
// The adapter answers: "What did we receive from this source?"
// It does NOT normalize, extract entities, build graphs, or reason.
//
// Flow:
//   canHandle(input) → boolean
//   ingest(input, context) → IngestionEnvelope | IngestionError
//
// The adapter is deterministic and side-effect-free in its contract.
// Storage and provenance are handled through injected dependencies.
// ============================================================================

/**
 * Context provided to the adapter during ingestion.
 * Contains the case/investigation scope and source identity.
 */
export interface IngestionContext {
  readonly sourceId: string;
  readonly caseId: string;
  readonly investigationId?: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
}

/**
 * Raw input to be ingested.
 * Adapters validate and process this.
 */
export interface IngestionInput {
  readonly content: Buffer | Uint8Array;
  readonly filename?: string;
  readonly mimeType: string;
  readonly sourceMetadata?: Record<string, unknown>;
}

/**
 * Result type for ingestion operations.
 * IngestionEnvelope on success, IngestionError on failure.
 */
export type IngestionResult =
  | { readonly ok: true; readonly envelope: IngestionEnvelope }
  | { readonly ok: false; readonly error: IngestionError };

/**
 * Source Adapter interface.
 *
 * All source adapters must implement this interface.
 * The interface is source-agnostic — FIR, CDR, financial, social media,
 * and future adapters all plug in through this boundary.
 */
export interface SourceAdapter {
  /**
   * Returns the capability metadata for this adapter.
   */
  capability(): AdapterCapability;

  /**
   * Determines whether this adapter can handle the given input.
   * Must be fast and non-destructive.
   */
  canHandle(input: IngestionInput): boolean;

  /**
   * Ingests the input and produces a canonical IngestionEnvelope.
   *
   * The adapter MUST:
   *   - Preserve raw content integrity (hash, size, mime)
   *   - Attach provenance (source, adapter, timestamps)
   *   - NOT extract entities, relations, or observations
   *   - NOT assign roles or criminal relevance
   *   - NOT produce Evidence or Observation objects
   *
   * On failure, returns a typed IngestionError.
   */
  ingest(
    input: IngestionInput,
    context: IngestionContext,
  ): Promise<IngestionResult>;
}
