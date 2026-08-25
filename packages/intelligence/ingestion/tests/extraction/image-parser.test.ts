import { describe, it, expect } from 'vitest';
import { createImageParser } from '../../src/parser/builtins/image-parser.js';
import {
  createParserContext,
  createMockOcrProvider,
  createFailingOcrProvider,
  createTextPng,
  PNG_HEADER,
  JPEG_HEADER,
  EMPTY_BYTES,
} from './fixtures.js';

describe('Image Parser', () => {
  const parser = createImageParser();

  it('returns unsupported when no OcrProvider is injected', async () => {
    const imageBytes = createTextPng('HELLO');
    const result = await parser.parse(imageBytes, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.extraction.format).toBe('IMAGE');
    expect(result.extraction.extractionMethod).toBe('unsupported');
    expect(result.extraction.warnings).toHaveLength(1);
    expect(result.extraction.warnings[0]!.code).toBe('UNSUPPORTED_FEATURE');
  });

  it('returns EMPTY_CONTENT for empty bytes', async () => {
    const result = await parser.parse(EMPTY_BYTES, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.warnings[0]!.code).toBe('EMPTY_CONTENT');
  });

  it('delegates to OcrProvider when available', async () => {
    const ocrProvider = createMockOcrProvider();
    const imageBytes = createTextPng('HELLO');
    const result = await parser.parse(imageBytes, createParserContext({ ocrProvider }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.extraction.extractionMethod).toBe('ocr');
    expect(result.extraction.text).toBe('OCR extracted text from mock provider');
    expect(result.extraction.ocrConfidence).toBe(0.95);
  });

  it('returns structured ocrLines with bounding boxes from OCR provider', async () => {
    const ocrProvider = createMockOcrProvider();
    const imageBytes = createTextPng('HELLO');
    const result = await parser.parse(imageBytes, createParserContext({ ocrProvider }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ext = result.extraction;
    expect(ext.extractionMethod).toBe('ocr');

    // Verify ocrLines are passed through from OCR provider
    expect(ext.ocrLines).toBeDefined();
    expect(ext.ocrLines!.length).toBe(1);

    const line = ext.ocrLines![0]!;
    expect(line.text).toBe('OCR extracted text');
    expect(line.confidence).toBeCloseTo(0.95);
    expect(line.bbox).toEqual({ x0: 10, y0: 20, x1: 200, y1: 45 });
    expect(line.words).toHaveLength(3);
    expect(line.words[0]!.text).toBe('OCR');
    expect(line.words[0]!.bbox.x0).toBe(10);
  });

  it('returns unsupported (not crash) when OcrProvider throws', async () => {
    const ocrProvider = createFailingOcrProvider();
    const imageBytes = createTextPng('HELLO');
    const result = await parser.parse(imageBytes, createParserContext({ ocrProvider }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.extractionMethod).toBe('unsupported');
    expect(result.extraction.warnings.some((w) => w.code === 'OCR_FALLBACK_USED')).toBe(true);
  });

  it('detects JPEG header for OCR provider', async () => {
    const ocrProvider = createMockOcrProvider();
    const result = await parser.parse(JPEG_HEADER, createParserContext({ ocrProvider }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.extractionMethod).toBe('ocr');
  });

  it('does NOT create observations or entities', async () => {
    const ocrProvider = createMockOcrProvider();
    const imageBytes = createTextPng('HELLO');
    const result = await parser.parse(imageBytes, createParserContext({ ocrProvider }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ext = result.extraction as Record<string, unknown>;
    expect(ext.observations).toBeUndefined();
    expect(ext.entities).toBeUndefined();
  });

  it('parserVersion is 2.0.0', () => {
    expect(parser.capability.parserVersion).toBe('2.0.0');
  });
});
