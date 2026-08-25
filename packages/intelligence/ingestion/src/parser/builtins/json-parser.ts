// ============================================================================
// JSON Parser Stub
//
// M-PR2: Capability declaration and format matching.
// M-PR3: Will implement actual JSON structure parsing.
// ============================================================================

import type { ArtifactClassification } from '../../classification/types.js';
import type { ArtifactParser } from '../artifact-parser.js';
import type { ParserCapability } from '../parser-capability.js';

const CAPABILITY: ParserCapability = {
  parserId: 'json-parser',
  parserVersion: '0.1.0',
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
  };
}
