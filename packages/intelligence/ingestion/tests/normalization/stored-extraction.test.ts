import { describe, it, expect } from 'vitest';
import {
  parseStoredRawExtraction,
  RawExtractionBodySchema,
} from '../../src/normalization/stored-extraction.js';
import type {
  RawExtraction,
  ExtractionWarning,
} from '../../src/extraction/types.js';

// ============================================================================
// M-A05 Stored RawExtraction Rehydration — Unit Tests
//
// The re-entrant worker path re-derives a typed RawExtraction from the
// durably persisted Prisma row. Only the 8 projected fields are passed
// (never the Prisma surrogate `id` / `createdAt`). Validation is strict:
// a row that validates here is structurally identical to extraction-time.
// ============================================================================

const LONG_UUID = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

interface StoredRow {
  attemptId: string;
  artifactId: string;
  parserId: string;
  parserVersion: string;
  format: string;
  extraction: unknown;
  warnings: readonly ExtractionWarning[] | null;
  extractedAt: string | Date;
}

function makeRow(partial: Partial<StoredRow> = {}): StoredRow {
  return {
    attemptId: LONG_UUID(2),
    artifactId: LONG_UUID(1),
    parserId: 'indago-txt-parser',
    parserVersion: '1.0.0',
    format: 'TXT',
    extraction: {
      format: 'TXT',
      extractionMethod: 'text-decode',
      lines: [
        { lineNumber: 1, text: 'hello world', sourceLocation: { kind: 'txt-line', lineNumber: 1, charStart: 0, charEnd: 11 } },
      ],
    },
    warnings: [],
    extractedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('M-A05 parseStoredRawExtraction: round-trips', () => {
  it('rehydrates a TXT extraction (string extractedAt)', () => {
    const raw = parseStoredRawExtraction(makeRow());
    expect(raw.format).toBe('TXT');
    expect(raw.artifactId).toBe(LONG_UUID(1));
    expect(raw.parserId).toBe('indago-txt-parser');
    expect(raw.extractedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(raw.lines[0]!.text).toBe('hello world');
    expect(raw.lines[0]!.sourceLocation).toEqual({ kind: 'txt-line', lineNumber: 1, charStart: 0, charEnd: 11 });
  });

  it('coerces a Date extractedAt (as returned by Prisma) to ISO string', () => {
    const raw = parseStoredRawExtraction(makeRow({ extractedAt: new Date('2026-06-01T12:30:00.000Z') }));
    expect(raw.extractedAt).toBe('2026-06-01T12:30:00.000Z');
  });

  it('treats a null warnings column as an empty digest', () => {
    const raw = parseStoredRawExtraction(makeRow({ warnings: null }));
    expect(raw.warnings).toEqual([]);
  });

  it('round-trips warnings verbatim', () => {
    const warnings: ExtractionWarning[] = [
      { code: 'PARTIAL_EXTRACTION', message: 'row truncated', details: { row: 3 } },
      { code: 'EMPTY_TEXT_LAYER', message: 'no text layer' },
    ];
    const raw = parseStoredRawExtraction(makeRow({ warnings }));
    expect(raw.warnings).toEqual(warnings);
  });

  it('round-trips a DOCX table extraction', () => {
    const row = makeRow({
      format: 'DOCX',
      extraction: {
        format: 'DOCX',
        extractionMethod: 'structured',
        sections: [
          {
            type: 'table',
            rows: [{ cells: [{ text: 'amount' }, { text: '42000.00' }] }],
            sourceLocation: { kind: 'docx-table', blockIndex: 2, tableIndex: 0, rowIndex: 0, cellIndex: 0 },
          },
        ],
      },
    });
    const raw = parseStoredRawExtraction(row);
    expect(raw.format).toBe('DOCX');
    if (raw.format === 'DOCX' && raw.sections[0] && raw.sections[0].type === 'table') {
      expect(raw.sections[0].rows[0]!.cells[1]!.text).toBe('42000.00');
      expect(raw.sections[0].sourceLocation.tableIndex).toBe(0);
    } else {
      throw new Error('expected a DOCX table section');
    }
  });

  it('round-trips a JSON extraction with nested data', () => {
    const row = makeRow({
      format: 'JSON',
      extraction: {
        format: 'JSON',
        extractionMethod: 'json-parse',
        data: { ledger: { balance: 42000.5, tags: ['a', 'b'] }, done: true, extra: null },
        sourceLocation: { kind: 'json-root' },
      },
    });
    const raw = parseStoredRawExtraction(row);
    expect(raw.format).toBe('JSON');
    if (raw.format === 'JSON') {
      expect(raw.data).toEqual({ ledger: { balance: 42000.5, tags: ['a', 'b'] }, done: true, extra: null });
    }
  });

  it('round-trips an XML extraction with nested nodes', () => {
    const row = makeRow({
      format: 'XML',
      extraction: {
        format: 'XML',
        extractionMethod: 'xml-parse',
        root: {
          name: 'report',
          attributes: {},
          children: [{ name: 'entry', attributes: {}, children: ['deep text'] }],
        },
        sourceLocation: { kind: 'xml-root', path: 'report' },
      },
    });
    const raw = parseStoredRawExtraction(row);
    expect(raw.format).toBe('XML');
    if (raw.format === 'XML') {
      expect(raw.root.children[0]).toMatchObject({ name: 'entry' });
    }
  });

  it('round-trips an OCR IMAGE extraction with ocrLines', () => {
    const row = makeRow({
      format: 'IMAGE',
      extraction: {
        format: 'IMAGE',
        extractionMethod: 'ocr',
        text: 'first\nsecond',
        ocrConfidence: 0.8,
        ocrLines: [
          { text: 'first', confidence: 0.9, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 }, words: [] },
        ],
      },
    });
    const raw = parseStoredRawExtraction(row);
    expect(raw.format).toBe('IMAGE');
    if (raw.format === 'IMAGE') {
      expect(raw.ocrLines![0]!.text).toBe('first');
      expect(raw.ocrLines![0]!.confidence).toBe(0.9);
    }
  });

  it('round-trips the remaining formats against RawExtractionBodySchema', () => {
    const bodies: unknown[] = [
      {
        format: 'PDF',
        extractionMethod: 'text-layer',
        pages: [{ pageNumber: 1, spans: [{ text: 'page one', sourceLocation: { kind: 'pdf-page', pageNumber: 1 } }] }],
      },
      {
        format: 'CSV',
        extractionMethod: 'csv-parse',
        headers: ['name', 'value'],
        records: [{ rowNumber: 1, cells: [{ columnIndex: 0, columnName: 'name', rawValue: 'a', sourceLocation: { kind: 'csv-cell', rowNumber: 1, columnIndex: 0, columnName: 'name' } }] }],
      },
      {
        format: 'IMAGE',
        extractionMethod: 'unsupported',
      },
    ];
    for (const body of bodies) {
      expect(RawExtractionBodySchema.safeParse(body).success).toBe(true);
    }
  });
});

describe('M-A05 parseStoredRawExtraction: corrupt rows are rejected', () => {
  it('rejects a row carrying an extra (Prisma surrogate) key', () => {
    const row = makeRow() as StoredRow & { id: string; createdAt: Date };
    row.id = LONG_UUID(9);
    row.createdAt = new Date();
    expect(() => parseStoredRawExtraction(row)).toThrow(/row failed validation/);
  });

  it('rejects a non-object / null row', () => {
    expect(() => parseStoredRawExtraction(null)).toThrow(/row failed validation/);
    expect(() => parseStoredRawExtraction('nope')).toThrow(/row failed validation/);
  });

  it('rejects an extraction body that breaks its format contract', () => {
    const row = makeRow({
      extraction: {
        format: 'TXT',
        extractionMethod: 'text-decode',
        lines: [{ lineNumber: 'ONE', text: 42, sourceLocation: { kind: 'txt-line' } }],
      },
    });
    expect(() => parseStoredRawExtraction(row)).toThrow(/body \(format=TXT\) failed validation/);
  });

  it('rejects a row whose warnings use an unknown code', () => {
    const row = makeRow({
      warnings: [{ code: 'NOT_A_REAL_CODE', message: 'boom' } as ExtractionWarning],
    });
    expect(() => parseStoredRawExtraction(row)).toThrow(/row failed validation/);
  });
});