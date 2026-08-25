// ============================================================================
// CSV Parser Stub
//
// M-PR2: Capability declaration and format matching.
// M-PR3: Will implement actual CSV parsing.
// ============================================================================

import type { ArtifactClassification } from '../../classification/types.js';
import type { ArtifactParser } from '../artifact-parser.js';
import type { ParserCapability } from '../parser-capability.js';

const CAPABILITY: ParserCapability = {
  parserId: 'csv-parser',
  parserVersion: '0.1.0',
  displayName: 'CSV Parser',
  supportedFormats: ['CSV'],
  supportedMimeTypes: ['text/csv', 'application/csv'],
  supportedFamilies: ['STRUCTURED_DATA'],
  priority: 100,
  acceptsFallbackFormats: false,
};

export function createCsvParser(): ArtifactParser {
  return {
    capability: CAPABILITY,
    canParse(classification: ArtifactClassification): boolean {
      return classification.format === 'CSV';
    },
  };
}
