// ============================================================================
// Tesseract.js OCR Provider
//
// Concrete OcrProvider implementation using tesseract.js v5.
// Runs OCR entirely in Node.js — no Python, no external runtime.
//
// tesseract.js v5 uses WASM by default in Node.js, downloads trained data
// on first use, and caches it. Supports 100+ languages.
//
// Usage:
//   const provider = createTesseractOcrProvider({ language: 'eng' });
//   const result = await provider.extract({ imageBytes, mimeType: 'image/png' });
// ============================================================================

import Tesseract from 'tesseract.js';
import type {
  OcrProvider,
  OcrInput,
  OcrResult,
  OcrLine,
  OcrWord,
} from './ocr-provider.js';
import type { ExtractionWarning } from './types.js';

/**
 * Configuration for the Tesseract.js OCR provider.
 */
export interface TesseractOcrConfig {
  /** Language(s) for OCR, default 'eng'. Use '+' for multiple: 'eng+hin' */
  readonly language?: string;
  /** Whether to log progress (default false) */
  readonly verbose?: boolean;
}

/**
 * Create a Tesseract.js-based OCR provider.
 *
 * @param config - Optional configuration (language, verbosity)
 */
export function createTesseractOcrProvider(
  config: TesseractOcrConfig = {},
): OcrProvider {
  const language = config.language ?? 'eng';

  return {
    providerId: 'tesseract.js',
    providerVersion: '5.x',

    async extract(input: OcrInput): Promise<OcrResult> {
      const warnings: ExtractionWarning[] = [];

      // tesseract.js accepts Buffer in ImageLike — convert from Uint8Array
      const imageBuffer = Buffer.from(input.imageBytes);

      const result = config.verbose
        ? await Tesseract.recognize(imageBuffer, language, {
            logger: (m) => {
              if (m.status === 'recognizing text') {
                // Progress logging — optional
              }
            },
          })
        : await Tesseract.recognize(imageBuffer, language);

      const { data } = result;

      // Build structured lines with bounding boxes
      const lines: OcrLine[] = data.lines.map((line) => {
        const words: OcrWord[] = line.words.map((word) => ({
          text: word.text,
          confidence: word.confidence / 100,
          bbox: {
            x0: word.bbox.x0,
            y0: word.bbox.y0,
            x1: word.bbox.x1,
            y1: word.bbox.y1,
          },
        }));

        return {
          text: line.text,
          confidence: line.confidence / 100,
          bbox: {
            x0: line.bbox.x0,
            y0: line.bbox.y0,
            x1: line.bbox.x1,
            y1: line.bbox.y1,
          },
          words,
        };
      });

      // Overall confidence: tesseract returns 0-100, normalize to 0-1
      const confidence = data.confidence / 100;

      if (data.text.trim().length === 0) {
        warnings.push({
          code: 'EMPTY_CONTENT',
          message: 'OCR produced no text from the provided image',
        });
      }

      return {
        text: data.text,
        confidence,
        lines,
        warnings,
      };
    },
  };
}
