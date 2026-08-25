// ============================================================================
// JSON Parser
//
// Extracts structured JSON data using Node JSON.parse.
// Preserves the parsed data structure as-is — no entity/observation creation.
// Invalid JSON produces a structured MALFORMED_ARTIFACT error.
// Deterministic: same bytes = same parsed data.
// ============================================================================

import type { ArtifactParser } from '../artifact-parser.js';
import type { ParserCapability } from '../parser-capability.js';
import type { ParserContext, ParseResult } from '../../extraction/types.js';
import type { ArtifactClassification } from '../../classification/types.js';

const CAPABILITY: ParserCapability = {
  parserId: 'json-parser',
  parserVersion: '1.0.0',
  displayName: 'JSON Parser',
  supportedFormats: ['JSON'],
  supportedMimeTypes: ['application/json', 'text/json'],
  supportedFamilies: ['STRUCTURED_DATA'],
  priority: 100,
  acceptsFallbackFormats: false,
};

export function createJsonParser(): ArtifactParser {
  return {
    capability: CAPABILITY,

    canParse(classification: ArtifactClassification): boolean {
      return classification.format === 'JSON';
    },

    async parse(input: Uint8Array, context: ParserContext): Promise<ParseResult> {
      if (input.byteLength === 0) {
        return {
          ok: true,
          extraction: {
            artifactId: context.artifactId,
            parserId: CAPABILITY.parserId,
            parserVersion: CAPABILITY.parserVersion,
            format: 'JSON',
            extractionMethod: 'json-parse',
            extractedAt: new Date().toISOString(),
            data: null,
            sourceLocation: { kind: 'json-root' },
            warnings: [{ code: 'EMPTY_CONTENT', message: 'Artifact content is empty' }],
          },
        };
      }

      const text = new TextDecoder('utf-8', { fatal: false }).decode(input);

      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid JSON';
        return {
          ok: false,
          error: {
            category: 'MALFORMED_ARTIFACT',
            code: 'INVALID_JSON',
            message: `Failed to parse JSON: ${message}`,
            sourceId: context.artifactId,
            details: { parserId: CAPABILITY.parserId, parserVersion: CAPABILITY.parserVersion },
            retryable: false,
            timestamp: new Date().toISOString(),
          },
        };
      }

      return {
        ok: true,
        extraction: {
          artifactId: context.artifactId,
          parserId: CAPABILITY.parserId,
          parserVersion: CAPABILITY.parserVersion,
          format: 'JSON',
          extractionMethod: 'json-parse',
          extractedAt: new Date().toISOString(),
          data,
          sourceLocation: { kind: 'json-root' },
          warnings: [],
        },
      };
    },
  };
}
