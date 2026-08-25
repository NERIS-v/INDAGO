// ============================================================================
// DOCX Parser Stub
//
// M-PR2: Capability declaration and format matching.
// M-PR3: Will implement actual DOCX text extraction.
// ============================================================================

import type { ArtifactClassification } from '../../classification/types.js';
import type { ArtifactParser } from '../artifact-parser.js';
import type { ParserCapability } from '../parser-capability.js';

const CAPABILITY: ParserCapability = {
  parserId: 'docx-parser',
  parserVersion: '0.1.0',
  displayName: 'DOCX Parser',
  supportedFormats: ['DOCX'],
  supportedMimeTypes: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  supportedFamilies: ['DOCUMENT'],
  priority: 100,
  acceptsFallbackFormats: false,
};

export function createDocxParser(): ArtifactParser {
  return {
    capability: CAPABILITY,
    canParse(classification: ArtifactClassification): boolean {
      return classification.format === 'DOCX';
    },
  };
}
