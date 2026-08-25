import { describe, it, expect } from 'vitest';
import { detectMimeType } from '../../src/acquisition/mime-detector.js';
import {
  PDF_ARTIFACT_CONTENT,
  PNG_ARTIFACT_CONTENT,
  JPEG_ARTIFACT_CONTENT,
  DOCX_ARTIFACT_CONTENT,
  XLSX_ARTIFACT_CONTENT,
  TEXT_ARTIFACT_CONTENT,
  UNKNOWN_BINARY_CONTENT,
  NON_TEXT_BINARY,
  EMPTY_ARTIFACT_CONTENT,
} from './fixtures.js';

// ============================================================================
// MIME Detector Tests
//
// Verifies magic-byte detection, filename hints, and fallback behavior.
// ============================================================================

describe('detectMimeType', () => {
  describe('definite detection via magic bytes', () => {
    it('detects PDF', () => {
      const result = detectMimeType(PDF_ARTIFACT_CONTENT, 'report.pdf');
      expect(result.detected).toBe('application/pdf');
      expect(result.confidence).toBe('definite');
    });

    it('detects PNG', () => {
      const result = detectMimeType(PNG_ARTIFACT_CONTENT, 'image.png');
      expect(result.detected).toBe('image/png');
      expect(result.confidence).toBe('definite');
    });

    it('detects JPEG', () => {
      const result = detectMimeType(JPEG_ARTIFACT_CONTENT, 'photo.jpg');
      expect(result.detected).toBe('image/jpeg');
      expect(result.confidence).toBe('definite');
    });

    it('detects GIF', () => {
      const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      const result = detectMimeType(gif, 'animation.gif');
      expect(result.detected).toBe('image/gif');
      expect(result.confidence).toBe('definite');
    });

    it('detects BMP', () => {
      const bmp = new Uint8Array([0x42, 0x4d, 0x00, 0x00]);
      const result = detectMimeType(bmp, 'bitmap.bmp');
      expect(result.detected).toBe('image/bmp');
      expect(result.confidence).toBe('definite');
    });

    it('detects ZIP as generic zip', () => {
      const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
      const result = detectMimeType(zip, 'archive.zip');
      expect(result.detected).toBe('application/zip');
      expect(result.confidence).toBe('definite');
    });
  });

  describe('ZIP container with filename hints', () => {
    it('detects DOCX via filename', () => {
      const result = detectMimeType(DOCX_ARTIFACT_CONTENT, 'report.docx');
      expect(result.detected).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(result.confidence).toBe('definite');
    });

    it('detects XLSX via filename', () => {
      const result = detectMimeType(XLSX_ARTIFACT_CONTENT, 'data.xlsx');
      expect(result.detected).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(result.confidence).toBe('definite');
    });

    it('detects PPTX via filename', () => {
      const pptx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
      const result = detectMimeType(pptx, 'slides.pptx');
      expect(result.detected).toBe(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      );
      expect(result.confidence).toBe('definite');
    });

    it('falls back to application/zip for unknown extension', () => {
      const result = detectMimeType(DOCX_ARTIFACT_CONTENT, 'data.pkg');
      expect(result.detected).toBe('application/zip');
      expect(result.confidence).toBe('definite');
    });
  });

  describe('text heuristic', () => {
    it('detects UTF-8 text as text/plain', () => {
      const result = detectMimeType(TEXT_ARTIFACT_CONTENT, 'readme.txt');
      expect(result.detected).toBe('text/plain');
      expect(result.confidence).toBe('heuristic');
    });

    it('detects plain ASCII text', () => {
      const ascii = new TextEncoder().encode('Hello world, this is plain text.');
      const result = detectMimeType(ascii);
      expect(result.detected).toBe('text/plain');
      expect(result.confidence).toBe('heuristic');
    });
  });

  describe('fallback', () => {
    it('returns octet-stream for unknown binary', () => {
      const result = detectMimeType(UNKNOWN_BINARY_CONTENT, 'data.bin');
      expect(result.detected).toBe('application/octet-stream');
      expect(result.confidence).toBe('fallback');
    });

    it('returns octet-stream for high non-ASCII content', () => {
      const result = detectMimeType(NON_TEXT_BINARY);
      expect(result.detected).toBe('application/octet-stream');
      expect(result.confidence).toBe('fallback');
    });

    it('returns octet-stream for empty content', () => {
      const result = detectMimeType(EMPTY_ARTIFACT_CONTENT);
      expect(result.detected).toBe('application/octet-stream');
      expect(result.confidence).toBe('fallback');
    });
  });

  describe('magic bytes vs filename', () => {
    it('magic bytes are authoritative — filename says PDF, bytes say PNG', () => {
      const result = detectMimeType(PNG_ARTIFACT_CONTENT, 'image.pdf');
      expect(result.detected).toBe('image/png');
      expect(result.confidence).toBe('definite');
    });

    it('magic bytes are authoritative — filename says TXT, bytes say JPEG', () => {
      const result = detectMimeType(JPEG_ARTIFACT_CONTENT, 'notes.txt');
      expect(result.detected).toBe('image/jpeg');
      expect(result.confidence).toBe('definite');
    });
  });

  describe('no filename', () => {
    it('works without filename', () => {
      const result = detectMimeType(PDF_ARTIFACT_CONTENT);
      expect(result.detected).toBe('application/pdf');
      expect(result.confidence).toBe('definite');
    });
  });
});
