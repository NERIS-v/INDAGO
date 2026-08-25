// ============================================================================
// M-PR3 Raw Extraction
//
// Deterministic artifact extraction layer.
// Reads artifact bytes and produces structured RawExtraction with provenance.
//
// This module does NOT create:
//   - Observations
//   - Entities / Relations
//   - Graph nodes / edges
//   - Investigative leads / hypotheses
// ============================================================================

export type {
  ExtractionWarningCode,
  ExtractionWarning,
  SourceLocation,
  ExtractionMethod,
  ParserContext,
  ParserLimits,
  ParseResult,
  ExtractionResult,
  PdfSourceLocation,
  PdfSpan,
  PdfPage,
  PdfExtraction,
  DocxSourceLocation,
  DocxParagraph,
  DocxHeading,
  DocxTableCell,
  DocxTableRow,
  DocxTable,
  DocxSection,
  DocxExtraction,
  TxtSourceLocation,
  TxtLine,
  TxtExtraction,
  CsvSourceLocation,
  CsvCell,
  CsvRecord,
  CsvExtraction,
  JsonSourceLocation,
  JsonExtraction,
  XmlSourceLocation,
  XmlNode,
  XmlExtraction,
  ImageExtraction,
  RawExtractionBase,
  RawExtraction,
} from './types.js';

export type {
  OcrBoundingBox,
  OcrWord,
  OcrLine,
  OcrInput,
  OcrResult,
  OcrProvider,
} from './ocr-provider.js';

export { ExtractionService } from './extraction-service.js';
export type { ExtractionServiceConfig } from './extraction-service.js';

export { createTesseractOcrProvider } from './tesseract-ocr-provider.js';
export type { TesseractOcrConfig } from './tesseract-ocr-provider.js';
