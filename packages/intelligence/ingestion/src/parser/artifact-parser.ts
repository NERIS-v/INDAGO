// ============================================================================
// Artifact Parser Interface
//
// Defines the contract for format-specific parsers.
// M-PR2 defines the interface. M-PR3 implements extraction.
//
// Built-in parsers (M-PR2):
//   - Return ParserCapability
//   - Implement canParse for format matching
//
// This module does NOT:
//   - Perform extraction
//   - Create observations
//   - Refetch artifacts
// ============================================================================

import type { ArtifactClassification } from '../classification/types.js';
import type { ParserCapability } from './parser-capability.js';

/**
 * Parser contract for format-specific artifact processing.
 * Each parser declares its capability and validates format matching.
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
   *
   * @param classification - Deterministic artifact classification
   * @returns true if this parser can handle the artifact
   */
  canParse(classification: ArtifactClassification): boolean;
}
