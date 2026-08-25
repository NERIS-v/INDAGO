// ============================================================================
// OCR Integration Tests
//
// Real tesseract.js OCR on real images AND real PDFs.
// Validates the full pipeline: bytes -> parser -> OCR -> structured output.
//
// Scenarios:
// 1. Real image OCR — single-line
// 2. Real image OCR — multi-line
// 3. Real scanned PDF OCR — image-only PDF via real tesseract
// 4. PDF OCR bounding boxes — verify bbox provenance from OCR provider
// 5. Normal text PDF skips OCR — spy provider with callCount === 0
// 6. Mixed PDF — text page + scanned page + text page -> per-page methods
// 7. OCR failure handling — graceful degradation, no fabricated text
// 8. PDF/page provenance — pageTextOffset correctness
// ============================================================================

import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { createTesseractOcrProvider } from '../../src/extraction/tesseract-ocr-provider.js';
import { createImageParser } from '../../src/parser/builtins/image-parser.js';
import { createPdfParser } from '../../src/parser/builtins/pdf-parser.js';
import {
  createTextPng,
  createMultiLineTextPng,
  createParserContext,
  createSpyOcrProvider,
  createFailingOcrProvider,
} from './fixtures.js';

// ============================================================================
// Helpers
// ============================================================================

/** Create a valid PDF with embedded text on one page */
async function createTextPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.drawText('Hello from PDF text layer', { x: 50, y: 700, size: 24 });
  page.drawText('Second line of text', { x: 50, y: 650, size: 18 });
  return new Uint8Array(await doc.save());
}

/** Create a valid PDF with text on multiple pages */
async function createMultiPagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Page ${i + 1} content`, { x: 50, y: 700, size: 24 });
  }
  return new Uint8Array(await doc.save());
}

/** Create a PDF with only an embedded image — no text layer */
async function createImageOnlyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);

  const pngBytes = createTextPng('SCANNED TEXT', { width: 400, height: 100, fontSize: 48 });
  const image = await doc.embedPng(pngBytes);
  page.drawImage(image, { x: 50, y: 600, width: 400, height: 100 });

  return new Uint8Array(await doc.save());
}

/**
 * Create a mixed PDF:
 *   Page 1: embedded text
 *   Page 2: image-only (scanned)
 *   Page 3: embedded text
 */
async function createMixedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  // Page 1 — text
  const page1 = doc.addPage([612, 792]);
  page1.drawText('Page one text content', { x: 50, y: 700, size: 24 });

  // Page 2 — image-only
  const page2 = doc.addPage([612, 792]);
  const pngBytes = createTextPng('SCANNED PAGE TWO', { width: 400, height: 100, fontSize: 48 });
  const image = await doc.embedPng(pngBytes);
  page2.drawImage(image, { x: 50, y: 600, width: 400, height: 100 });

  // Page 3 — text
  const page3 = doc.addPage([612, 792]);
  page3.drawText('Page three text content', { x: 50, y: 700, size: 24 });

  return new Uint8Array(await doc.save());
}

// ============================================================================
// 1. Real Image OCR — Single-Line
// ============================================================================

describe('Real OCR — Image Parser', () => {
  const ocrProvider = createTesseractOcrProvider();
  const imageParser = createImageParser();

  it('performs real OCR on a single-line text image', async () => {
    const imageBytes = createTextPng('HELLO');
    const result = await imageParser.parse(imageBytes, createParserContext({ ocrProvider }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ext = result.extraction;
    expect(ext.format).toBe('IMAGE');
    expect(ext.extractionMethod).toBe('ocr');
    expect(ext.text).toBeDefined();
    expect(ext.text!.trim().length).toBeGreaterThan(0);

    expect(ext.ocrConfidence).toBeDefined();
    expect(ext.ocrConfidence!).toBeGreaterThanOrEqual(0);
    expect(ext.ocrConfidence!).toBeLessThanOrEqual(1);
  }, 30_000);

  // ============================================================================
  // 2. Real Image OCR — Multi-Line
  // ============================================================================

  it('performs real OCR on a multi-line text image', async () => {
    const imageBytes = createMultiLineTextPng();
    const result = await imageParser.parse(imageBytes, createParserContext({ ocrProvider }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ext = result.extraction;
    expect(ext.text).toBeDefined();
    expect(ext.text!.trim().length).toBeGreaterThan(0);

    expect(ext.ocrLines).toBeDefined();
    expect(ext.ocrLines!.length).toBeGreaterThan(0);

    for (const line of ext.ocrLines!) {
      expect(line.text).toBeDefined();
      expect(line.text.length).toBeGreaterThan(0);
      expect(line.confidence).toBeGreaterThanOrEqual(0);
      expect(line.confidence).toBeLessThanOrEqual(1);
      expect(line.bbox).toBeDefined();
      expect(line.bbox.x0).toBeGreaterThanOrEqual(0);
      expect(line.bbox.y0).toBeGreaterThanOrEqual(0);
      expect(line.bbox.x1).toBeGreaterThan(line.bbox.x0);
      expect(line.bbox.y1).toBeGreaterThan(line.bbox.y0);
      expect(line.words.length).toBeGreaterThan(0);
    }
  }, 30_000);

  // ============================================================================
  // 4. PDF OCR Bounding Boxes — verify bbox provenance
  // ============================================================================

  it('bounding boxes are provider-derived, not fabricated', async () => {
    const imageBytes = createTextPng('TEST');
    const result = await imageParser.parse(imageBytes, createParserContext({ ocrProvider }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ext = result.extraction;
    expect(ext.ocrLines).toBeDefined();
    const allWords = ext.ocrLines!.flatMap((l) => l.words);
    expect(allWords.length).toBeGreaterThan(0);

    for (const line of ext.ocrLines!) {
      if (line.words.length > 1) {
        const firstWord = line.words[0]!;
        const lastWord = line.words[line.words.length - 1]!;
        expect(lastWord.bbox.x0).toBeGreaterThanOrEqual(firstWord.bbox.x0);
      }
    }
  }, 30_000);
});

// ============================================================================
// 3. Real Scanned PDF OCR — image-only PDF via real tesseract
// ============================================================================

describe('Real PDF — OCR Fallback', () => {
  const pdfParser = createPdfParser();

  it('OCR fallback works on image-only PDF pages', async () => {
    const pdfBytes = await createImageOnlyPdf();
    const ocrProvider = createTesseractOcrProvider();
    const result = await pdfParser.parse(pdfBytes, createParserContext({ ocrProvider }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ext = result.extraction;
    expect(['ocr', 'mixed']).toContain(ext.extractionMethod);

    const allSpans = ext.pages.flatMap((p) => p.spans);
    expect(allSpans.length).toBeGreaterThan(0);

    for (const span of allSpans) {
      expect(span.sourceLocation.kind).toBe('pdf-page');
      expect(span.sourceLocation.boundingBox).toBeDefined();
      expect(span.sourceLocation.pageTextOffset).toBeDefined();
      expect(span.sourceLocation.pageTextOffset!.start).toBeGreaterThanOrEqual(0);
      expect(span.sourceLocation.pageTextOffset!.end).toBeGreaterThan(
        span.sourceLocation.pageTextOffset!.start,
      );
    }
  }, 60_000);

  // ============================================================================
  // 7. OCR Failure Handling — graceful degradation
  // ============================================================================

  it('OCR failure produces warning, preserves empty page, does not fabricate text', async () => {
    const pdfBytes = await createImageOnlyPdf();
    const failingOcr = createFailingOcrProvider();
    const result = await pdfParser.parse(pdfBytes, createParserContext({ ocrProvider: failingOcr }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ext = result.extraction;
    // Extraction should still succeed — OCR failure is non-fatal
    expect(ext.format).toBe('PDF');
    expect(ext.pages.length).toBe(1);

    // The page should have no spans (OCR failed)
    expect(ext.pages[0]!.spans.length).toBe(0);

    // A warning should indicate OCR failure
    const ocrWarning = ext.warnings.find(
      (w) => w.code === 'OCR_FALLBACK_USED' && w.message.includes('OCR failed'),
    );
    expect(ocrWarning).toBeDefined();
    expect(ocrWarning!.details).toBeDefined();
    expect((ocrWarning!.details as Record<string, unknown>).pageNumber).toBe(1);

    // No fabricated text
    const allText = ext.pages.flatMap((p) => p.spans).map((s) => s.text).join('');
    expect(allText.trim().length).toBe(0);
  }, 60_000);
});

// ============================================================================
// 5. Normal Text PDF Skips OCR
// ============================================================================

describe('Real PDF — Text Layer Extraction', () => {
  const pdfParser = createPdfParser();

  it('extracts text from a real PDF with embedded text layer', async () => {
    const pdfBytes = await createTextPdf();
    const result = await pdfParser.parse(pdfBytes, createParserContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ext = result.extraction;
    expect(ext.format).toBe('PDF');
    expect(ext.extractionMethod).toBe('text-layer');
    expect(ext.pages.length).toBe(1);
    expect(ext.pages[0]!.spans.length).toBeGreaterThan(0);

    const allText = ext.pages[0]!.spans.map((s) => s.text).join('');
    for (const span of ext.pages[0]!.spans) {
      const loc = span.sourceLocation;
      expect(loc.kind).toBe('pdf-page');
      expect(loc.pageNumber).toBe(1);
      expect(loc.pageTextOffset).toBeDefined();
      expect(loc.pageTextOffset!.start).toBeGreaterThanOrEqual(0);
      expect(loc.pageTextOffset!.end).toBeGreaterThan(loc.pageTextOffset!.start);
      expect(allText.substring(loc.pageTextOffset!.start, loc.pageTextOffset!.end)).toBe(span.text);
    }
  }, 15_000);

  it('normal text PDF skips OCR — zero OCR invocations', async () => {
    const pdfBytes = await createTextPdf();
    const spyOcr = createSpyOcrProvider();
    const result = await pdfParser.parse(pdfBytes, createParserContext({ ocrProvider: spyOcr }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.extraction.extractionMethod).toBe('text-layer');
    expect(spyOcr.callCount).toBe(0);
  }, 15_000);

  it('multi-page PDF has correct per-page offsets', async () => {
    const pdfBytes = await createMultiPagePdf();
    const result = await pdfParser.parse(pdfBytes, createParserContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ext = result.extraction;
    expect(ext.pages.length).toBe(3);

    for (let i = 0; i < 3; i++) {
      const page = ext.pages[i]!;
      expect(page.pageNumber).toBe(i + 1);
      expect(page.spans.length).toBeGreaterThan(0);

      const firstSpan = page.spans[0]!;
      expect(firstSpan.sourceLocation.pageTextOffset!.start).toBe(0);
    }
  }, 15_000);

  it('respects maxPages limit on real PDF', async () => {
    const pdfBytes = await createMultiPagePdf();
    const result = await pdfParser.parse(pdfBytes, createParserContext({
      limits: { maxPages: 2 },
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.extraction.pages.length).toBe(2);
    const truncated = result.extraction.warnings.find((w) => w.code === 'TRUNCATED_OUTPUT');
    expect(truncated).toBeDefined();
  }, 15_000);

  // ============================================================================
  // 6. Mixed PDF — text + scanned + text -> per-page methods
  // ============================================================================

  it('mixed PDF uses text-layer for text pages and OCR for scanned pages', async () => {
    const pdfBytes = await createMixedPdf();
    const ocrProvider = createTesseractOcrProvider();
    const result = await pdfParser.parse(pdfBytes, createParserContext({ ocrProvider }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ext = result.extraction;
    expect(ext.pages.length).toBe(3);

    // Overall method should be 'mixed'
    expect(ext.extractionMethod).toBe('mixed');

    // Page 1 should have text-layer content
    const page1 = ext.pages[0]!;
    expect(page1.pageNumber).toBe(1);
    expect(page1.spans.length).toBeGreaterThan(0);

    // Page 2 should have OCR content (scanned image)
    const page2 = ext.pages[1]!;
    expect(page2.pageNumber).toBe(2);
    expect(page2.spans.length).toBeGreaterThan(0);

    // Page 3 should have text-layer content
    const page3 = ext.pages[2]!;
    expect(page3.pageNumber).toBe(3);
    expect(page3.spans.length).toBeGreaterThan(0);
  }, 90_000);
});

// ============================================================================
// 8. PDF/Page Provenance — pageTextOffset correctness
// ============================================================================

describe('PDF Provenance', () => {
  const pdfParser = createPdfParser();

  it('pageTextOffset refers to offsets within extracted page text, not PDF binary', async () => {
    const pdfBytes = await createTextPdf();
    const result = await pdfParser.parse(pdfBytes, createParserContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const page = result.extraction.pages[0]!;
    const fullPageText = page.spans.map((s) => s.text).join('');

    for (const span of page.spans) {
      const loc = span.sourceLocation;
      expect(loc.kind).toBe('pdf-page');
      expect(loc.pageNumber).toBe(1);

      const offset = loc.pageTextOffset!;
      // Offset must be within the bounds of the extracted page text
      expect(offset.start).toBeGreaterThanOrEqual(0);
      expect(offset.end).toBeLessThanOrEqual(fullPageText.length);
      expect(offset.end).toBeGreaterThan(offset.start);

      // The substring at these offsets must match the span text exactly
      const extracted = fullPageText.substring(offset.start, offset.end);
      expect(extracted).toBe(span.text);
    }
  }, 15_000);

  it('each page resets pageTextOffset to start from 0', async () => {
    const pdfBytes = await createMultiPagePdf();
    const result = await pdfParser.parse(pdfBytes, createParserContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const page of result.extraction.pages) {
      // Every page's first span should have pageTextOffset.start === 0
      const firstSpan = page.spans[0]!;
      expect(firstSpan.sourceLocation.pageTextOffset!.start).toBe(0);

      // Verify the offsets reconstruct the page text correctly
      const pageText = page.spans.map((s) => s.text).join('');
      for (const span of page.spans) {
        const offset = span.sourceLocation.pageTextOffset!;
        expect(pageText.substring(offset.start, offset.end)).toBe(span.text);
      }
    }
  }, 15_000);

  it('OCR pages carry bounding boxes from the OCR provider', async () => {
    const pdfBytes = await createImageOnlyPdf();
    const ocrProvider = createTesseractOcrProvider();
    const result = await pdfParser.parse(pdfBytes, createParserContext({ ocrProvider }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const allSpans = result.extraction.pages.flatMap((p) => p.spans);
    expect(allSpans.length).toBeGreaterThan(0);

    for (const span of allSpans) {
      expect(span.sourceLocation.kind).toBe('pdf-page');
      expect(span.sourceLocation.boundingBox).toBeDefined();
      const bbox = span.sourceLocation.boundingBox!;
      expect(bbox.x).toBeGreaterThanOrEqual(0);
      expect(bbox.y).toBeGreaterThanOrEqual(0);
      expect(bbox.w).toBeGreaterThan(0);
      expect(bbox.h).toBeGreaterThan(0);
    }
  }, 60_000);
});
