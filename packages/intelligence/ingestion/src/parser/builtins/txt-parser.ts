// ============================================================================
// TXT Parser
//
// Extracts text lines with line numbers and character offsets.
// Uses Node TextDecoder with encoding from ParserContext.
// Deterministic: same bytes + same context = same lines + same offsets.
// ============================================================================

import type { ArtifactParser } from '../artifact-parser.js';
import type { ParserCapability } from '../parser-capability.js';
import type { ParserContext, ParseResult } from '../../extraction/types.js';
import type { TxtLine, TxtExtraction } from '../../extraction/types.js';
import type { ArtifactClassification } from '../../classification/types.js';

const CAPABILITY: ParserCapability = {
  parserId: 'txt-parser',
  parserVersion: '1.0.0',
  displayName: 'TXT Parser',
  supportedFormats: ['TXT'],
  supportedMimeTypes: ['text/plain'],
  supportedFamilies: ['TEXT'],
  priority: 100,
  acceptsFallbackFormats: false,
};

/**
 * Decode bytes to string based on encoding from context.
 */
function decodeContent(bytes: Uint8Array, encoding: string): { text: string; warnings: import('../../extraction/types.js').ExtractionWarning[] } {
  const warnings: import('../../extraction/types.js').ExtractionWarning[] = [];
  let label: string;

  switch (encoding) {
    case 'UTF8':
    case 'UTF8_BOM':
      label = 'utf-8';
      break;
    case 'UTF16_LE':
      label = 'utf-16le';
      break;
    case 'UTF16_BE':
      label = 'utf-16be';
      break;
    default:
      label = 'utf-8';
      warnings.push({
        code: 'ENCODING_FALLBACK',
        message: `Unknown encoding "${encoding}", falling back to UTF-8`,
        details: { encoding },
      });
      break;
  }

  const decoder = new TextDecoder(label, { fatal: false });
  const text = decoder.decode(bytes);
  return { text, warnings };
}

/**
 * Split text into lines, tracking line numbers and character offsets.
 * Handles CRLF, LF, and CR newline conventions deterministically.
 */
function splitIntoLines(text: string): TxtLine[] {
  const lines: TxtLine[] = [];
  let lineNumber = 1;
  let pos = 0;

  while (pos < text.length) {
    let end = pos;

    // Find end of line
    while (end < text.length) {
      const ch = text.charCodeAt(end);
      if (ch === 0x0a) { // LF
        break;
      }
      if (ch === 0x0d) { // CR
        // Check for CRLF
        if (end + 1 < text.length && text.charCodeAt(end + 1) === 0x0a) {
          break;
        }
        break;
      }
      end++;
    }

    const lineText = text.slice(pos, end);

    lines.push({
      lineNumber,
      text: lineText,
      sourceLocation: {
        kind: 'txt-line',
        lineNumber,
        charStart: pos,
        charEnd: end,
      },
    });

    // Advance past newline
    if (end < text.length) {
      const ch = text.charCodeAt(end);
      if (ch === 0x0d && end + 1 < text.length && text.charCodeAt(end + 1) === 0x0a) {
        pos = end + 2; // CRLF
      } else {
        pos = end + 1; // LF or CR
      }
    } else {
      pos = end;
    }

    lineNumber++;
  }

  return lines;
}

export function createTxtParser(): ArtifactParser {
  return {
    capability: CAPABILITY,

    canParse(classification: ArtifactClassification): boolean {
      return classification.format === 'TXT';
    },

    async parse(input: Uint8Array, context: ParserContext): Promise<ParseResult> {
      if (input.byteLength === 0) {
        return {
          ok: true,
          extraction: {
            artifactId: context.artifactId,
            parserId: CAPABILITY.parserId,
            parserVersion: CAPABILITY.parserVersion,
            format: 'TXT',
            extractionMethod: 'text-decode',
            extractedAt: new Date().toISOString(),
            lines: [],
            warnings: [{ code: 'EMPTY_CONTENT', message: 'Artifact content is empty' }],
          },
        };
      }

      const { text, warnings } = decodeContent(input, context.encoding);
      let lines = splitIntoLines(text);
      let truncated = false;

      if (context.limits?.maxLines !== undefined && lines.length > context.limits.maxLines) {
        lines = lines.slice(0, context.limits.maxLines);
        truncated = true;
      }

      if (truncated) {
        warnings.push({
          code: 'TRUNCATED_OUTPUT',
          message: `Extraction truncated to ${lines.length} lines due to maxLines limit`,
          details: { maxLines: context.limits?.maxLines },
        });
      }

      const extraction: TxtExtraction & import('../../extraction/types.js').RawExtractionBase = {
        artifactId: context.artifactId,
        parserId: CAPABILITY.parserId,
        parserVersion: CAPABILITY.parserVersion,
        format: 'TXT',
        extractionMethod: 'text-decode',
        extractedAt: new Date().toISOString(),
        lines,
        warnings,
      };

      return { ok: true, extraction };
    },
  };
}
