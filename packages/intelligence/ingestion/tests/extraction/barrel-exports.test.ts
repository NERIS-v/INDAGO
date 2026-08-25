import { describe, it, expect } from 'vitest';
import {
  ExtractionService,
  createDefaultParserRegistry,
  createTesseractOcrProvider,
  selectParser,
  classifyArtifact,
  computeContentHash,
  detectMimeType,
  deterministicArtifactId,
  ParserRegistry,
  InMemoryArtifactStorage,
  ArtifactAcquisitionService,
  HttpArtifactFetcher,
  HttpError,
  FetchFailedError,
  FetchTimeoutError,
  ArtifactTooLargeError,
  InvalidReferenceError,
} from '../../src/index.js';
import type {
  RawExtraction,
  RawExtractionBase,
  ExtractionWarning,
  ExtractionWarningCode,
  SourceLocation,
  ExtractionMethod,
  ParserContext,
  ParserLimits,
  ParseResult,
  ExtractionResult,
  PdfExtraction,
  PdfPage,
  PdfSpan,
  PdfSourceLocation,
  DocxExtraction,
  DocxSection,
  DocxParagraph,
  DocxHeading,
  DocxTable,
  DocxTableRow,
  DocxTableCell,
  DocxSourceLocation,
  TxtExtraction,
  TxtLine,
  TxtSourceLocation,
  CsvExtraction,
  CsvRecord,
  CsvCell,
  CsvSourceLocation,
  JsonExtraction,
  JsonSourceLocation,
  XmlExtraction,
  XmlNode,
  XmlSourceLocation,
  ImageExtraction,
  OcrProvider,
  OcrInput,
  OcrResult,
  OcrBoundingBox,
  OcrWord,
  OcrLine,
  ArtifactParser,
  ParserCapability,
  ParserRoute,
  ParserRouteResult,
  ArtifactFormat,
  ArtifactFamily,
  EncodingType,
  ClassificationMethod,
  ClassificationConfidence,
  ArtifactClassification,
  VerifiedArtifact,
  ArtifactAcquisitionConfig,
  AcquisitionContext,
  ArtifactAcquisitionResult,
  ArtifactStorage,
  StorageWriteResult,
  ArtifactFetcher,
  FetchOptions,
  FetchedArtifact,
  MimeTypeResult,
  ArtifactAcquisitionServiceConfig,
  IngestionContext,
  IngestionInput,
  IngestionResult,
  SourceAdapter,
  IngestionServiceConfig,
} from '../../src/index.js';

// ============================================================================
// M-PR3 Barrel Export Tests
//
// Verifies that all extraction types are properly exported from the package.
// This is a compile-time safety net — if a type is missing from exports,
// this test file will fail to compile.
//
// Additionally verifies that runtime exports work correctly.
// ============================================================================

describe('M-PR3 Barrel Exports: Runtime', () => {
  it('ExtractionService is a class (instantiable)', () => {
    expect(typeof ExtractionService).toBe('function');
    expect(ExtractionService.name).toBe('ExtractionService');
  });

  it('ParserRegistry is a class', () => {
    expect(typeof ParserRegistry).toBe('function');
  });

  it('createDefaultParserRegistry returns a populated registry', () => {
    const registry = createDefaultParserRegistry();
    expect(registry).toBeInstanceOf(ParserRegistry);
    expect(registry.size).toBe(8);
  });

  it('createTesseractOcrProvider is a function', () => {
    expect(typeof createTesseractOcrProvider).toBe('function');
  });

  it('selectParser is a function', () => {
    expect(typeof selectParser).toBe('function');
  });

  it('classifyArtifact is a function', () => {
    expect(typeof classifyArtifact).toBe('function');
  });
});

describe('M-PR3 Barrel Exports: Type Completeness', () => {
  it('all extraction type aliases exist at runtime', () => {
    // These are type-only exports — we verify they compile
    // by assigning to typed variables. The test passes if tsc passes.
    const _: Record<string, unknown> = {};

    // Extraction types — type-only, verified at compile time
    // The following types are verified by the import statement above:
    // RawExtraction, RawExtractionBase, ExtractionWarning, ExtractionWarningCode,
    // SourceLocation, ExtractionMethod, ParserContext, ParserLimits, ParseResult,
    // ExtractionResult, PdfExtraction, PdfPage, PdfSpan, PdfSourceLocation,
    // DocxExtraction, DocxSection, DocxParagraph, DocxHeading, DocxTable,
    // DocxTableRow, DocxTableCell, DocxSourceLocation, TxtExtraction, TxtLine,
    // TxtSourceLocation, CsvExtraction, CsvRecord, CsvCell, CsvSourceLocation,
    // JsonExtraction, JsonSourceLocation, XmlExtraction, XmlNode, XmlSourceLocation,
    // ImageExtraction, OcrProvider, OcrInput, OcrResult

    // Verify runtime exports exist
    expect(typeof ExtractionService).toBe('function');
    expect(typeof ParserRegistry).toBe('function');
    expect(typeof createDefaultParserRegistry).toBe('function');
  });
});

describe('M-PR3 Barrel Exports: No Forbidden Imports', () => {
  it('ingestion package does not export Prisma, Neo4j, BullMQ, Redis, React, Express, or UploadThing', async () => {
    // This test verifies no forbidden dependencies leaked into the ingestion barrel
    const forbidden = ['prisma', 'neo4j', 'bullmq', 'redis', 'react', 'express', 'uploadthing'];

    const mod = await import('../../src/index.js');
    const moduleExports = Object.keys(mod);

    for (const name of forbidden) {
      const found = moduleExports.find((e) => e.toLowerCase().includes(name));
      expect(found).toBeUndefined();
    }
  });
});
