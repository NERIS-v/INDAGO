// ============================================================================
// Image Parser Stub
//
// M-PR2: Capability declaration and format matching.
// M-PR3: Will implement actual image analysis (OCR, metadata extraction).
// ============================================================================

import type { ArtifactClassification } from '../../classification/types.js';
import type { ArtifactParser } from '../artifact-parser.js';
import type { ParserCapability } from '../parser-capability.js';

const CAPABILITY: ParserCapability = {
  parserId: 'image-parser',
  parserVersion: '0.1.0',
  displayName: 'Image Parser',
  supportedFormats: ['IMAGE'],
  supportedMimeTypes: [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/bmp',
    'image/webp',
    'image/tiff',
  ],
  supportedFamilies: ['IMAGE'],
  priority: 100,
  acceptsFallbackFormats: false,
};

export function createImageParser(): ArtifactParser {
  return {
    capability: CAPABILITY,
    canParse(classification: ArtifactClassification): boolean {
      return classification.format === 'IMAGE';
    },
  };
}
