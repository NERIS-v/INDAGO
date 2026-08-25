// ============================================================================
// Parser Registry
//
// Central registry mapping artifact formats to parsers.
// Follows the same pattern as AdapterRegistry for consistency.
//
// Responsibilities:
//   - Store parser instances by parserId
//   - Lookup parsers by format, MIME type, or family
//   - Reject duplicate parserIds
//   - Provide deterministic routing candidates
//
// This module does NOT:
//   - Implement extraction
//   - Select the final parser (ParserRouter does that)
// ============================================================================

import type { ArtifactFormat, ArtifactFamily } from '../classification/types.js';
import type { ArtifactParser } from './artifact-parser.js';

/**
 * Registry of format-specific parsers.
 * Follows the AdapterRegistry pattern for consistency.
 */
export class ParserRegistry {
  private readonly parsers: Map<string, ArtifactParser> = new Map();
  private readonly parsersByFormat: Map<string, ArtifactParser[]> = new Map();
  private readonly parsersByMimeType: Map<string, ArtifactParser[]> = new Map();
  private readonly parsersByFamily: Map<string, ArtifactParser[]> = new Map();

  /**
   * Register a parser. Throws if parserId already exists.
   */
  register(parser: ArtifactParser): void {
    const { parserId } = parser.capability;

    if (this.parsers.has(parserId)) {
      throw new Error(`Parser already registered: ${parserId}`);
    }

    this.parsers.set(parserId, parser);

    // Index by format
    for (const format of parser.capability.supportedFormats) {
      const existing = this.parsersByFormat.get(format) ?? [];
      existing.push(parser);
      this.parsersByFormat.set(format, existing);
    }

    // Index by MIME type
    for (const mimeType of parser.capability.supportedMimeTypes) {
      const existing = this.parsersByMimeType.get(mimeType) ?? [];
      existing.push(parser);
      this.parsersByMimeType.set(mimeType, existing);
    }

    // Index by family
    for (const family of parser.capability.supportedFamilies) {
      const existing = this.parsersByFamily.get(family) ?? [];
      existing.push(parser);
      this.parsersByFamily.set(family, existing);
    }
  }

  /**
   * Get a parser by its unique ID.
   */
  getById(parserId: string): ArtifactParser | undefined {
    return this.parsers.get(parserId);
  }

  /**
   * Get all parsers that support a given format.
   */
  getByFormat(format: ArtifactFormat): ArtifactParser[] {
    return this.parsersByFormat.get(format) ?? [];
  }

  /**
   * Get all parsers that handle a given MIME type.
   */
  getByMimeType(mimeType: string): ArtifactParser[] {
    return this.parsersByMimeType.get(mimeType) ?? [];
  }

  /**
   * Get all parsers that support a given family.
   */
  getByFamily(family: ArtifactFamily): ArtifactParser[] {
    return this.parsersByFamily.get(family) ?? [];
  }

  /**
   * List all registered parsers.
   */
  list(): ArtifactParser[] {
    return Array.from(this.parsers.values());
  }

  /**
   * Check if a parser is registered.
   */
  has(parserId: string): boolean {
    return this.parsers.has(parserId);
  }

  /**
   * Get the count of registered parsers.
   */
  get size(): number {
    return this.parsers.size;
  }
}
