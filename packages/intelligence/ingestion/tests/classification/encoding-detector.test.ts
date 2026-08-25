import { describe, it, expect } from 'vitest';
import { detectEncoding } from '../../src/classification/encoding-detector.js';

// ============================================================================
// Encoding Detector Tests
//
// Verifies UTF-8, UTF-8 BOM, UTF-16 LE/BE, binary detection.
// ============================================================================

describe('detectEncoding', () => {
  it('returns UNKNOWN for empty bytes', () => {
    const bytes = new Uint8Array(0);
    expect(detectEncoding(bytes)).toBe('UNKNOWN');
  });

  it('detects UTF-8 BOM', () => {
    // UTF-8 BOM: EF BB BF
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    expect(detectEncoding(bytes)).toBe('UTF8_BOM');
  });

  it('detects UTF-16 LE BOM', () => {
    // UTF-16 LE BOM: FF FE
    const bytes = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x65, 0x00]);
    expect(detectEncoding(bytes)).toBe('UTF16_LE');
  });

  it('detects UTF-16 BE BOM', () => {
    // UTF-16 BE BOM: FE FF
    const bytes = new Uint8Array([0xfe, 0xff, 0x00, 0x48, 0x00, 0x65]);
    expect(detectEncoding(bytes)).toBe('UTF16_BE');
  });

  it('detects valid UTF-8 text', () => {
    const text = new TextEncoder().encode('Hello, world! This is UTF-8 text.');
    expect(detectEncoding(text)).toBe('UTF8');
  });

  it('detects valid UTF-8 with multi-byte characters', () => {
    const text = new TextEncoder().encode('Hello — world! 你好世界');
    expect(detectEncoding(text)).toBe('UTF8');
  });

  it('detects binary content (null bytes)', () => {
    const bytes = new Uint8Array([0x48, 0x00, 0x65, 0x00, 0x6c, 0x00]);
    expect(detectEncoding(bytes)).toBe('BINARY');
  });

  it('detects high-byte binary content', () => {
    // Bytes that are not valid UTF-8
    const bytes = new Uint8Array([0xc0, 0xc1, 0xf5, 0xfe]);
    expect(detectEncoding(bytes)).toBe('BINARY');
  });

  it('is deterministic — same bytes produce same encoding', () => {
    const text = new TextEncoder().encode('Deterministic test content');
    const enc1 = detectEncoding(text);
    const enc2 = detectEncoding(text);
    expect(enc1).toBe(enc2);
  });

  it('detects ASCII subset as UTF-8', () => {
    const ascii = new Uint8Array([0x41, 0x42, 0x43, 0x20, 0x31, 0x32, 0x33]);
    expect(detectEncoding(ascii)).toBe('UTF8');
  });

  it('handles binary format content correctly', () => {
    // PDF magic bytes: %PDF
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    // PDF contains no null bytes and is valid ASCII, so UTF-8
    expect(detectEncoding(pdf)).toBe('UTF8');
  });
});
