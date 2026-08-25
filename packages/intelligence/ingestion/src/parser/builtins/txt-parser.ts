// ============================================================================
// TXT Parser Stub
//
// M-PR2: Capability declaration and format matching.
// M-PR3: Will implement actual text chunking.
// ============================================================================

import type { ArtifactClassification } from '../../classification/types.js';
import type { ArtifactParser } from '../artifact-parser.js';
import type { ParserCapability } from '../parser-capability.js';

const CAPABILITY: ParserCapability = {
  parserId: 'txt-parser',
  parserVersion: '0.1.0',
  displayName: 'TXT Parser',
  supportedFormats: ['TXT'],
  supportedMimeTypes: ['text/plain'],
  supportedFamilies: ['TEXT'],
  priority: 100,
  acceptsFallbackFormats: false,
};

export function createTxtParser(): ArtifactParser {
  return {
    capability: CAPABILITY,
    canParse(classification: ArtifactClassification): boolean {
      return classification.format === 'TXT';
    },
  };
}
