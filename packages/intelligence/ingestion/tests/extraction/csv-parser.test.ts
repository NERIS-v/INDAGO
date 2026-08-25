import { describe, it, expect } from 'vitest';
import { createCsvParser } from '../../src/parser/builtins/csv-parser.js';
import {
  createParserContext,
  CSV_SIMPLE,
  CSV_TSV,
  CSV_QUOTED,
  CSV_SINGLE_HEADER,
  EMPTY_BYTES,
} from './fixtures.js';

describe('CSV Parser', () => {
  const parser = createCsvParser();

  it('parses simple CSV with headers and records', async () => {
    const result = await parser.parse(CSV_SIMPLE, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ext = result.extraction;
    expect(ext.format).toBe('CSV');
    expect(ext.extractionMethod).toBe('csv-parse');
    expect(ext.parserId).toBe('csv-parser');
    expect(ext.headers).toEqual(['name', 'age', 'city']);
    expect(ext.records).toHaveLength(3);

    // First record
    expect(ext.records[0]!.rowNumber).toBe(1);
    expect(ext.records[0]!.cells[0]!.columnName).toBe('name');
    expect(ext.records[0]!.cells[0]!.rawValue).toBe('Alice');
    expect(ext.records[0]!.cells[0]!.sourceLocation.kind).toBe('csv-cell');
    expect(ext.records[0]!.cells[0]!.sourceLocation.columnIndex).toBe(0);

    // Second record
    expect(ext.records[1]!.cells[1]!.columnName).toBe('age');
    expect(ext.records[1]!.cells[1]!.rawValue).toBe('25');
  });

  it('parses TSV content (treated as single-column when delimiter not detected)', async () => {
    const result = await parser.parse(CSV_TSV, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // CSV parser uses comma delimiter by default; TSV tab-separated content
    // is treated as single-column. This is expected behavior — delimiter
    // detection is not in M-PR3 scope.
    expect(result.extraction.records.length).toBeGreaterThan(0);
  });

  it('handles quoted fields with escaped delimiters', async () => {
    const result = await parser.parse(CSV_QUOTED, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.records[0]!.cells[1]!.rawValue).toContain('comma');
    expect(result.extraction.records[1]!.cells[1]!.rawValue).toContain('quotes');
  });

  it('parses single-header CSV', async () => {
    const result = await parser.parse(CSV_SINGLE_HEADER, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.headers).toEqual(['id']);
    expect(result.extraction.records).toHaveLength(3);
  });

  it('returns EMPTY_CONTENT for empty bytes', async () => {
    const result = await parser.parse(EMPTY_BYTES, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.headers).toHaveLength(0);
    expect(result.extraction.records).toHaveLength(0);
    expect(result.extraction.warnings[0]!.code).toBe('EMPTY_CONTENT');
  });

  it('truncates when maxRecords limit is exceeded', async () => {
    const result = await parser.parse(CSV_SIMPLE, createParserContext({
      limits: { maxRecords: 1 },
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.records).toHaveLength(1);
    expect(result.extraction.records[0]!.cells[0]!.rawValue).toBe('Alice');
    const truncated = result.extraction.warnings.find((w) => w.code === 'TRUNCATED_OUTPUT');
    expect(truncated).toBeDefined();
  });

  it('preserves source locations for all cells', async () => {
    const result = await parser.parse(CSV_SIMPLE, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const record of result.extraction.records) {
      for (const cell of record.cells) {
        expect(cell.sourceLocation.kind).toBe('csv-cell');
        expect(cell.sourceLocation.rowNumber).toBe(record.rowNumber);
        expect(cell.sourceLocation.columnIndex).toBe(cell.columnIndex);
        expect(cell.sourceLocation.columnName).toBe(cell.columnName);
      }
    }
  });

  it('does NOT create observations or entities', async () => {
    const result = await parser.parse(CSV_SIMPLE, createParserContext());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ext = result.extraction as Record<string, unknown>;
    expect(ext.observations).toBeUndefined();
    expect(ext.entities).toBeUndefined();
  });
});
