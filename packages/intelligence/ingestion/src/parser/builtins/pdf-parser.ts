// ============================================================================
// PDF Parser
//
// Extracts text from PDF using pdfjs-dist with page-level provenance.
//
// A. Embedded text layer:
//    - Extract page by page using pdfjs-dist getTextContent()
//    - Preserve page boundaries, text spans, bounding boxes
//    - Compute pageTextOffset (offsets within extracted page text)
//
// B. Scanned/image-only PDFs:
//    - Render page to PNG using @napi-rs/canvas
//    - Send rendered image to OcrProvider
//    - Include OCR output with OCR-derived bounding boxes
//
// C. Mixed PDFs:
//    - Per-page extraction method tracking
//    - Some pages text-layer, some pages OCR -> extractionMethod = 'mixed'
//
// Never fabricates OCR results. Never claims OCR happened unless it did.
// Deterministic: same bytes + same version = same extraction (minus extractedAt).
// Respects ParserLimits.maxPages.
//
// Worker configuration:
//   The pdfjs-dist legacy Node build (pdfjs-dist/legacy/build/pdf.mjs) automatically
//   disables the web worker via PDFWorker's static initializer when isNodeJS is true.
//   No explicit worker configuration is needed. All PDF parsing runs synchronously on
//   the main thread via the "fake worker" (LoopbackPort) pattern.
// ============================================================================

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import type { ArtifactParser } from '../artifact-parser.js';
import type { ParserCapability } from '../parser-capability.js';
import type {
  ParserContext,
  ParseResult,
  PdfPage,
  PdfSpan,
  ExtractionWarning,
} from '../../extraction/types.js';
import type { ArtifactClassification } from '../../classification/types.js';

const CAPABILITY: ParserCapability = {
  parserId: 'pdf-parser',
  parserVersion: '2.0.0',
  displayName: 'PDF Parser',
  supportedFormats: ['PDF'],
  supportedMimeTypes: ['application/pdf'],
  supportedFamilies: ['DOCUMENT'],
  priority: 100,
  acceptsFallbackFormats: false,
};

// ============================================================================
// PDF Document Loading
// ============================================================================

/**
 * Load a PDF document from bytes using the pdfjs-dist legacy Node build.
 *
 * The legacy build's static initializer (PDFWorker) automatically sets
 * `#isWorkerDisabled = true` when `isNodeJS` is detected. No web worker
 * is spawned — all parsing runs synchronously on the main thread via the
 * "fake worker" pattern. This is the correct, typed approach for Node.js
 * extraction without any runtime hacks or untyped options.
 *
 * @see pdfjs-dist/legacy/build/pdf.mjs — PDFWorker static block
 */
async function loadPdfDocument(
  data: Uint8Array,
): Promise<pdfjsLib.PDFDocumentProxy> {
  return pdfjsLib.getDocument({
    data,
    isEvalSupported: false,
    isOffscreenCanvasSupported: false,
  }).promise;
}

// ============================================================================
// Text Layer Extraction
// ============================================================================

/**
 * Extract text from a single PDF page using the embedded text layer.
 * Computes pageTextOffset for each span — offsets within the extracted page text.
 */
async function extractPageTextLayer(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
): Promise<PdfSpan[]> {
  const page = await pdf.getPage(pageNum);
  const content = await page.getTextContent();

  const spans: PdfSpan[] = [];
  let pageTextOffset = 0;

  for (const item of content.items) {
    if (!('str' in item)) continue;
    const str = item.str as string;
    if (str.length === 0) continue;

    const tx = item.transform as number[];
    const pageHeight = page.getViewport({ scale: 1 }).height;
    const x = tx[4]!;
    const y = pageHeight - tx[5]!;
    const w = item.width as number;
    const h = item.height as number;

    const start = pageTextOffset;
    const end = pageTextOffset + str.length;
    pageTextOffset = end;

    spans.push({
      text: str,
      sourceLocation: {
        kind: 'pdf-page',
        pageNumber: pageNum,
        pageTextOffset: { start, end },
        boundingBox: { x, y, w, h },
      },
    });
  }

  return spans;
}

// ============================================================================
// Content Detection
// ============================================================================

/**
 * Check if a page has meaningful text content.
 * A page with only whitespace or very few characters likely has no text layer.
 */
function hasMeaningfulText(spans: PdfSpan[]): boolean {
  if (spans.length === 0) return false;
  const totalText = spans.map((s) => s.text).join('');
  return totalText.trim().length >= 3;
}

// ============================================================================
// Page Rendering for OCR
// ============================================================================

/**
 * Render a PDF page to a PNG buffer using pdfjs-dist + @napi-rs/canvas.
 * Returns PNG bytes + dimensions, or null if rendering fails.
 */
async function renderPageToPng(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  scale = 2,
): Promise<{ imageBytes: Buffer; width: number; height: number } | null> {
  try {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);

    // Use @napi-rs/canvas directly — creates a Skia-backed canvas in Node.js
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // pdfjs-dist render expects a CanvasRenderingContext2D-like object.
    // @napi-rs/canvas's SKRSContext2D is compatible.
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;

    // Convert canvas to PNG bytes
    const pngBuffer = canvas.toBuffer('image/png');

    return { imageBytes: pngBuffer, width, height };
  } catch {
    return null;
  }
}

// ============================================================================
// Main Parser
// ============================================================================

export function createPdfParser(): ArtifactParser {
  return {
    capability: CAPABILITY,

    canParse(classification: ArtifactClassification): boolean {
      return classification.format === 'PDF';
    },

    async parse(input: Uint8Array, context: ParserContext): Promise<ParseResult> {
      if (input.byteLength === 0) {
        return {
          ok: true,
          extraction: {
            artifactId: context.artifactId,
            parserId: CAPABILITY.parserId,
            parserVersion: CAPABILITY.parserVersion,
            format: 'PDF',
            extractionMethod: 'unsupported',
            extractedAt: new Date().toISOString(),
            pages: [],
            warnings: [{ code: 'EMPTY_CONTENT', message: 'Artifact content is empty' }],
          },
        };
      }

      const warnings: ExtractionWarning[] = [];
      let pdf: pdfjsLib.PDFDocumentProxy;

      try {
        pdf = await loadPdfDocument(
          Buffer.isBuffer(input) ? new Uint8Array(input) : input,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid PDF';
        return {
          ok: false,
          error: {
            category: 'MALFORMED_ARTIFACT',
            code: 'INVALID_PDF',
            message: `Failed to load PDF: ${message}`,
            sourceId: context.artifactId,
            details: { parserId: CAPABILITY.parserId, parserVersion: CAPABILITY.parserVersion },
            retryable: false,
            timestamp: new Date().toISOString(),
          },
        };
      }

      const totalPages = pdf.numPages;
      const maxPages = context.limits?.maxPages ?? totalPages;
      const pagesToProcess = Math.min(totalPages, maxPages);
      const truncated = maxPages < totalPages;

      const pages: PdfPage[] = [];
      let hasTextContent = false;
      let hasOcrContent = false;
      const hasOcrProvider = context.ocrProvider !== undefined;

      for (let i = 1; i <= pagesToProcess; i++) {
        // Step 1: Try embedded text layer
        const textSpans = await extractPageTextLayer(pdf, i);

        if (hasMeaningfulText(textSpans)) {
          hasTextContent = true;
          pages.push({ pageNumber: i, spans: textSpans });
          continue;
        }

        // Step 2: No meaningful text — try OCR if provider available
        if (!hasOcrProvider) {
          pages.push({ pageNumber: i, spans: [] });
          continue;
        }

        // Render page to image
        const rendered = await renderPageToPng(pdf, i);

        if (!rendered) {
          pages.push({ pageNumber: i, spans: [] });
          continue;
        }

        // Send to OCR provider
        try {
          const ocrResult = await context.ocrProvider!.extract({
            imageBytes: new Uint8Array(rendered.imageBytes),
            mimeType: 'image/png',
          });

          if (ocrResult.text.trim().length > 0) {
            hasOcrContent = true;

            // Build spans from OCR lines with bounding boxes
            const ocrSpans: PdfSpan[] = [];
            let ocrTextOffset = 0;

            if (ocrResult.lines && ocrResult.lines.length > 0) {
              for (const line of ocrResult.lines) {
                const start = ocrTextOffset;
                const end = ocrTextOffset + line.text.length;
                ocrTextOffset = end;

                ocrSpans.push({
                  text: line.text,
                  sourceLocation: {
                    kind: 'pdf-page',
                    pageNumber: i,
                    pageTextOffset: { start, end },
                    boundingBox: {
                      x: line.bbox.x0,
                      y: line.bbox.y0,
                      w: line.bbox.x1 - line.bbox.x0,
                      h: line.bbox.y1 - line.bbox.y0,
                    },
                  },
                });
              }
            } else {
              ocrSpans.push({
                text: ocrResult.text,
                sourceLocation: {
                  kind: 'pdf-page',
                  pageNumber: i,
                  pageTextOffset: { start: 0, end: ocrResult.text.length },
                },
              });
            }

            pages.push({ pageNumber: i, spans: ocrSpans });
          } else {
            pages.push({ pageNumber: i, spans: [] });
            warnings.push({
              code: 'EMPTY_TEXT_LAYER',
              message: `Page ${i}: no text layer and OCR produced no text`,
              details: { pageNumber: i },
            });
          }
        } catch (ocrErr) {
          const msg = ocrErr instanceof Error ? ocrErr.message : 'OCR error';
          warnings.push({
            code: 'OCR_FALLBACK_USED',
            message: `Page ${i}: OCR failed - ${msg}`,
            details: { pageNumber: i, providerId: context.ocrProvider!.providerId },
          });
          pages.push({ pageNumber: i, spans: [] });
        }
      }

      // Determine extraction method
      let extractionMethod: 'text-layer' | 'ocr' | 'mixed' | 'unsupported';
      if (hasTextContent && hasOcrContent) {
        extractionMethod = 'mixed';
      } else if (hasTextContent) {
        extractionMethod = 'text-layer';
      } else if (hasOcrContent) {
        extractionMethod = 'ocr';
        warnings.push({
          code: 'OCR_FALLBACK_USED',
          message: 'PDF has no embedded text layer; OCR was used for all pages',
        });
      } else {
        extractionMethod = 'unsupported';
        if (pages.every((p) => p.spans.length === 0)) {
          warnings.push({
            code: 'EMPTY_TEXT_LAYER',
            message: 'PDF has no extractable text across all processed pages',
            details: { totalPages, pagesProcessed: pagesToProcess },
          });
        }
      }

      if (truncated) {
        warnings.push({
          code: 'TRUNCATED_OUTPUT',
          message: `Extraction truncated to ${pagesToProcess} pages of ${totalPages}`,
          details: { maxPages, totalPages },
        });
      }

      return {
        ok: true,
        extraction: {
          artifactId: context.artifactId,
          parserId: CAPABILITY.parserId,
          parserVersion: CAPABILITY.parserVersion,
          format: 'PDF',
          extractionMethod,
          extractedAt: new Date().toISOString(),
          pages,
          warnings,
        },
      };
    },
  };
}
