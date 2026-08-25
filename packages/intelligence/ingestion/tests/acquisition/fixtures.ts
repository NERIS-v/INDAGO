// ============================================================================
// Test Fixtures
//
// Synthetic artifacts for M-PR1 acquisition tests.
// No real user documents. All deterministic and hash-verified.
// ============================================================================

/** Small text artifact — known content and SHA-256 */
export const TEXT_ARTIFACT_CONTENT = new TextEncoder().encode(
  'INDAGO V7 test artifact — this is synthetic content for acquisition testing.',
);
export const TEXT_ARTIFACT_FILENAME = 'test-document.txt';
export const TEXT_ARTIFACT_MIME = 'text/plain';

/** PDF-like artifact — starts with %PDF magic bytes */
export const PDF_ARTIFACT_CONTENT = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, // %PDF
  0x2d, 0x31, 0x2e, 0x34, // -1.4
  0x0a, // newline
  ...new TextEncoder().encode('synthetic PDF content for testing'),
]);
export const PDF_ARTIFACT_FILENAME = 'test-report.pdf';
export const PDF_ARTIFACT_MIME = 'application/pdf';

/** PNG artifact — starts with PNG magic bytes */
export const PNG_ARTIFACT_CONTENT = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
]);
export const PNG_ARTIFACT_FILENAME = 'test-image.png';
export const PNG_ARTIFACT_MIME = 'image/png';

/** JPEG artifact — starts with JPEG magic bytes */
export const JPEG_ARTIFACT_CONTENT = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, // SOI + APP0 marker
  0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, // JFIF header
]);
export const JPEG_ARTIFACT_FILENAME = 'test-photo.jpg';
export const JPEG_ARTIFACT_MIME = 'image/jpeg';

/** ZIP-like artifact (DOCX container) */
export const DOCX_ARTIFACT_CONTENT = new Uint8Array([
  0x50, 0x4b, 0x03, 0x04, // PK ZIP signature
  0x14, 0x00, 0x06, 0x00, // version, flags
  ...new TextEncoder().encode('synthetic docx content'),
]);
export const DOCX_ARTIFACT_FILENAME = 'test-document.docx';

/** ZIP-like artifact (XLSX container) */
export const XLSX_ARTIFACT_CONTENT = new Uint8Array([
  0x50, 0x4b, 0x03, 0x04, // PK ZIP signature
  0x14, 0x00, 0x06, 0x00, // version, flags
  ...new TextEncoder().encode('synthetic xlsx content'),
]);
export const XLSX_ARTIFACT_FILENAME = 'test-spreadsheet.xlsx';

/** Empty artifact */
export const EMPTY_ARTIFACT_CONTENT = new Uint8Array(0);

/** Generator for oversized content exceeding a byte limit */
export function generateOversizedContent(maxBytes: number): Uint8Array {
  return new Uint8Array(maxBytes + 1);
}

/** Binary artifact with unknown magic bytes */
export const UNKNOWN_BINARY_CONTENT = new Uint8Array([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
]);

/** Text-like content with high non-ASCII ratio (not text heuristic) */
export const NON_TEXT_BINARY = new Uint8Array([
  0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa, 0xf9, 0xf8,
  0xf7, 0xf6, 0xf5, 0xf4, 0xf3, 0xf2, 0xf1, 0xf0,
]);
