// ============================================================================
// Raw Extraction Types
//
// Canonical representation of extracted artifact material.
// M-PR3 establishes the boundary between artifact bytes and intelligence.
//
// RawExtraction is a derived representation of the artifact, NOT a replacement.
// Original artifact bytes remain in ArtifactStorage, linked by artifactId.
//
// This module does NOT create:
//   - Observations
//   - EntityHypothesis / RelationHypothesis
//   - GraphNodes / GraphEdges
//   - InvestigativeLeads / Gaps
//   - Any intelligence semantics
//
// M-PR3 answers: "WHAT MATERIAL IS PRESENT, AND WHERE DID IT COME FROM?"
// M-PR3 does NOT answer: "WHAT DOES THIS MATERIAL MEAN?"
// ============================================================================

// ============================================================================
// Extraction Warning
// ============================================================================

/**
 * Structured warning codes for extraction.
 * Warnings are non-fatal — they indicate limitations or fallbacks.
 */
export type ExtractionWarningCode =
  | 'OCR_FALLBACK_USED'
  | 'EMPTY_TEXT_LAYER'
  | 'PARTIAL_EXTRACTION'
  | 'ENCODING_FALLBACK'
  | 'MALFORMED_STRUCTURE'
  | 'UNSUPPORTED_FEATURE'
  | 'TABLE_STRUCTURE_LOSS'
  | 'SOURCE_LOCATION_UNAVAILABLE'
  | 'EMPTY_CONTENT'
  | 'TRUNCATED_OUTPUT';

/**
 * Structured extraction warning.
 * Deterministic for the same input — same warning code and message.
 */
export interface ExtractionWarning {
  readonly code: ExtractionWarningCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

// ============================================================================
// Source Locations — per-format provenance
// ============================================================================

/**
 * PDF source location — page-level provenance with optional span coordinates.
 * pageTextOffset refers to offsets within the extracted text of THAT PAGE,
 * NOT offsets in the original PDF binary.
 */
export interface PdfSourceLocation {
  readonly kind: 'pdf-page';
  readonly pageNumber: number;
  /** Character offsets within the extracted text of this page */
  readonly pageTextOffset?: {
    readonly start: number;
    readonly end: number;
  };
  readonly boundingBox?: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
}

/**
 * DOCX source location — block-level provenance only.
 * No character/byte offsets are fabricated from mammoth HTML.
 */
export interface DocxSourceLocation {
  readonly kind: 'docx-block' | 'docx-table';
  readonly blockIndex: number;
  readonly tableIndex?: number;
  readonly rowIndex?: number;
  readonly cellIndex?: number;
}

/**
 * TXT source location — line-level provenance with character offsets.
 */
export interface TxtSourceLocation {
  readonly kind: 'txt-line';
  readonly lineNumber: number;
  readonly charStart: number;
  readonly charEnd: number;
}

/**
 * CSV source location — cell-level provenance.
 */
export interface CsvSourceLocation {
  readonly kind: 'csv-cell';
  readonly rowNumber: number;
  readonly columnIndex: number;
  readonly columnName: string;
}

/**
 * JSON source location — structural path only.
 * No byte/character offsets are fabricated.
 */
export interface JsonSourceLocation {
  readonly kind: 'json-root';
}

/**
 * XML source location — structural path.
 */
export interface XmlSourceLocation {
  readonly kind: 'xml-root';
  readonly path: string;
}

/**
 * Union of all source location types.
 */
export type SourceLocation =
  | PdfSourceLocation
  | DocxSourceLocation
  | TxtSourceLocation
  | CsvSourceLocation
  | JsonSourceLocation
  | XmlSourceLocation;

// ============================================================================
// Extraction method
// ============================================================================

/**
 * How the extraction was performed.
 * Used to distinguish embedded text from OCR, structured from raw, etc.
 */
export type ExtractionMethod =
  | 'text-layer'
  | 'ocr'
  | 'mixed'
  | 'structured'
  | 'text-decode'
  | 'csv-parse'
  | 'json-parse'
  | 'xml-parse'
  | 'unsupported';

// ============================================================================
// Parser Context
// ============================================================================

/**
 * Context passed to parsers for extraction.
 * Deliberately narrow — no storage, no graph, no entity resolver.
 */
export interface ParserContext {
  readonly artifactId: string;
  readonly contentHash: string;
  readonly originalFilename: string | undefined;
  readonly detectedMimeType: string;
  readonly encoding: string;
  readonly ocrProvider?: import('./ocr-provider.js').OcrProvider;
  readonly limits?: ParserLimits;
}

/**
 * Optional limits to prevent unbounded extraction.
 * When a limit is hit, extraction is truncated and TRUNCATED_OUTPUT warning emitted.
 */
export interface ParserLimits {
  readonly maxPages?: number;
  readonly maxLines?: number;
  readonly maxRecords?: number;
  readonly timeoutMs?: number;
}

// ============================================================================
// Parse Result — discriminated union matching codebase pattern
// ============================================================================

/**
 * Result of parsing an artifact.
 * Ok: structured RawExtraction with provenance.
 * Err: structured IngestionError with category and code.
 */
export type ParseResult =
  | { readonly ok: true; readonly extraction: RawExtraction }
  | { readonly ok: false; readonly error: import('@indago/contracts').IngestionError };

// ============================================================================
// PDF Extraction
// ============================================================================

export interface PdfSpan {
  readonly text: string;
  readonly sourceLocation: PdfSourceLocation;
}

export interface PdfPage {
  readonly pageNumber: number;
  readonly spans: readonly PdfSpan[];
}

export interface PdfExtraction {
  readonly format: 'PDF';
  readonly extractionMethod: 'text-layer' | 'ocr' | 'mixed' | 'unsupported';
  readonly pages: readonly PdfPage[];
}

// ============================================================================
// DOCX Extraction
// ============================================================================

export interface DocxParagraph {
  readonly type: 'paragraph';
  readonly text: string;
  readonly sourceLocation: DocxSourceLocation;
}

export interface DocxHeading {
  readonly type: 'heading';
  readonly level: number;
  readonly text: string;
  readonly sourceLocation: DocxSourceLocation;
}

export interface DocxTableCell {
  readonly text: string;
}

export interface DocxTableRow {
  readonly cells: readonly DocxTableCell[];
}

export interface DocxTable {
  readonly type: 'table';
  readonly rows: readonly DocxTableRow[];
  readonly sourceLocation: DocxSourceLocation;
}

export type DocxSection = DocxParagraph | DocxHeading | DocxTable;

export interface DocxExtraction {
  readonly format: 'DOCX';
  readonly extractionMethod: 'structured';
  readonly sections: readonly DocxSection[];
}

// ============================================================================
// TXT Extraction
// ============================================================================

export interface TxtLine {
  readonly lineNumber: number;
  readonly text: string;
  readonly sourceLocation: TxtSourceLocation;
}

export interface TxtExtraction {
  readonly format: 'TXT';
  readonly extractionMethod: 'text-decode';
  readonly lines: readonly TxtLine[];
}

// ============================================================================
// CSV Extraction
// ============================================================================

export interface CsvCell {
  readonly columnIndex: number;
  readonly columnName: string;
  readonly rawValue: string;
  readonly sourceLocation: CsvSourceLocation;
}

export interface CsvRecord {
  readonly rowNumber: number;
  readonly cells: readonly CsvCell[];
}

export interface CsvExtraction {
  readonly format: 'CSV';
  readonly extractionMethod: 'csv-parse';
  readonly headers: readonly string[];
  readonly records: readonly CsvRecord[];
}

// ============================================================================
// JSON Extraction
// ============================================================================

export interface JsonExtraction {
  readonly format: 'JSON';
  readonly extractionMethod: 'json-parse';
  readonly data: unknown;
  readonly sourceLocation: JsonSourceLocation;
}

// ============================================================================
// XML Extraction
// ============================================================================

export interface XmlNode {
  readonly name: string;
  readonly attributes: Record<string, string>;
  readonly children: readonly (XmlNode | string)[];
}

export interface XmlExtraction {
  readonly format: 'XML';
  readonly extractionMethod: 'xml-parse';
  readonly root: XmlNode;
  readonly sourceLocation: XmlSourceLocation;
}

// ============================================================================
// Image Extraction
// ============================================================================

export interface ImageExtraction {
  readonly format: 'IMAGE';
  readonly extractionMethod: 'ocr' | 'unsupported';
  readonly text?: string;
  readonly ocrConfidence?: number;
  readonly ocrLines?: readonly import('./ocr-provider.js').OcrLine[];
}

// ============================================================================
// Raw Extraction — discriminated union on format
// ============================================================================

/**
 * Base fields shared by all extractions.
 * Every RawExtraction carries provenance metadata.
 */
export interface RawExtractionBase {
  readonly artifactId: string;
  readonly parserId: string;
  readonly parserVersion: string;
  readonly extractedAt: string;
  readonly warnings: readonly ExtractionWarning[];
}

/**
 * Discriminated union of all format-specific extractions.
 * Each variant carries format-native structure and source locations.
 */
export type RawExtraction =
  | (PdfExtraction & RawExtractionBase)
  | (DocxExtraction & RawExtractionBase)
  | (TxtExtraction & RawExtractionBase)
  | (CsvExtraction & RawExtractionBase)
  | (JsonExtraction & RawExtractionBase)
  | (XmlExtraction & RawExtractionBase)
  | (ImageExtraction & RawExtractionBase);

// ============================================================================
// Extraction Result — top-level discriminated union
// ============================================================================

/**
 * Result of extracting from a verified artifact.
 * Ok: structured RawExtraction with provenance.
 * Err: structured IngestionError.
 */
export type ExtractionResult =
  | { readonly ok: true; readonly extraction: RawExtraction }
  | { readonly ok: false; readonly error: import('@indago/contracts').IngestionError };
