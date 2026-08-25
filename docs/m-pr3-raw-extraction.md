# M-PR3: Raw Extraction Layer

## Overview

M-PR3 establishes the **deterministic, provenance-preserving extraction pipeline** that transforms raw artifact bytes into structured `RawExtraction` data.

This module answers: **"WHAT MATERIAL IS PRESENT, AND WHERE DID IT COME FROM?"**

It does **NOT** answer: "WHAT DOES THIS MATERIAL MEAN?"

## Architecture

```
VerifiedArtifact (M-PR1)
    |
    v
ExtractionService
    |
    +--> ArtifactStorage.read(storagePath) -> bytes
    +--> classifyArtifact(artifact, bytes) -> ArtifactClassification
    +--> selectParser(classification, registry) -> ParserRoute
    +--> parser.parse(bytes, context) -> ParseResult
              |
              v
        RawExtraction (discriminated union on format)
```

### Ownership Boundary

M-PR3 is owned by **MAYUR**. It does NOT touch:
- HTTP/API infrastructure (GURASHISH)
- UploadThing, Redis, BullMQ, Express
- Prisma, Neo4j, or any database
- Graph construction or entity resolution

## Files

### Source

| File | Purpose |
|------|---------|
| `src/extraction/types.ts` | RawExtraction union, SourceLocation per format, ParserContext, ParserLimits, ParseResult, ExtractionWarning |
| `src/extraction/ocr-provider.ts` | OcrProvider, OcrInput, OcrResult, OcrLine, OcrWord, OcrBoundingBox abstractions |
| `src/extraction/tesseract-ocr-provider.ts` | Concrete tesseract.js v5 OCR provider implementation |
| `src/extraction/extraction-service.ts` | Orchestrates Storage -> Classify -> Route -> Parse |
| `src/extraction/index.ts` | Barrel exports |
| `src/parser/artifact-parser.ts` | Parser capability interface with `parse()` method |
| `src/parser/builtins/pdf-parser.ts` | PDF extraction via pdfjs-dist legacy build + @napi-rs/canvas |
| `src/parser/builtins/docx-parser.ts` | DOCX extraction via mammoth |
| `src/parser/builtins/csv-parser.ts` | CSV extraction via csv-parse |
| `src/parser/builtins/json-parser.ts` | JSON extraction via JSON.parse |
| `src/parser/builtins/xml-parser.ts` | XML extraction via fast-xml-parser |
| `src/parser/builtins/txt-parser.ts` | TXT extraction via TextDecoder |
| `src/parser/builtins/image-parser.ts` | Image extraction via OcrProvider with ocrLines passthrough |
| `src/parser/builtins/xlsx-parser.ts` | XLSX stub -- returns EXTRACTION_FAILED |

### Tests

| File | Coverage |
|------|----------|
| `tests/extraction/txt-parser.test.ts` | Line splitting, offsets, CRLF, unicode, limits, determinism, no-observations |
| `tests/extraction/json-parser.test.ts` | Object/array/nested, malformed JSON, empty content |
| `tests/extraction/csv-parser.test.ts` | Headers, records, quoted fields, limits, source locations |
| `tests/extraction/xml-parser.test.ts` | Simple/nested, source locations, empty content |
| `tests/extraction/pdf-parser.test.ts` | Empty content, malformed PDF, page-level structure, OCR integration, extraction limits |
| `tests/extraction/docx-parser.test.ts` | Malformed input, empty, no fake offsets, capability |
| `tests/extraction/image-parser.test.ts` | No OCR provider, OCR delegation, failing OCR, empty |
| `tests/extraction/xlsx-parser.test.ts` | Stub error, capability |
| `tests/extraction/extraction-service.test.ts` | Full pipeline, storage failure, bypass, overrides, no-observations |
| `tests/extraction/barrel-exports.test.ts` | Type completeness, no forbidden imports |
| `tests/extraction/ocr-integration.test.ts` | Real tesseract.js OCR on images, PDFs, mixed PDFs, provenance, failure handling |
| `tests/extraction/fixtures.ts` | Synthetic data, real PNG generators, real PDF generators, mock/spy/failing OCR providers |

## Key Design Decisions

### 1. Parsers receive Uint8Array only

Parsers are **pure format decoders**. They receive bytes and context, return structured data. They never read storage, fetch URLs, or access services.

```
Parser.parse(input: Uint8Array, context: ParserContext) -> ParseResult
```

### 2. RawExtraction is a discriminated union

Each format has its own extraction type with format-specific structure:

- **PDF**: Pages -> Spans with page-level provenance + bounding boxes
- **DOCX**: Sections (paragraphs, headings, tables) with block-level provenance
- **TXT**: Lines with character offsets
- **CSV**: Records -> Cells with row/column provenance
- **JSON**: Parsed data with `json-root` source location
- **XML**: Node tree with structural paths
- **IMAGE**: OCR text + ocrLines with bounding boxes (when provider available) or `unsupported`

### 3. No fabricated provenance

- PDF text-layer: Uses `item.transform` from pdfjs-dist for bounding boxes
- PDF OCR: Uses bounding boxes from TesseractOcrProvider
- DOCX: Uses mammoth's block structure (blockIndex, tableIndex, rowIndex, cellIndex)
- TXT: Uses actual character offsets from line splitting
- JSON/XML: Use structural paths only -- no byte/character offsets invented
- When provenance is unavailable, emit `SOURCE_LOCATION_UNAVAILABLE` warning

### 4. OCR: concrete tesseract.js v5 provider

M-PR3 includes a **concrete OCR implementation** using tesseract.js v5.

- `TesseractOcrProvider` (`tesseract-ocr-provider.ts`): wraps `Tesseract.recognize()`
- Returns structured `OcrResult` with lines, words, bounding boxes, and confidence scores
- Accepts `Uint8Array` image bytes via `Buffer.from()` conversion for tesseract.js `ImageLike` compatibility
- Language is configurable (default: `eng`)

### 5. PDF extraction: pdfjs-dist legacy build + @napi-rs/canvas

PDF parsing uses `pdfjs-dist/legacy/build/pdf.mjs` -- the Node.js-compatible legacy build.

**Worker configuration (automatic, no explicit settings):**
- The legacy build's `PDFWorker` static initializer detects Node.js and automatically sets `#isWorkerDisabled = true` and `GlobalWorkerOptions.workerSrc ||= "./pdf.worker.mjs"`
- No explicit worker configuration is needed in `getDocument()` options
- All PDF parsing runs synchronously on the main thread via the "fake worker" (LoopbackPort) pattern
- `disableWorker` is NOT used -- it exists at runtime in some builds but is omitted from the v4.x TypeScript types. The legacy build handles this automatically.
- `GlobalWorkerOptions.workerSrc` is NOT manually set

**Why legacy build:** The default `pdfjs-dist/build/pdf.mjs` requires a web worker via `GlobalWorkerOptions.workerSrc`, which fails in Node.js and Vitest environments. The legacy build's static initializer handles worker configuration automatically for Node.js.

**Known warning:** pdfjs-dist emits `Warning: UnknownErrorException: Ensure that the standardFontDataUrl API parameter is provided.` on every PDF parse. This is harmless -- it relates to font rendering for standard (non-embedded) fonts, not text extraction. Our pdf-lib test fixtures embed fonts. The font data path cannot be cleanly resolved in pnpm workspaces due to the `.pnpm/` symlink layout, so the warning is documented rather than suppressed.

**Normal text PDFs:**
1. Call `page.getTextContent()` to extract embedded text layer
2. Compute `pageTextOffset` for each span (character offsets within the extracted page text of that page)
3. Use `item.transform` to derive bounding box coordinates
4. Detection: `hasMeaningfulText()` checks if combined span text has >= 3 non-whitespace characters

**Scanned/image-only PDFs:**
1. Detect no meaningful text layer
2. Render page to PNG via `@napi-rs/canvas`: `createCanvas(w, h)` -> `getContext('2d')` -> `page.render({ canvasContext: ctx })` -> `canvas.toBuffer('image/png')`
3. Send rendered PNG bytes to `OcrProvider`
4. Build spans from OCR lines with provider-derived bounding boxes

**Mixed PDFs:**
- Per-page extraction method tracking
- Some pages text-layer, some pages OCR -> `extractionMethod = 'mixed'`
- NOT a global label -- each page is independently assessed

### 6. @napi-rs/canvas for PDF rendering

PDF page rendering to PNG uses `@napi-rs/canvas` (Skia-backed canvas for Node.js):
- `createCanvas(width, height)` creates a Skia canvas
- `canvas.getContext('2d')` returns an SKRSContext2D compatible with pdfjs-dist's `CanvasRenderingContext2D`
- `page.render({ canvasContext: ctx, viewport })` renders the PDF page
- `canvas.toBuffer('image/png')` produces PNG bytes for OCR input

### 7. pageTextOffset semantics

`pageTextOffset` refers to **character offsets within the extracted text of THAT PAGE**, NOT offsets in the original PDF binary.

For text-layer pages:
- Each span's `pageTextOffset.start` and `.end` are offsets into the concatenated text of all spans on that page
- Offsets reset to 0 for each new page
- The substring `fullPageText.substring(start, end)` reconstructs the span text exactly

For OCR pages:
- Same semantics: offsets into the OCR-produced page text
- Lines from OCR are concatenated; each line's `pageTextOffset` covers its portion

### 8. Bounding box provenance

Bounding boxes come from two sources, never fabricated:

| Source | Used by | Coordinate system |
|--------|---------|-------------------|
| pdfjs-dist `item.transform` | PDF text-layer pages | PDF coordinate space (origin bottom-left) |
| TesseractOcrProvider `OcrLine.bbox` | PDF OCR pages, Image OCR | OCR engine coordinate space (origin top-left) |

Bounding box types:
```typescript
interface OcrBoundingBox {
  readonly x0: number;  // left
  readonly y0: number;  // top
  readonly x1: number;  // right
  readonly y1: number;  // bottom
}
```

PDF text-layer bounding boxes are derived from `item.transform` matrix values and `page.getViewport()`.

### 9. Mixed PDF behavior

A PDF with both text and scanned pages produces per-page extraction methods:

```
Page 1: embedded text    -> text-layer spans
Page 2: scanned image    -> OCR spans (via render -> tesseract)
Page 3: embedded text    -> text-layer spans
Overall extractionMethod: 'mixed'
```

Each page is independently assessed. The extraction method is NOT collapsed into a misleading global value.

### 10. OCR failure handling

When the OCR provider throws:
- The failure is captured as a warning with code `OCR_FALLBACK_USED`
- Warning details include the page number and provider ID
- The failed page has empty spans (`[]`)
- Successfully extracted pages are preserved (partial extraction)
- The parser does not fabricate text
- The extraction result is still `ok: true` (OCR failure is non-fatal)

### 11. Determinism

Same bytes + same version + same config + same context = same extraction.

Only `extractedAt` is nondeterministic (metadata timestamp).

### 12. Limits enforced with TRUNCATED_OUTPUT

| Limit | Applies to | Warning code |
|-------|-----------|--------------|
| `maxPages` | PDF | `TRUNCATED_OUTPUT` |
| `maxLines` | TXT | `TRUNCATED_OUTPUT` |
| `maxRecords` | CSV | `TRUNCATED_OUTPUT` |

### 13. Error semantics

| Situation | Error category | Error code |
|-----------|---------------|------------|
| Invalid JSON | `MALFORMED_ARTIFACT` | `INVALID_JSON` |
| Invalid CSV | `MALFORMED_ARTIFACT` | `INVALID_CSV` |
| Invalid XML | `MALFORMED_ARTIFACT` | `INVALID_XML` |
| Invalid DOCX | `MALFORMED_ARTIFACT` | `INVALID_DOCX` |
| Invalid PDF | `MALFORMED_ARTIFACT` | `INVALID_PDF` |
| Storage read failure | `EXTRACTION_FAILED` | `STORAGE_READ_FAILED` |
| Parser not found | `EXTRACTION_FAILED` | `PARSER_NOT_FOUND` |
| Parser throws | `EXTRACTION_FAILED` | `PARSER_CRASH` |
| XLSX (stub) | `EXTRACTION_FAILED` | `XLSX_NOT_IMPLEMENTED` |
| No parser available | `UNSUPPORTED_FORMAT` | `NO_PARSER_MATCH` |

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `pdfjs-dist` | ^4.10.38 | PDF text extraction (legacy Node build) |
| `mammoth` | ^1.8.0 | DOCX text/structure extraction |
| `csv-parse` | ^5.6.0 | CSV parsing |
| `fast-xml-parser` | ^4.5.0 | XML parsing |
| `tesseract.js` | ^5.1.1 | OCR for images and scanned PDFs |
| `@napi-rs/canvas` | ^0.1.100 | PDF page rendering to PNG for OCR |
| `pdf-lib` | ^1.17.1 | Test fixture generation (devDependency only) |

## Test Verification

### Unit tests: 267 passing

All parser unit tests use mock OCR providers and synthetic data. No external dependencies.

### OCR integration tests: 13 passing

Real tesseract.js OCR on real images and PDFs:

1. Real image OCR -- single-line ("HELLO")
2. Real image OCR -- multi-line with word/line bounding boxes
3. Real image OCR -- bounding box provenance verification
4. Real scanned PDF OCR -- image-only PDF via real tesseract (no mocks)
5. OCR failure handling -- graceful degradation, warning emitted, no fabricated text
6. Normal text PDF skips OCR -- spy provider callCount === 0
7. Multi-page PDF has correct per-page text offsets
8. maxPages limit with TRUNCATED_OUTPUT
9. Mixed PDF -- text + scanned + text -> extractionMethod === 'mixed'
10. PDF provenance -- pageTextOffset refers to page text, not PDF binary
11. Per-page offset reset to 0
12. OCR bounding boxes from provider
13. Text extraction with pageTextOffset substring verification

**Total: 280 tests, 24 test files, 0 failures**

## What M-PR3 Does NOT Do

- Create Observations, EntityHypotheses, or RelationHypotheses
- Build GraphNodes or GraphEdges
- Create InvestigativeLeads or InvestigativeGaps
- Access any graph, entity, or database service
- Implement XLSX extraction (stub only)
- Normalize source data (MA05)
- Run analytics or machine learning
