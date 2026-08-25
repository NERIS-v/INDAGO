import { describe, it, expect } from 'vitest';
import { createTxtParser } from '../../src/parser/builtins/txt-parser.js';
import {
  createParserContext,
  TXT_SIMPLE,
  TXT_SINGLE_LINE,
  TXT_CRLF,
  TXT_EMPTY_LINES,
  TXT_UNICODE,
  TXT_LONG,
  EMPTY_BYTES,
} from './fixtures.js';

describe('TXT Parser', () => {
  const parser = createTxtParser();

  it('parses multi-line text with correct line numbers and offsets', async () => {
    const result = await parser.parse(TXT_SIMPLE, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ext = result.extraction;
    expect(ext.format).toBe('TXT');
    expect(ext.extractionMethod).toBe('text-decode');
    expect(ext.parserId).toBe('txt-parser');
    expect(ext.lines).toHaveLength(3);

    expect(ext.lines[0]!.lineNumber).toBe(1);
    expect(ext.lines[0]!.text).toBe('Hello, INDAGO!');
    expect(ext.lines[0]!.sourceLocation.kind).toBe('txt-line');
    expect(ext.lines[0]!.sourceLocation.charStart).toBe(0);
    expect(ext.lines[0]!.sourceLocation.charEnd).toBe(14);

    expect(ext.lines[1]!.lineNumber).toBe(2);
    expect(ext.lines[1]!.text).toBe('Line two.');

    expect(ext.lines[2]!.lineNumber).toBe(3);
    expect(ext.lines[2]!.text).toBe('Line three.');
  });

  it('parses single line', async () => {
    const result = await parser.parse(TXT_SINGLE_LINE, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.lines).toHaveLength(1);
    expect(result.extraction.lines[0]!.text).toBe('Single line of text.');
  });

  it('handles CRLF line endings', async () => {
    const result = await parser.parse(TXT_CRLF, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.lines).toHaveLength(3);
    expect(result.extraction.lines[0]!.text).toBe('Line one');
    expect(result.extraction.lines[1]!.text).toBe('Line two');
    expect(result.extraction.lines[2]!.text).toBe('Line three');
  });

  it('handles empty lines', async () => {
    const result = await parser.parse(TXT_EMPTY_LINES, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.lines).toHaveLength(4);
    expect(result.extraction.lines[0]!.text).toBe('First');
    expect(result.extraction.lines[1]!.text).toBe('');
    expect(result.extraction.lines[2]!.text).toBe('');
    expect(result.extraction.lines[3]!.text).toBe('Last');
  });

  it('handles unicode content', async () => {
    const result = await parser.parse(TXT_UNICODE, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.lines[0]!.text).toContain('Caf');
    expect(result.extraction.lines[0]!.text).toContain('\u65e5\u672c\u8a9e');
  });

  it('returns EMPTY_CONTENT for empty bytes', async () => {
    const result = await parser.parse(EMPTY_BYTES, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.lines).toHaveLength(0);
    expect(result.extraction.warnings).toHaveLength(1);
    expect(result.extraction.warnings[0]!.code).toBe('EMPTY_CONTENT');
  });

  it('truncates when maxLines limit is exceeded', async () => {
    const result = await parser.parse(TXT_LONG, createParserContext({
      limits: { maxLines: 10 },
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.lines).toHaveLength(10);
    expect(result.extraction.lines[0]!.text).toBe('Line 1 of 200');
    expect(result.extraction.lines[9]!.text).toBe('Line 10 of 200');
    const truncated = result.extraction.warnings.find((w) => w.code === 'TRUNCATED_OUTPUT');
    expect(truncated).toBeDefined();
  });

  it('has deterministic output for same input', async () => {
    const ctx = createParserContext({ artifactId: 'det-1' });
    const r1 = await parser.parse(TXT_SIMPLE, ctx);
    const r2 = await parser.parse(TXT_SIMPLE, ctx);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.extraction.lines).toEqual(r2.extraction.lines);
      // extractedAt is the only nondeterministic field
      expect(r1.extraction.lines).toEqual(r2.extraction.lines);
    }
  });

  it('does NOT create observations or entities', async () => {
    const result = await parser.parse(TXT_SIMPLE, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ext = result.extraction as Record<string, unknown>;
    expect(ext.observations).toBeUndefined();
    expect(ext.entities).toBeUndefined();
    expect(ext.entityHypotheses).toBeUndefined();
    expect(ext.relationHypotheses).toBeUndefined();
    expect(ext.graphNodes).toBeUndefined();
    expect(ext.graphEdges).toBeUndefined();
  });
});
