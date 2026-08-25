// ============================================================================
// M-PR3 Test Fixtures
//
// Synthetic artifacts for extraction tests.
// No real user documents. All deterministic.
//
// Fixtures provide:
//   - In-memory bytes for each format
//   - Real PNG images with readable text (for OCR integration tests)
//   - VerifiedArtifact stubs for ExtractionService tests
//   - Helper functions for generating test data
// ============================================================================

import { createCanvas } from '@napi-rs/canvas';
import type { VerifiedArtifact } from '../../src/acquisition/types.js';
import type { ArtifactClassification } from '../../src/classification/types.js';
import type { ParserContext } from '../../src/extraction/types.js';
import type { OcrLine, OcrBoundingBox } from '../../src/extraction/ocr-provider.js';

// ============================================================================
// Helper: create a VerifiedArtifact stub
// ============================================================================

let idCounter = 0;

export function createVerifiedArtifact(
  overrides: Partial<VerifiedArtifact> = {},
): VerifiedArtifact {
  idCounter++;
  return {
    artifactId: `test-artifact-${idCounter}`,
    storagePath: `mem://test-hash-${idCounter}`,
    contentHash: `abc123def456abc123def456abc123def456abc123def456abc123def456abc${String(idCounter).padStart(2, '0')}`,
    contentSizeBytes: 0,
    detectedMimeType: 'text/plain',
    declaredMimeType: undefined,
    originalFilename: undefined,
    hashVerified: true,
    mimeVerified: true,
    ingestionTime: '2026-01-01T00:00:00.000Z',
    providerMetadata: undefined,
    ...overrides,
  };
}

// ============================================================================
// Helper: create a ParserContext stub
// ============================================================================

export function createParserContext(
  overrides: Partial<ParserContext> = {},
): ParserContext {
  return {
    artifactId: 'test-artifact',
    contentHash: 'test-hash',
    originalFilename: undefined,
    detectedMimeType: 'text/plain',
    encoding: 'UTF8',
    ...overrides,
  };
}

// ============================================================================
// Helper: create an ArtifactClassification stub
// ============================================================================

export function createClassification(
  overrides: Partial<ArtifactClassification> = {},
): ArtifactClassification {
  return {
    artifactId: 'test-artifact',
    contentHash: 'test-hash',
    detectedMimeType: 'text/plain',
    format: 'TXT',
    family: 'TEXT',
    encoding: 'UTF8',
    confidence: 'definite',
    detectionMethod: 'mime-detection',
    originalFilename: undefined,
    ...overrides,
  };
}

// ============================================================================
// TXT Fixtures
// ============================================================================

export const TXT_SIMPLE = new TextEncoder().encode('Hello, INDAGO!\nLine two.\nLine three.');

export const TXT_SINGLE_LINE = new TextEncoder().encode('Single line of text.');

export const TXT_CRLF = new TextEncoder().encode('Line one\r\nLine two\r\nLine three');

export const TXT_EMPTY_LINES = new TextEncoder().encode('First\n\n\nLast');

export const TXT_UNICODE = new TextEncoder().encode('Caf\u00e9 \u00fc\u00f1\u00efc\u00f6d\u00e9 \u65e5\u672c\u8a9e');

export const TXT_LONG = new TextEncoder().encode(
  Array.from({ length: 200 }, (_, i) => `Line ${i + 1} of 200`).join('\n'),
);

// ============================================================================
// JSON Fixtures
// ============================================================================

export const JSON_OBJECT = new TextEncoder().encode(
  JSON.stringify({ name: 'INDAGO', version: 7, active: true }),
);

export const JSON_ARRAY = new TextEncoder().encode(
  JSON.stringify([{ id: 1, label: 'alpha' }, { id: 2, label: 'beta' }]),
);

export const JSON_NESTED = new TextEncoder().encode(
  JSON.stringify({
    metadata: { caseId: 'CASE-001', analyst: 'Mayur' },
    evidence: [{ id: 'E1', type: 'document' }],
  }),
);

export const JSON_INVALID = new TextEncoder().encode('{ invalid json }}}');

export const JSON_EMPTY = new TextEncoder().encode('');

// ============================================================================
// CSV Fixtures
// ============================================================================

export const CSV_SIMPLE = new TextEncoder().encode(
  'name,age,city\nAlice,30,Mumbai\nBob,25,Delhi\nCharlie,35,Bangalore',
);

export const CSV_TSV = new TextEncoder().encode(
  'name\tage\tcity\nAlice\t30\tMumbai\nBob\t25\tDelhi',
);

export const CSV_QUOTED = new TextEncoder().encode(
  'name,description\n"Doc A","Contains, comma"\n"Doc B","Has ""quotes"""',
);

export const CSV_SINGLE_HEADER = new TextEncoder().encode('id\n1\n2\n3');

// ============================================================================
// XML Fixtures
// ============================================================================

export const XML_SIMPLE = new TextEncoder().encode(
  '<?xml version="1.0" encoding="UTF-8"?>\n<root><item id="1">Hello</item><item id="2">World</item></root>',
);

export const XML_NESTED = new TextEncoder().encode(
  `<?xml version="1.0"?>
<case>
  <metadata>
    <caseId>CASE-001</caseId>
    <analyst>Mayur</analyst>
  </metadata>
  <evidence type="document">
    <title>Report A</title>
  </evidence>
  <evidence type="image">
    <title>Screenshot B</title>
  </evidence>
</case>`,
);

export const XML_INVALID = new TextEncoder().encode(
  '<?xml version="1.0"?><root><unclosed>',
);

// ============================================================================
// PDF Fixtures (minimal valid PDF structure)
// ============================================================================

/** Minimal PDF with text content — not valid but parseable by pdfjs-dist */
export const PDF_MINIMAL = (() => {
  const header = '%PDF-1.4\n';
  const body = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const pages = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const page = '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n';
  return new TextEncoder().encode(header + body + pages + page);
})();

// ============================================================================
// DOCX Fixtures (ZIP-like bytes — will fail mammoth parsing)
// ============================================================================

/** Not a real DOCX — will trigger MALFORMED_ARTIFACT from mammoth */
export const DOCX_INVALID = new Uint8Array([
  0x50, 0x4b, 0x03, 0x04, // PK ZIP signature
  0x14, 0x00, 0x06, 0x00, // version, flags
  ...new TextEncoder().encode('not a real docx content'),
]);

// ============================================================================
// Image Fixtures
// ============================================================================

/**
 * Generate a real PNG with known readable text using @napi-rs/canvas.
 * Returns PNG bytes that tesseract.js can actually OCR.
 *
 * The image has a white background with large black "HELLO" text at a known position.
 */
export function createTextPng(text: string, opts?: { width?: number; height?: number; fontSize?: number }): Uint8Array {
  const width = opts?.width ?? 400;
  const height = opts?.height ?? 100;
  const fontSize = opts?.fontSize ?? 48;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Black text
  ctx.fillStyle = '#000000';
  ctx.font = `${fontSize}px Arial`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 20, height / 2);

  return new Uint8Array(canvas.toBuffer('image/png'));
}

/**
 * Generate a real PNG with two lines of text on separate lines.
 */
export function createMultiLineTextPng(): Uint8Array {
  const width = 400;
  const height = 200;
  const fontSize = 36;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Black text — two lines
  ctx.fillStyle = '#000000';
  ctx.font = `${fontSize}px Arial`;
  ctx.textBaseline = 'middle';
  ctx.fillText('Line one text', 20, 60);
  ctx.fillText('Line two text', 20, 140);

  return new Uint8Array(canvas.toBuffer('image/png'));
}

/**
 * Minimal PNG header — not a full image, but identifiable by magic bytes.
 * Use when you need a known-format stub that OCR will likely fail on.
 */
export const PNG_HEADER = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk (partial)
]);

/** JPEG header bytes */
export const JPEG_HEADER = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, // SOI + APP0
  0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

// ============================================================================
// XLSX Stub Fixture
// ============================================================================

export const XLSX_BYTES = new Uint8Array([
  0x50, 0x4b, 0x03, 0x04, // PK ZIP signature
  ...new TextEncoder().encode('fake xlsx'),
]);

// ============================================================================
// Empty / Edge Cases
// ============================================================================

export const EMPTY_BYTES = new Uint8Array(0);

// ============================================================================
// Mock OCR Provider (for testing OCR delegation)
//
// Returns structured lines with bounding boxes — matches real OcrResult shape.
// ============================================================================

const MOCK_OCR_LINES: readonly OcrLine[] = [
  {
    text: 'OCR extracted text',
    confidence: 0.95,
    bbox: { x0: 10, y0: 20, x1: 200, y1: 45 },
    words: [
      {
        text: 'OCR',
        confidence: 0.97,
        bbox: { x0: 10, y0: 20, x1: 50, y1: 45 },
      },
      {
        text: 'extracted',
        confidence: 0.94,
        bbox: { x0: 55, y0: 20, x1: 140, y1: 45 },
      },
      {
        text: 'text',
        confidence: 0.96,
        bbox: { x0: 145, y0: 20, x1: 200, y1: 45 },
      },
    ],
  },
];

const MOCK_OCR_MULTILINE: readonly OcrLine[] = [
  {
    text: 'First line of OCR',
    confidence: 0.93,
    bbox: { x0: 10, y0: 10, x1: 250, y1: 40 },
    words: [
      {
        text: 'First',
        confidence: 0.95,
        bbox: { x0: 10, y0: 10, x1: 70, y1: 40 },
      },
      {
        text: 'line',
        confidence: 0.92,
        bbox: { x0: 75, y0: 10, x1: 120, y1: 40 },
      },
      {
        text: 'of',
        confidence: 0.91,
        bbox: { x0: 125, y0: 10, x1: 145, y1: 40 },
      },
      {
        text: 'OCR',
        confidence: 0.94,
        bbox: { x0: 150, y0: 10, x1: 250, y1: 40 },
      },
    ],
  },
  {
    text: 'Second line of OCR',
    confidence: 0.91,
    bbox: { x0: 10, y0: 50, x1: 270, y1: 80 },
    words: [
      {
        text: 'Second',
        confidence: 0.93,
        bbox: { x0: 10, y0: 50, x1: 80, y1: 80 },
      },
      {
        text: 'line',
        confidence: 0.90,
        bbox: { x0: 85, y0: 50, x1: 130, y1: 80 },
      },
      {
        text: 'of',
        confidence: 0.89,
        bbox: { x0: 135, y0: 50, x1: 155, y1: 80 },
      },
      {
        text: 'OCR',
        confidence: 0.92,
        bbox: { x0: 160, y0: 50, x1: 270, y1: 80 },
      },
    ],
  },
];

export function createMockOcrProvider() {
  return {
    providerId: 'mock-ocr',
    providerVersion: '1.0.0',
    extract: async () => ({
      text: 'OCR extracted text from mock provider',
      confidence: 0.95,
      lines: MOCK_OCR_LINES,
      warnings: [] as import('../../src/extraction/types.js').ExtractionWarning[],
    }),
  };
}

export function createMockOcrProviderWithMultipleLines() {
  return {
    providerId: 'mock-ocr',
    providerVersion: '1.0.0',
    extract: async () => ({
      text: 'First line of OCR\nSecond line of OCR',
      confidence: 0.92,
      lines: MOCK_OCR_MULTILINE,
      warnings: [] as import('../../src/extraction/types.js').ExtractionWarning[],
    }),
  };
}

export function createFailingOcrProvider() {
  return {
    providerId: 'failing-ocr',
    providerVersion: '1.0.0',
    extract: async () => {
      throw new Error('OCR engine not available');
    },
  };
}

/**
 * Creates a mock OCR provider that records how many times extract was called.
 * Useful for verifying that normal text PDFs skip OCR entirely.
 */
export function createSpyOcrProvider() {
  let callCount = 0;
  return {
    providerId: 'spy-ocr',
    providerVersion: '1.0.0',
    get callCount() { return callCount; },
    extract: async () => {
      callCount++;
      return {
        text: 'spy OCR text',
        confidence: 0.80,
        lines: MOCK_OCR_LINES,
        warnings: [] as import('../../src/extraction/types.js').ExtractionWarning[],
      };
    },
  };
}
