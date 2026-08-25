import { describe, it, expect } from 'vitest';
import { ParserRegistry } from '../../src/parser/parser-registry.js';
import { createPdfParser } from '../../src/parser/builtins/pdf-parser.js';
import { createCsvParser } from '../../src/parser/builtins/csv-parser.js';
import { createJsonParser } from '../../src/parser/builtins/json-parser.js';
import { createTxtParser } from '../../src/parser/builtins/txt-parser.js';

// ============================================================================
// Parser Registry Tests
//
// Verifies registration, lookup, duplicate rejection.
// ============================================================================

describe('ParserRegistry', () => {
  it('registers a parser', () => {
    const registry = new ParserRegistry();
    registry.register(createPdfParser());
    expect(registry.size).toBe(1);
    expect(registry.has('pdf-parser')).toBe(true);
  });

  it('registers multiple parsers', () => {
    const registry = new ParserRegistry();
    registry.register(createPdfParser());
    registry.register(createCsvParser());
    registry.register(createJsonParser());
    registry.register(createTxtParser());
    expect(registry.size).toBe(4);
  });

  it('rejects duplicate parserId', () => {
    const registry = new ParserRegistry();
    registry.register(createPdfParser());
    expect(() => registry.register(createPdfParser())).toThrow(
      'Parser already registered: pdf-parser',
    );
  });

  it('gets parser by ID', () => {
    const registry = new ParserRegistry();
    const pdf = createPdfParser();
    registry.register(pdf);
    expect(registry.getById('pdf-parser')).toBe(pdf);
  });

  it('returns undefined for unknown parserId', () => {
    const registry = new ParserRegistry();
    expect(registry.getById('unknown')).toBeUndefined();
  });

  it('gets parsers by format', () => {
    const registry = new ParserRegistry();
    registry.register(createPdfParser());
    registry.register(createCsvParser());
    const pdfParsers = registry.getByFormat('PDF');
    expect(pdfParsers.length).toBe(1);
    expect(pdfParsers[0]!.capability.parserId).toBe('pdf-parser');
  });

  it('gets parsers by MIME type', () => {
    const registry = new ParserRegistry();
    registry.register(createPdfParser());
    const pdfParsers = registry.getByMimeType('application/pdf');
    expect(pdfParsers.length).toBe(1);
    expect(pdfParsers[0]!.capability.parserId).toBe('pdf-parser');
  });

  it('gets parsers by family', () => {
    const registry = new ParserRegistry();
    registry.register(createPdfParser());
    registry.register(createCsvParser());
    const docParsers = registry.getByFamily('DOCUMENT');
    expect(docParsers.length).toBe(1);
    expect(docParsers[0]!.capability.parserId).toBe('pdf-parser');
  });

  it('lists all registered parsers', () => {
    const registry = new ParserRegistry();
    registry.register(createPdfParser());
    registry.register(createCsvParser());
    const all = registry.list();
    expect(all.length).toBe(2);
    const ids = all.map((p) => p.capability.parserId).sort();
    expect(ids).toEqual(['csv-parser', 'pdf-parser']);
  });

  it('returns empty array for unknown format', () => {
    const registry = new ParserRegistry();
    expect(registry.getByFormat('UNKNOWN')).toEqual([]);
  });

  it('returns false for has with unknown parserId', () => {
    const registry = new ParserRegistry();
    expect(registry.has('unknown')).toBe(false);
  });

  it('size is 0 for empty registry', () => {
    const registry = new ParserRegistry();
    expect(registry.size).toBe(0);
  });
});
