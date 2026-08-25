import { describe, it, expect } from 'vitest';
import { createJsonParser } from '../../src/parser/builtins/json-parser.js';
import {
  createParserContext,
  JSON_OBJECT,
  JSON_ARRAY,
  JSON_NESTED,
  JSON_INVALID,
  JSON_EMPTY,
} from './fixtures.js';

describe('JSON Parser', () => {
  const parser = createJsonParser();

  it('parses a JSON object and preserves structure', async () => {
    const result = await parser.parse(JSON_OBJECT, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ext = result.extraction;
    expect(ext.format).toBe('JSON');
    expect(ext.extractionMethod).toBe('json-parse');
    expect(ext.parserId).toBe('json-parser');
    expect(ext.sourceLocation.kind).toBe('json-root');
    expect(ext.data).toEqual({ name: 'INDAGO', version: 7, active: true });
  });

  it('parses a JSON array', async () => {
    const result = await parser.parse(JSON_ARRAY, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.extraction.data)).toBe(true);
    expect((result.extraction.data as unknown[])).toHaveLength(2);
  });

  it('parses nested JSON', async () => {
    const result = await parser.parse(JSON_NESTED, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.extraction.data as Record<string, unknown>;
    expect(data.metadata).toBeDefined();
    expect(data.evidence).toBeDefined();
  });

  it('returns MALFORMED_ARTIFACT for invalid JSON', async () => {
    const result = await parser.parse(JSON_INVALID, createParserContext());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.category).toBe('MALFORMED_ARTIFACT');
    expect(result.error.code).toBe('INVALID_JSON');
    expect(result.error.sourceId).toBe('test-artifact');
  });

  it('returns EMPTY_CONTENT for empty bytes', async () => {
    const result = await parser.parse(JSON_EMPTY, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.data).toBeNull();
    expect(result.extraction.warnings).toHaveLength(1);
    expect(result.extraction.warnings[0]!.code).toBe('EMPTY_CONTENT');
  });

  it('does NOT create observations or entities', async () => {
    const result = await parser.parse(JSON_OBJECT, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ext = result.extraction as Record<string, unknown>;
    expect(ext.observations).toBeUndefined();
    expect(ext.entities).toBeUndefined();
    expect(ext.entityHypotheses).toBeUndefined();
    expect(ext.relationHypotheses).toBeUndefined();
  });
});
