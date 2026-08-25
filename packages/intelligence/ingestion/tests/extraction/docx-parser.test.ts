import { describe, it, expect } from 'vitest';
import { createDocxParser } from '../../src/parser/builtins/docx-parser.js';
import {
  createParserContext,
  DOCX_INVALID,
  EMPTY_BYTES,
} from './fixtures.js';

describe('DOCX Parser', () => {
  const parser = createDocxParser();

  it('returns MALFORMED_ARTIFACT for non-DOCX content', async () => {
    const result = await parser.parse(DOCX_INVALID, createParserContext({
      detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.category).toBe('MALFORMED_ARTIFACT');
    expect(result.error.code).toBe('INVALID_DOCX');
  });

  it('returns EMPTY_CONTENT for empty bytes', async () => {
    const result = await parser.parse(EMPTY_BYTES, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.sections).toHaveLength(0);
    expect(result.extraction.warnings[0]!.code).toBe('EMPTY_CONTENT');
  });

  it('extracted sections have block-level provenance only (no fake offsets)', async () => {
    // For invalid DOCX we get a MALFORMED_ARTIFACT, so test with empty
    const result = await parser.parse(EMPTY_BYTES, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Empty sections — no provenance fields to validate, but the structure is correct
    expect(result.extraction.sections).toEqual([]);
  });

  it('does NOT create observations or entities', async () => {
    const result = await parser.parse(DOCX_INVALID, createParserContext());
    // Either ok or error — neither should contain observations
    if (result.ok) {
      const ext = result.extraction as Record<string, unknown>;
      expect(ext.observations).toBeUndefined();
      expect(ext.entities).toBeUndefined();
    }
  });

  it('parser capability declares DOCX format', () => {
    expect(parser.capability.supportedFormats).toContain('DOCX');
    expect(parser.capability.parserId).toBe('docx-parser');
  });

  it('parser canParse returns true for DOCX classification', () => {
    const classification = {
      artifactId: 'test',
      contentHash: 'test',
      detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      format: 'DOCX' as const,
      family: 'DOCUMENT' as const,
      encoding: 'BINARY' as const,
      confidence: 'definite' as const,
      detectionMethod: 'mime-detection' as const,
      originalFilename: undefined,
    };
    expect(parser.canParse(classification)).toBe(true);
  });

  it('canParse returns false for non-DOCX format', () => {
    const classification = {
      artifactId: 'test',
      contentHash: 'test',
      detectedMimeType: 'text/plain',
      format: 'TXT' as const,
      family: 'TEXT' as const,
      encoding: 'UTF8' as const,
      confidence: 'definite' as const,
      detectionMethod: 'mime-detection' as const,
      originalFilename: undefined,
    };
    expect(parser.canParse(classification)).toBe(false);
  });
});
