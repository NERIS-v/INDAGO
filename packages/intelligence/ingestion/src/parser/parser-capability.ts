// ============================================================================
// Parser Capability Types
//
// Types for parser capabilities, routes, and routing results.
// M-PR2 defines the capability/route boundary. M-PR3 implements extraction.
// ============================================================================

import type { IngestionError } from '@indago/contracts';
import type {
  ArtifactFormat,
  ArtifactFamily,
  EncodingType,
  ClassificationConfidence,
  ClassificationMethod,
} from '../classification/types.js';

/**
 * Describes what a parser can handle.
 * Does NOT implement extraction — that is M-PR3.
 */
export interface ParserCapability {
  /** Unique parser identifier (e.g., "pdf-parser", "csv-parser") */
  readonly parserId: string;
  /** Semantic version string (e.g., "1.0.0") */
  readonly parserVersion: string;
  /** Human-readable name */
  readonly displayName: string;
  /** Formats this parser handles (exact match) */
  readonly supportedFormats: readonly ArtifactFormat[];
  /** MIME types this parser handles */
  readonly supportedMimeTypes: readonly string[];
  /** Artifact families this parser handles (broader fallback) */
  readonly supportedFamilies: readonly ArtifactFamily[];
  /** Routing priority (lower = higher priority, default 100) */
  readonly priority: number;
  /**
   * Whether this parser accepts family-level fallback routing.
   * When true, this parser can handle artifacts from its supported families
   * even when no exact format parser exists.
   * Default: false (exact format match only).
   */
  readonly acceptsFallbackFormats: boolean;
}

/**
 * Deterministic routing decision.
 * Contains everything needed to reproduce the same routing.
 */
export interface ParserRoute {
  readonly artifactId: string;
  readonly contentHash: string;
  readonly parserId: string;
  readonly parserVersion: string;
  readonly format: ArtifactFormat;
  readonly family: ArtifactFamily;
  readonly encoding: EncodingType;
  readonly confidence: ClassificationConfidence;
  readonly detectionMethod: ClassificationMethod;
  readonly reason: string;
}

/**
 * Discriminated union result for parser routing.
 */
export type ParserRouteResult =
  | { readonly ok: true; readonly route: ParserRoute }
  | { readonly ok: false; readonly error: IngestionError };
