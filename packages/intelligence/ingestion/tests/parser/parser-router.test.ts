import { describe, it, expect } from 'vitest';
import { selectParser } from '../../src/parser/parser-router.js';
import { ParserRegistry } from '../../src/parser/parser-registry.js';
import { createDefaultParserRegistry } from '../../src/parser/builtins/index.js';
import type { ArtifactClassification } from '../../src/classification/types.js';
import type { ArtifactParser } from '../../src/parser/artifact-parser.js';

// ============================================================================
// Parser Router Tests
//
// Verifies deterministic parser selection from classification + registry.
// ============================================================================

function createClassification(overrides: Partial<ArtifactClassification> = {}): ArtifactClassification {
  return {
    artifactId: '550e8400-e29b-41d4-a716-446655440000',
    contentHash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    detectedMimeType: 'application/pdf',
    format: 'PDF',
    family: 'DOCUMENT',
    encoding: 'BINARY',
    confidence: 'definite',
    detectionMethod: 'mime-detection',
    originalFilename: 'document.pdf',
    ...overrides,
  };
}

function makeParser(overrides: Partial<ArtifactParser['capability']> & { parserId: string }, matchFn?: (c: ArtifactClassification) => boolean): ArtifactParser {
  return {
    capability: {
      parserVersion: '0.1.0',
      displayName: overrides.parserId,
      supportedFormats: ['PDF'],
      supportedMimeTypes: ['application/pdf'],
      supportedFamilies: ['DOCUMENT'],
      priority: 100,
      acceptsFallbackFormats: false,
      ...overrides,
    },
    canParse: matchFn ?? ((c) => c.format === (overrides.supportedFormats?.[0] ?? 'PDF')),
  };
}

describe('selectParser', () => {
  it('selects PDF parser for PDF classification', () => {
    const registry = createDefaultParserRegistry();
    const classification = createClassification();
    const result = selectParser(classification, registry);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.route.parserId).toBe('pdf-parser');
      expect(result.route.format).toBe('PDF');
      expect(result.route.reason).toContain('Exact format match');
    }
  });

  it('selects CSV parser for CSV classification', () => {
    const registry = createDefaultParserRegistry();
    const classification = createClassification({
      detectedMimeType: 'text/csv',
      format: 'CSV',
      family: 'STRUCTURED_DATA',
    });
    const result = selectParser(classification, registry);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.route.parserId).toBe('csv-parser');
    }
  });

  it('selects JSON parser for JSON classification', () => {
    const registry = createDefaultParserRegistry();
    const classification = createClassification({
      detectedMimeType: 'application/json',
      format: 'JSON',
      family: 'STRUCTURED_DATA',
    });
    const result = selectParser(classification, registry);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.route.parserId).toBe('json-parser');
    }
  });

  it('selects image parser for IMAGE classification', () => {
    const registry = createDefaultParserRegistry();
    const classification = createClassification({
      detectedMimeType: 'image/png',
      format: 'IMAGE',
      family: 'IMAGE',
      encoding: 'BINARY',
    });
    const result = selectParser(classification, registry);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.route.parserId).toBe('image-parser');
    }
  });

  it('returns error for UNKNOWN format', () => {
    const registry = createDefaultParserRegistry();
    const classification = createClassification({
      detectedMimeType: 'application/octet-stream',
      format: 'UNKNOWN',
      family: 'UNKNOWN',
      confidence: 'fallback',
      detectionMethod: 'unknown',
    });
    const result = selectParser(classification, registry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('UNSUPPORTED_FORMAT');
      expect(result.error.code).toBe('NO_PARSER_MATCH');
    }
  });

  it('returns error when registry is empty', () => {
    const registry = new ParserRegistry();
    const classification = createClassification();
    const result = selectParser(classification, registry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('UNSUPPORTED_FORMAT');
      expect(result.error.code).toBe('NO_PARSER_MATCH');
    }
  });

  it('is deterministic — same inputs produce same route', () => {
    const registry = createDefaultParserRegistry();
    const classification = createClassification();
    const r1 = selectParser(classification, registry);
    const r2 = selectParser(classification, registry);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.route.parserId).toBe(r2.route.parserId);
      expect(r1.route.reason).toBe(r2.route.reason);
    }
  });

  it('includes all classification metadata in route', () => {
    const registry = createDefaultParserRegistry();
    const classification = createClassification();
    const result = selectParser(classification, registry);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.route.artifactId).toBe(classification.artifactId);
      expect(result.route.contentHash).toBe(classification.contentHash);
      expect(result.route.format).toBe(classification.format);
      expect(result.route.family).toBe(classification.family);
      expect(result.route.encoding).toBe(classification.encoding);
      expect(result.route.confidence).toBe(classification.confidence);
      expect(result.route.detectionMethod).toBe(classification.detectionMethod);
    }
  });

  it('family match works only when acceptsFallbackFormats is true', () => {
    const registry = new ParserRegistry();
    registry.register(makeParser({
      parserId: 'generic-doc-parser',
      supportedFormats: ['DOCX'],
      supportedFamilies: ['DOCUMENT'],
      acceptsFallbackFormats: true,
    }, (c) => c.format === 'DOCX' || c.family === 'DOCUMENT'));

    const classification = createClassification({
      format: 'PDF',
      family: 'DOCUMENT',
    });

    const result = selectParser(classification, registry);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.route.parserId).toBe('generic-doc-parser');
      expect(result.route.reason).toContain('Family match');
    }
  });

  it('family fallback rejected when acceptsFallbackFormats is false', () => {
    const registry = new ParserRegistry();
    registry.register(makeParser({
      parserId: 'strict-doc-parser',
      supportedFormats: ['DOCX'],
      supportedFamilies: ['DOCUMENT'],
      acceptsFallbackFormats: false,
    }, (c) => c.format === 'DOCX' || c.family === 'DOCUMENT'));

    const classification = createClassification({
      format: 'PDF',
      family: 'DOCUMENT',
    });

    const result = selectParser(classification, registry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('selects lower priority number when multiple parsers match', () => {
    const registry = new ParserRegistry();
    registry.register(makeParser({
      parserId: 'low-priority',
      supportedFormats: ['PDF'],
      priority: 200,
    }));
    registry.register(makeParser({
      parserId: 'high-priority',
      supportedFormats: ['PDF'],
      priority: 10,
    }));

    const classification = createClassification();
    const result = selectParser(classification, registry);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.route.parserId).toBe('high-priority');
    }
  });

  it('tie-breaks alphabetically when priorities are equal', () => {
    const registry = new ParserRegistry();
    registry.register(makeParser({
      parserId: 'z-parser',
      supportedFormats: ['PDF'],
      priority: 100,
    }));
    registry.register(makeParser({
      parserId: 'a-parser',
      supportedFormats: ['PDF'],
      priority: 100,
    }));

    const classification = createClassification();
    const result = selectParser(classification, registry);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.route.parserId).toBe('a-parser');
    }
  });
});
