// ============================================================================
// CSV Parser
//
// Extracts CSV records with headers, row numbers, and cell-level provenance.
// Uses csv-parse for robust parsing (quoted fields, escaped delimiters, etc.).
// Preserves original string values — no numeric coercion.
// Deterministic: same bytes = same records in same order.
// ============================================================================

import { parse } from 'csv-parse/sync';
import type { ArtifactParser } from '../artifact-parser.js';
import type { ParserCapability } from '../parser-capability.js';
import type { ParserContext, ParseResult } from '../../extraction/types.js';
import type { CsvRecord, CsvCell, CsvExtraction } from '../../extraction/types.js';
import type { ArtifactClassification } from '../../classification/types.js';

const CAPABILITY: ParserCapability = {
  parserId: 'csv-parser',
  parserVersion: '1.0.0',
  displayName: 'CSV Parser',
  supportedFormats: ['CSV'],
  supportedMimeTypes: ['text/csv', 'application/csv'],
  supportedFamilies: ['STRUCTURED_DATA'],
  priority: 100,
  acceptsFallbackFormats: false,
};

export function createCsvParser(): ArtifactParser {
  return {
    capability: CAPABILITY,

    canParse(classification: ArtifactClassification): boolean {
      return classification.format === 'CSV';
    },

    async parse(input: Uint8Array, context: ParserContext): Promise<ParseResult> {
      if (input.byteLength === 0) {
        return {
          ok: true,
          extraction: {
            artifactId: context.artifactId,
            parserId: CAPABILITY.parserId,
            parserVersion: CAPABILITY.parserVersion,
            format: 'CSV',
            extractionMethod: 'csv-parse',
            extractedAt: new Date().toISOString(),
            headers: [],
            records: [],
            warnings: [{ code: 'EMPTY_CONTENT', message: 'Artifact content is empty' }],
          },
        };
      }

      const text = new TextDecoder('utf-8', { fatal: false }).decode(input);
      const warnings: import('../../extraction/types.js').ExtractionWarning[] = [];

      let rows: Record<string, string>[];
      try {
        rows = parse(text, {
          columns: true,
          skip_empty_lines: true,
          relax_column_count: true,
          trim: false,
          bom: true,
        }) as Record<string, string>[];
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid CSV';
        return {
          ok: false,
          error: {
            category: 'MALFORMED_ARTIFACT',
            code: 'INVALID_CSV',
            message: `Failed to parse CSV: ${message}`,
            sourceId: context.artifactId,
            details: { parserId: CAPABILITY.parserId, parserVersion: CAPABILITY.parserVersion },
            retryable: false,
            timestamp: new Date().toISOString(),
          },
        };
      }

      // Extract headers from first row (csv-parse provides them as keys)
      const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];

      // Build records with source locations
      const records: CsvRecord[] = [];
      let truncated = false;
      const maxRecords = context.limits?.maxRecords;

      for (let i = 0; i < rows.length; i++) {
        if (maxRecords !== undefined && i >= maxRecords) {
          truncated = true;
          break;
        }

        const row = rows[i]!;
        const rowNumber = i + 1; // 1-indexed (header is row 0 conceptually)
        const cells: CsvCell[] = [];

        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          const columnName = headers[colIdx]!;
          const rawValue = row[columnName] ?? '';

          cells.push({
            columnIndex: colIdx,
            columnName,
            rawValue,
            sourceLocation: {
              kind: 'csv-cell',
              rowNumber,
              columnIndex: colIdx,
              columnName,
            },
          });
        }

        records.push({ rowNumber, cells });
      }

      if (truncated) {
        warnings.push({
          code: 'TRUNCATED_OUTPUT',
          message: `Extraction truncated to ${records.length} records due to maxRecords limit`,
          details: { maxRecords },
        });
      }

      const extraction: CsvExtraction & import('../../extraction/types.js').RawExtractionBase = {
        artifactId: context.artifactId,
        parserId: CAPABILITY.parserId,
        parserVersion: CAPABILITY.parserVersion,
        format: 'CSV',
        extractionMethod: 'csv-parse',
        extractedAt: new Date().toISOString(),
        headers,
        records,
        warnings,
      };

      return { ok: true, extraction };
    },
  };
}
