// ============================================================================
// Image Parser
//
// Handles image files (PNG, JPEG, TIFF, GIF, BMP, WEBP).
// Delegates to the real OcrProvider (tesseract.js by default).
//
// If no OcrProvider is injected, returns extractionMethod: 'unsupported'
// with an appropriate warning. Never crashes.
//
// When an OcrProvider is available, performs real OCR and returns:
//   - extracted text
//   - confidence
//   - structured lines with bounding boxes
//   - provider metadata
//
// Deterministic: same bytes + same provider = same extraction.
// ============================================================================

import type { ArtifactParser } from '../artifact-parser.js';
import type { ParserCapability } from '../parser-capability.js';
import type { ParserContext, ParseResult, ExtractionWarning } from '../../extraction/types.js';
import type { ArtifactClassification } from '../../classification/types.js';

const CAPABILITY: ParserCapability = {
  parserId: 'image-parser',
  parserVersion: '2.0.0',
  displayName: 'Image Parser',
  supportedFormats: ['IMAGE'],
  supportedMimeTypes: [
    'image/png',
    'image/jpeg',
    'image/tiff',
    'image/bmp',
    'image/gif',
    'image/webp',
  ],
  supportedFamilies: ['IMAGE'],
  priority: 100,
  acceptsFallbackFormats: false,
};

/**
 * Detect image MIME type from bytes for the OCR provider.
 */
function detectImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 4 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 4 && bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) {
    return 'image/tiff';
  }
  if (bytes.length >= 4 && bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a) {
    return 'image/tiff';
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
  }
  if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }
  if (bytes.length >= 4 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46) {
    return 'image/webp';
  }
  return 'application/octet-stream';
}

export function createImageParser(): ArtifactParser {
  return {
    capability: CAPABILITY,

    canParse(classification: ArtifactClassification): boolean {
      return classification.format === 'IMAGE';
    },

    async parse(input: Uint8Array, context: ParserContext): Promise<ParseResult> {
      if (input.byteLength === 0) {
        return {
          ok: true,
          extraction: {
            artifactId: context.artifactId,
            parserId: CAPABILITY.parserId,
            parserVersion: CAPABILITY.parserVersion,
            format: 'IMAGE',
            extractionMethod: 'unsupported',
            extractedAt: new Date().toISOString(),
            warnings: [{ code: 'EMPTY_CONTENT', message: 'Image content is empty' }],
          },
        };
      }

      const warnings: ExtractionWarning[] = [];
      const mimeType = detectImageMime(input);

      if (!context.ocrProvider) {
        return {
          ok: true,
          extraction: {
            artifactId: context.artifactId,
            parserId: CAPABILITY.parserId,
            parserVersion: CAPABILITY.parserVersion,
            format: 'IMAGE',
            extractionMethod: 'unsupported',
            extractedAt: new Date().toISOString(),
            warnings: [
              {
                code: 'UNSUPPORTED_FEATURE',
                message: 'No OCR provider available for image text extraction',
                details: { mimeType },
              },
            ],
          },
        };
      }

      try {
        const ocrResult = await context.ocrProvider.extract({
          imageBytes: input,
          mimeType,
        });

        return {
          ok: true,
          extraction: {
            artifactId: context.artifactId,
            parserId: CAPABILITY.parserId,
            parserVersion: CAPABILITY.parserVersion,
            format: 'IMAGE',
            extractionMethod: 'ocr',
            extractedAt: new Date().toISOString(),
            text: ocrResult.text,
            ocrConfidence: ocrResult.confidence,
            ocrLines: ocrResult.lines,
            warnings: [...warnings, ...ocrResult.warnings],
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OCR failed';
        warnings.push({
          code: 'OCR_FALLBACK_USED',
          message: `OCR provider failed: ${message}`,
          details: { providerId: context.ocrProvider.providerId },
        });

        return {
          ok: true,
          extraction: {
            artifactId: context.artifactId,
            parserId: CAPABILITY.parserId,
            parserVersion: CAPABILITY.parserVersion,
            format: 'IMAGE',
            extractionMethod: 'unsupported',
            extractedAt: new Date().toISOString(),
            warnings,
          },
        };
      }
    },
  };
}
