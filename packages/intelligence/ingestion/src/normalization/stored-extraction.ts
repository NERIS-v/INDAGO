// ============================================================================
// Stored RawExtraction Rehydration (M-A05)
//
// The re-entrant worker path must re-derive a typed RawExtraction from the
// durably persisted Prisma row (JSON `extraction` + `warnings` columns).
// This module is the single canonical validator for that rehydration — no
// `any`, no blind casts. It mirrors the format-native shapes declared in
// ../extraction/types.ts exactly, so a row that validates here is structurally
// identical to one produced at extraction time.
//
// Deterministic: validation of the same bytes always yields the same result.
// ============================================================================

import { z } from 'zod';
import type { RawExtraction, ExtractionWarning, XmlNode } from '../extraction/types.js';

// ============================================================================
// Extraction Warnings
// ============================================================================

export const ExtractionWarningCodeSchema = z.enum([
  'OCR_FALLBACK_USED',
  'EMPTY_TEXT_LAYER',
  'PARTIAL_EXTRACTION',
  'ENCODING_FALLBACK',
  'MALFORMED_STRUCTURE',
  'UNSUPPORTED_FEATURE',
  'TABLE_STRUCTURE_LOSS',
  'SOURCE_LOCATION_UNAVAILABLE',
  'EMPTY_CONTENT',
  'TRUNCATED_OUTPUT',
]);

export const ExtractionWarningSchema = z.object({
  code: ExtractionWarningCodeSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
}).strict();

// ============================================================================
// OCR shapes (mirror ../extraction/ocr-provider.ts)
// ============================================================================

export const OcrBoundingBoxSchema = z.object({
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
}).strict();

export const OcrWordSchema = z.object({
  text: z.string(),
  confidence: z.number(),
  bbox: OcrBoundingBoxSchema,
}).strict();

export const OcrLineSchema = z.object({
  text: z.string(),
  confidence: z.number(),
  bbox: OcrBoundingBoxSchema,
  words: z.array(OcrWordSchema),
}).strict();

// ============================================================================
// Source locations (mirror ../extraction/types.ts)
// ============================================================================

export const PdfSourceLocationSchema = z.object({
  kind: z.literal('pdf-page'),
  pageNumber: z.number(),
  pageTextOffset: z.object({
    start: z.number(),
    end: z.number(),
  }).strict().optional(),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }).strict().optional(),
}).strict();

export const DocxSourceLocationSchema = z.object({
  kind: z.enum(['docx-block', 'docx-table']),
  blockIndex: z.number(),
  tableIndex: z.number().optional(),
  rowIndex: z.number().optional(),
  cellIndex: z.number().optional(),
}).strict();

export const TxtSourceLocationSchema = z.object({
  kind: z.literal('txt-line'),
  lineNumber: z.number(),
  charStart: z.number(),
  charEnd: z.number(),
}).strict();

export const CsvSourceLocationSchema = z.object({
  kind: z.literal('csv-cell'),
  rowNumber: z.number(),
  columnIndex: z.number(),
  columnName: z.string(),
}).strict();

export const JsonSourceLocationSchema = z.object({
  kind: z.literal('json-root'),
}).strict();

export const XmlSourceLocationSchema = z.object({
  kind: z.literal('xml-root'),
  path: z.string(),
}).strict();

// ============================================================================
// Per-format extraction bodies (mirror ../extraction/types.ts)
// ============================================================================

const PdfExtractionBodySchema = z.object({
  format: z.literal('PDF'),
  extractionMethod: z.enum(['text-layer', 'ocr', 'mixed', 'unsupported']),
  pages: z.array(
    z.object({
      pageNumber: z.number(),
      spans: z.array(
        z.object({
          text: z.string(),
          sourceLocation: PdfSourceLocationSchema,
        }).strict(),
      ),
    }).strict(),
  ),
}).strict();

const DocxExtractionBodySchema = z.object({
  format: z.literal('DOCX'),
  extractionMethod: z.literal('structured'),
  sections: z.array(
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('paragraph'),
        text: z.string(),
        sourceLocation: DocxSourceLocationSchema,
      }).strict(),
      z.object({
        type: z.literal('heading'),
        level: z.number(),
        text: z.string(),
        sourceLocation: DocxSourceLocationSchema,
      }).strict(),
      z.object({
        type: z.literal('table'),
        rows: z.array(
          z.object({
            cells: z.array(z.object({ text: z.string() }).strict()),
          }).strict(),
        ),
        sourceLocation: DocxSourceLocationSchema,
      }).strict(),
    ]),
  ),
}).strict();

const TxtExtractionBodySchema = z.object({
  format: z.literal('TXT'),
  extractionMethod: z.literal('text-decode'),
  lines: z.array(
    z.object({
      lineNumber: z.number(),
      text: z.string(),
      sourceLocation: TxtSourceLocationSchema,
    }).strict(),
  ),
}).strict();

const CsvExtractionBodySchema = z.object({
  format: z.literal('CSV'),
  extractionMethod: z.literal('csv-parse'),
  headers: z.array(z.string()),
  records: z.array(
    z.object({
      rowNumber: z.number(),
      cells: z.array(
        z.object({
          columnIndex: z.number(),
          columnName: z.string(),
          rawValue: z.string(),
          sourceLocation: CsvSourceLocationSchema,
        }).strict(),
      ),
    }).strict(),
  ),
}).strict();

const JsonExtractionBodySchema = z.object({
  format: z.literal('JSON'),
  extractionMethod: z.literal('json-parse'),
  data: z.unknown(),
  sourceLocation: JsonSourceLocationSchema,
}).strict();

const baseXmlNodeSchema: z.ZodType<XmlNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    attributes: z.record(z.string(), z.string()),
    children: z.array(z.union([baseXmlNodeSchema, z.string()])),
  }).strict(),
);

const XmlExtractionBodySchema = z.object({
  format: z.literal('XML'),
  extractionMethod: z.literal('xml-parse'),
  root: baseXmlNodeSchema,
  sourceLocation: XmlSourceLocationSchema,
}).strict();

const ImageExtractionBodySchema = z.object({
  format: z.literal('IMAGE'),
  extractionMethod: z.enum(['ocr', 'unsupported']),
  text: z.string().optional(),
  ocrConfidence: z.number().optional(),
  ocrLines: z.array(OcrLineSchema).optional(),
}).strict();

/**
 * Discriminated union over `format` — the full RawExtraction body as stored
 * (warnings travel in their own column and are NOT part of this JSON).
 */
export const RawExtractionBodySchema = z.discriminatedUnion('format', [
  PdfExtractionBodySchema,
  DocxExtractionBodySchema,
  TxtExtractionBodySchema,
  CsvExtractionBodySchema,
  JsonExtractionBodySchema,
  XmlExtractionBodySchema,
  ImageExtractionBodySchema,
]);

// ============================================================================
// Persisted row (Prisma RawExtraction + IngestionAttempt ownership)
// ============================================================================

export const PersistedRawExtractionRowSchema = z.object({
  attemptId: z.string().uuid(),
  artifactId: z.string().uuid(),
  parserId: z.string().min(1),
  parserVersion: z.string().min(1),
  format: z.string().min(1),
  extraction: z.unknown(),
  warnings: z.array(ExtractionWarningSchema).nullable(),
  extractedAt: z.coerce.date(),
}).strict();

// ============================================================================
// parseStoredRawExtraction
// ============================================================================

/**
 * Rehydrate a typed RawExtraction from a persisted row. Throws with a
 * descriptive message when the stored JSON does not conform to the extractor
 * contract (the caller converts this into an unrecoverable worker failure).
 */
export function parseStoredRawExtraction(row: unknown): RawExtraction {
  const parsed = PersistedRawExtractionRowSchema.safeParse(row);
  if (!parsed.success) {
    throw new Error(`Stored RawExtraction row failed validation: ${parsed.error.message}`);
  }

  const body = RawExtractionBodySchema.safeParse(parsed.data.extraction);
  if (!body.success) {
    throw new Error(
      `Stored RawExtraction body (format=${parsed.data.format}) failed validation: ${body.error.message}`,
    );
  }

  const warnings = (parsed.data.warnings ?? []) as readonly ExtractionWarning[];

  const base = {
    artifactId: parsed.data.artifactId,
    parserId: parsed.data.parserId,
    parserVersion: parsed.data.parserVersion,
    extractedAt: parsed.data.extractedAt.toISOString(),
    warnings,
  };

  switch (body.data.format) {
    case 'PDF':
      return { ...body.data, ...base };
    case 'DOCX':
      return { ...body.data, ...base };
    case 'TXT':
      return { ...body.data, ...base };
    case 'CSV':
      return { ...body.data, ...base };
    case 'JSON':
      return { ...body.data, ...base, data: body.data.data };
    case 'XML':
      return { ...body.data, ...base };
    case 'IMAGE':
      return { ...body.data, ...base };
  }
}