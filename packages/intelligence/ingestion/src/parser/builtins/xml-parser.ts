// ============================================================================
// XML Parser Stub
//
// M-PR2: Capability declaration and format matching.
// M-PR3: Will implement actual XML structure parsing.
// ============================================================================

import type { ArtifactClassification } from '../../classification/types.js';
import type { ArtifactParser } from '../artifact-parser.js';
import type { ParserCapability } from '../parser-capability.js';

const CAPABILITY: ParserCapability = {
  parserId: 'xml-parser',
  parserVersion: '0.1.0',
  displayName: 'XML Parser',
  supportedFormats: ['XML'],
  supportedMimeTypes: ['application/xml', 'text/xml'],
  supportedFamilies: ['STRUCTURED_DATA'],
  priority: 100,
  acceptsFallbackFormats: false,
};

export function createXmlParser(): ArtifactParser {
  return {
    capability: CAPABILITY,
    canParse(classification: ArtifactClassification): boolean {
      return classification.format === 'XML';
    },
  };
}
