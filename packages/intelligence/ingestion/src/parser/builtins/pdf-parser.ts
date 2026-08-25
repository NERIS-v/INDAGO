// ============================================================================
// PDF Parser Stub
//
// M-PR2: Capability declaration and format matching.
// M-PR3: Will implement actual PDF text extraction.
// ============================================================================

import type { ArtifactClassification } from '../../classification/types.js';
import type { ArtifactParser } from '../artifact-parser.js';
import type { ParserCapability } from '../parser-capability.js';

const CAPABILITY: ParserCapability = {
  parserId: 'pdf-parser',
  parserVersion: '0.1.0',
  displayName: 'PDF Parser',
  supportedFormats: ['PDF'],
  supportedMimeTypes: ['application/pdf'],
  supportedFamilies: ['DOCUMENT'],
  priority: 100,
  acceptsFallbackFormats: false,
};

export function createPdfParser(): ArtifactParser {
  return {
    capability: CAPABILITY,
    canParse(classification: ArtifactClassification): boolean {
      return classification.format === 'PDF';
    },
  };
}
