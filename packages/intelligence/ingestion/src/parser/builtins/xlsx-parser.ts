// ============================================================================
// XLSX Parser Stub
//
// M-PR2: Capability declaration and format matching.
// M-PR3: Stub — XLSX extraction not implemented yet.
// Returns EXTRACTION_FAILED with XLSX_NOT_IMPLEMENTED code.
// ============================================================================

import type { ArtifactClassification } from '../../classification/types.js';
import type { ArtifactParser } from '../artifact-parser.js';
import type { ParserCapability } from '../parser-capability.js';
import type { ParserContext, ParseResult } from '../../extraction/types.js';

const CAPABILITY: ParserCapability = {
  parserId: 'xlsx-parser',
  parserVersion: '0.1.0',
  displayName: 'XLSX Parser',
  supportedFormats: ['XLSX'],
  supportedMimeTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  supportedFamilies: ['SPREADSHEET'],
  priority: 100,
  acceptsFallbackFormats: false,
};

export function createXlsxParser(): ArtifactParser {
  return {
    capability: CAPABILITY,
    canParse(classification: ArtifactClassification): boolean {
      return classification.format === 'XLSX';
    },
    async parse(_input: Uint8Array, context: ParserContext): Promise<ParseResult> {
      return {
        ok: false,
        error: {
          category: 'EXTRACTION_FAILED',
          code: 'XLSX_NOT_IMPLEMENTED',
          message: 'XLSX extraction not implemented in M-PR3. XLSX is a stub.',
          sourceId: context.artifactId,
          details: {
            parserId: CAPABILITY.parserId,
            parserVersion: CAPABILITY.parserVersion,
          },
          retryable: false,
          timestamp: new Date().toISOString(),
        },
      };
    },
  };
}
