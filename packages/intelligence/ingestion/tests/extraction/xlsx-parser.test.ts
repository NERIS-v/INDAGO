import { describe, it, expect } from 'vitest';
import { createXlsxParser } from '../../src/parser/builtins/xlsx-parser.js';
import { createParserContext, XLSX_BYTES, EMPTY_BYTES } from './fixtures.js';

describe('XLSX Parser (Stub)', () => {
  const parser = createXlsxParser();

  it('returns EXTRACTION_FAILED with XLSX_NOT_IMPLEMENTED', async () => {
    const result = await parser.parse(XLSX_BYTES, createParserContext());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.category).toBe('EXTRACTION_FAILED');
    expect(result.error.code).toBe('XLSX_NOT_IMPLEMENTED');
    expect(result.error.sourceId).toBe('test-artifact');
  });

  it('returns error even for empty bytes', async () => {
    const result = await parser.parse(EMPTY_BYTES, createParserContext());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.category).toBe('EXTRACTION_FAILED');
  });

  it('parser capability declares XLSX format', () => {
    expect(parser.capability.supportedFormats).toContain('XLSX');
    expect(parser.capability.parserId).toBe('xlsx-parser');
    expect(parser.capability.parserVersion).toBe('0.1.0');
  });

  it('canParse returns true for XLSX classification', () => {
    expect(parser.canParse({
      artifactId: 'test',
      contentHash: 'test',
      detectedMimeType: 'text/plain',
      format: 'XLSX',
      family: 'SPREADSHEET',
      encoding: 'BINARY',
      confidence: 'definite',
      detectionMethod: 'mime-detection',
      originalFilename: undefined,
    })).toBe(true);
  });

  it('canParse returns false for non-XLSX format', () => {
    expect(parser.canParse({
      artifactId: 'test',
      contentHash: 'test',
      detectedMimeType: 'text/csv',
      format: 'CSV',
      family: 'STRUCTURED_DATA',
      encoding: 'UTF8',
      confidence: 'definite',
      detectionMethod: 'mime-detection',
      originalFilename: undefined,
    })).toBe(false);
  });
});
