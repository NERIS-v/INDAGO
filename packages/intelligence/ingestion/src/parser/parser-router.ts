// ============================================================================
// Parser Router
//
// Deterministic parser selection from classification + registry.
//
// Routing algorithm:
//   1. Use registry index for exact format match (highest confidence)
//   2. If no exact match, check family fallback parsers
//      (only parsers with acceptsFallbackFormats: true)
//   3. Sort candidates by priority ascending, then parserId alphabetically
//   4. Select the first candidate
//   5. If no candidates found, return UNSUPPORTED_FORMAT error
//
// Determinism guarantee:
//   - Same classification + same registry = same ParserRoute
//   - No randomness, no LLM, no network calls
//   - Tie-breaking is always alphabetical on parserId
// ============================================================================

import type { ArtifactClassification } from '../classification/types.js';
import type { ParserRouteResult } from './parser-capability.js';
import type { ParserRegistry } from './parser-registry.js';

/**
 * Deterministically sort parsers by priority asc, then parserId alpha.
 */
function sortCandidates(parsers: import('./artifact-parser.js').ArtifactParser[]): void {
  parsers.sort((a, b) => {
    const priorityDiff = a.capability.priority - b.capability.priority;
    if (priorityDiff !== 0) return priorityDiff;
    return a.capability.parserId.localeCompare(b.capability.parserId);
  });
}

/**
 * Select a parser for the given classification using the registry.
 *
 * @param classification - Deterministic artifact classification from M-PR2
 * @param registry - Parser registry with all registered parsers
 * @returns ParserRoute if successful, UNSUPPORTED_FORMAT error otherwise
 */
export function selectParser(
  classification: ArtifactClassification,
  registry: ParserRegistry,
): ParserRouteResult {
  // Step 1: Exact format match via registry index
  const formatCandidates = registry.getByFormat(classification.format);

  if (formatCandidates.length > 0) {
    // Filter by canParse and sort deterministically
    const matching = formatCandidates.filter((parser) =>
      parser.canParse(classification),
    );

    if (matching.length > 0) {
      sortCandidates(matching);
      const selected = matching[0]!;
      return {
        ok: true,
        route: {
          artifactId: classification.artifactId,
          contentHash: classification.contentHash,
          parserId: selected.capability.parserId,
          parserVersion: selected.capability.parserVersion,
          format: classification.format,
          family: classification.family,
          encoding: classification.encoding,
          confidence: classification.confidence,
          detectionMethod: classification.detectionMethod,
          reason: `Exact format match: ${classification.format}`,
        },
      };
    }
  }

  // Step 2: Family fallback — only parsers with acceptsFallbackFormats
  const familyCandidates = registry.getByFamily(classification.family);
  const fallbackParsers = familyCandidates.filter(
    (parser) => parser.capability.acceptsFallbackFormats,
  );

  if (fallbackParsers.length > 0) {
    const matching = fallbackParsers.filter((parser) =>
      parser.canParse(classification),
    );

    if (matching.length > 0) {
      sortCandidates(matching);
      const selected = matching[0]!;
      return {
        ok: true,
        route: {
          artifactId: classification.artifactId,
          contentHash: classification.contentHash,
          parserId: selected.capability.parserId,
          parserVersion: selected.capability.parserVersion,
          format: classification.format,
          family: classification.family,
          encoding: classification.encoding,
          confidence: classification.confidence,
          detectionMethod: classification.detectionMethod,
          reason: `Family match: ${classification.family} (no exact format parser for ${classification.format})`,
        },
      };
    }
  }

  // Step 3: No match — UNSUPPORTED_FORMAT
  return {
    ok: false,
    error: {
      category: 'UNSUPPORTED_FORMAT',
      code: 'NO_PARSER_MATCH',
      message: `No parser available for format "${classification.format}" (family: ${classification.family})`,
      sourceId: classification.artifactId,
      details: {
        format: classification.format,
        family: classification.family,
        mimeType: classification.detectedMimeType,
        encoding: classification.encoding,
        confidence: classification.confidence,
      },
      retryable: false,
      timestamp: new Date().toISOString(),
    },
  };
}
