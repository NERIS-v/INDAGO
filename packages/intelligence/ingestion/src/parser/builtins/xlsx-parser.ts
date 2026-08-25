// ============================================================================
// XLSX Parser Stub
//
// M-PR2: Capability declaration and format matching.
// M-PR3: Will implement actual XLSX cell extraction.
// ============================================================================

import type { ArtifactClassification } from '../../classification/types.js';
import type { ArtifactParser } from '../artifact-parser.js';
import type { ParserCapability } from '../parser-capability.js';

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
  };
}
