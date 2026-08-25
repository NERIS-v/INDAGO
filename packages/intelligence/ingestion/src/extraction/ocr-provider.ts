// ============================================================================
// OCR Provider Abstraction
//
// Abstract interface for OCR engines (tesseract.js, cloud Vision, etc.).
// M-PR3 provides both the interface and a concrete tesseract.js implementation.
//
// PDF and Image parsers may call the injected OcrProvider when:
//   - PDF has empty text layer
//   - Image has no embedded text
//
// If no OcrProvider is injected, parsers return 'unsupported' extractionMethod
// with appropriate warnings. They never crash.
// ============================================================================

import type { ExtractionWarning } from './types.js';

/**
 * Bounding box from OCR output.
 */
export interface OcrBoundingBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * A single OCR word with position data.
 */
export interface OcrWord {
  readonly text: string;
  readonly confidence: number;
  readonly bbox: OcrBoundingBox;
}

/**
 * A line of OCR text with position data.
 */
export interface OcrLine {
  readonly text: string;
  readonly confidence: number;
  readonly bbox: OcrBoundingBox;
  readonly words: readonly OcrWord[];
}

/**
 * Input for OCR extraction.
 */
export interface OcrInput {
  /** Raw image bytes (page image, full image, etc.) */
  readonly imageBytes: Uint8Array;
  /** MIME type of the image (e.g., 'image/png', 'image/tiff') */
  readonly mimeType: string;
  /** Optional language hint (e.g., 'eng', 'hin') */
  readonly language?: string;
}

/**
 * Result of OCR extraction.
 * Fields that the engine does not provide are left undefined
 * rather than fabricated.
 */
export interface OcrResult {
  /** Extracted text */
  readonly text: string;
  /** Confidence score 0-1, if provider exposes it */
  readonly confidence?: number;
  /** OCR lines with bounding boxes, if provider exposes them */
  readonly lines?: readonly OcrLine[];
  /** Image/page width in pixels, if known */
  readonly imageWidth?: number;
  /** Image/page height in pixels, if known */
  readonly imageHeight?: number;
  /** Any warnings from the OCR process */
  readonly warnings: readonly ExtractionWarning[];
}

/**
 * Abstract OCR provider interface.
 * Concrete implementations are injected by the application layer.
 */
export interface OcrProvider {
  /** Unique provider identifier (e.g., 'tesseract', 'gcloud-vision') */
  readonly providerId: string;
  /** Provider version string */
  readonly providerVersion: string;
  /** Perform OCR on the given input */
  extract(input: OcrInput): Promise<OcrResult>;
}
