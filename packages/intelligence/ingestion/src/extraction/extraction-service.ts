// ============================================================================
// Extraction Service
//
// Orchestrates the extraction pipeline:
//   1. Read artifact bytes from storage
//   2. Classify the artifact (format, family, encoding)
//   3. Route to the appropriate parser
//   4. Execute parser.parse(bytes, context)
//   5. Return ExtractionResult
//
// This is the SOLE entry point for reading artifact bytes during extraction.
// Parsers never read storage directly — they receive Uint8Array only.
//
// ExtractionService does NOT:
//   - Create observations, entities, or relations
//   - Write to graph or entity stores
//   - Access Redis, BullMQ, Express, UploadThing
//   - Perform any intelligence semantics
// ============================================================================

import type { IngestionError } from '@indago/contracts';
import type { VerifiedArtifact } from '../acquisition/types.js';
import type { ArtifactClassification } from '../classification/types.js';
import type { ArtifactStorage } from '../storage/artifact-storage.js';
import type { ParserRegistry } from '../parser/parser-registry.js';
import type { OcrProvider } from './ocr-provider.js';
import type { ExtractionResult, ParserContext, ParserLimits } from './types.js';
import { classifyArtifact } from '../classification/artifact-classifier.js';
import { selectParser } from '../parser/parser-router.js';

/**
 * Configuration for ExtractionService.
 */
export interface ExtractionServiceConfig {
  /** Optional OCR provider for image/PDF OCR fallback */
  readonly ocrProvider?: OcrProvider;
  /** Optional extraction limits applied to all extractions */
  readonly limits?: ParserLimits;
}

/**
 * Orchestrates extraction from verified artifacts.
 *
 * Flow: VerifiedArtifact → Storage Read → Classify → Route → Parse → ExtractionResult
 */
export class ExtractionService {
  constructor(
    private readonly storage: ArtifactStorage,
    private readonly parserRegistry: ParserRegistry,
    private readonly config: ExtractionServiceConfig = {},
  ) {}

  /**
   * Extract structured content from a verified artifact.
   *
   * This is the main entry point. It:
   * 1. Reads bytes from ArtifactStorage using the artifact's storagePath
   * 2. Classifies the artifact using M-PR2's classifyArtifact()
   * 3. Routes to the appropriate parser using M-PR2's selectParser()
   * 4. Calls parser.parse() with bytes and context
   * 5. Returns ExtractionResult (discriminated union)
   */
  async extract(
    artifact: VerifiedArtifact,
    options?: {
      /** Optional classification override (skip re-classification) */
      classification?: ArtifactClassification;
      /** Optional limits override for this extraction */
      limits?: ParserLimits;
      /** Optional content bytes (skip storage read) */
      content?: Uint8Array;
    },
  ): Promise<ExtractionResult> {
    // Step 1: Read bytes from storage (or use provided content)
    let bytes: Uint8Array;
    try {
      bytes = options?.content ?? (await this.storage.read(artifact.storagePath));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Storage read failed';
      return {
        ok: false,
        error: {
          category: 'EXTRACTION_FAILED',
          code: 'STORAGE_READ_FAILED',
          message: `Failed to read artifact from storage: ${message}`,
          sourceId: artifact.artifactId,
          details: { storagePath: artifact.storagePath },
          retryable: false,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // Storage.read returns a Node Buffer for binary artifacts; strict parsers
    // (pdf.js, etc.) reject Buffer. Normalize to a plain Uint8Array copy.
    if (Buffer.isBuffer(bytes)) {
      bytes = new Uint8Array(bytes);
    }

    // Step 2: Classify (or use provided classification)
    const classification = options?.classification ?? classifyArtifact(artifact, bytes);

    // Step 3: Route to parser
    const routeResult = selectParser(classification, this.parserRegistry);

    if (!routeResult.ok) {
      // Route failed — return the error (UNSUPPORTED_FORMAT)
      return {
        ok: false,
        error: routeResult.error,
      };
    }

    // Step 4: Get parser from registry
    const parser = this.parserRegistry.getById(routeResult.route.parserId);

    if (!parser) {
      return {
        ok: false,
        error: {
          category: 'EXTRACTION_FAILED',
          code: 'PARSER_NOT_FOUND',
          message: `Parser "${routeResult.route.parserId}" not found in registry`,
          sourceId: artifact.artifactId,
          details: { parserId: routeResult.route.parserId },
          retryable: false,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // Step 5: Build parser context
    const context: ParserContext = {
      artifactId: artifact.artifactId,
      contentHash: artifact.contentHash,
      originalFilename: artifact.originalFilename,
      detectedMimeType: artifact.detectedMimeType,
      encoding: classification.encoding,
      ocrProvider: this.config.ocrProvider,
      limits: options?.limits ?? this.config.limits,
    };

    // Step 6: Execute parse
    try {
      return await parser.parse(bytes, context);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Parser error';
      const error: IngestionError = {
        category: 'EXTRACTION_FAILED',
        code: 'PARSER_CRASH',
        message: `Parser "${routeResult.route.parserId}" threw an error: ${message}`,
        sourceId: artifact.artifactId,
        details: {
          parserId: routeResult.route.parserId,
          parserVersion: routeResult.route.parserVersion,
          format: classification.format,
          family: classification.family,
        },
        retryable: false,
        timestamp: new Date().toISOString(),
      };
      return { ok: false, error };
    }
  }
}
