// ============================================================================
// Artifact Parser Interface
//
// Defines the contract for format-specific parsers.
// M-PR2 defined capability/canParse. M-PR3 adds parse().
//
// Parsers receive Uint8Array bytes + ParserContext.
// Parsers return ParseResult (discriminated union).
//
// Parsers MUST NOT:
//   - Import ArtifactStorage
//   - Read files directly
//   - Fetch URLs
//   - Access Redis/BullMQ/Prisma/Neo4j/Express/UploadThing
//   - Create observations, entities, or relations
//   - Access graph or entity services
// ============================================================================

import type { ArtifactClassification } from '../classification/types.js';
import type { ParserCapability } from './parser-capability.js';
import type { ParserContext, ParseResult } from '../extraction/types.js';

/**
 * Parser contract for format-specific artifact processing.
 * Each parser declares its capability, validates format matching,
 * and extracts structured content from artifact bytes.
 */
export interface ArtifactParser {
  /**
   * Parser capability declaration.
   * Used by ParserRegistry for routing decisions.
   */
  readonly capability: ParserCapability;

  /**
   * Check if this parser can handle the given classification.
   * Deterministic: same classification always produces same result.
   */
  canParse(classification: ArtifactClassification): boolean;

  /**
   * Extract structured content from artifact bytes.
   * Deterministic: same bytes + same context = same extraction (minus extractedAt).
   *
   * Parsers receive only bytes and context — no storage, no graph, no services.
   * Returns ParseResult discriminated union (ok/error).
   */
  parse(input: Uint8Array, context: ParserContext): Promise<ParseResult>;
}
