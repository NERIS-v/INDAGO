import { describe, it, expect } from 'vitest';
import {
  NormalizationService,
  NORMALIZER_ID,
  NORMALIZER_VERSION,
  parseStoredRawExtraction,
  RawExtractionBodySchema,
  PersistedRawExtractionRowSchema,
} from '../../src/index.js';

// ============================================================================
// M-A05 Normalization Barrel Exports
//
// Verifies the normalization surface is exported from the @indago/ingestion
// package (runtime shape) and that no forbidden infrastructure leaked into
// the normalization module when re-exported through the barrel.
// ============================================================================

describe('M-A05 Barrel Exports: Runtime', () => {
  it('NormalizationService is a class exposing the pure normalize entry point', () => {
    const svc = new NormalizationService();
    expect(typeof NormalizationService).toBe('function');
    expect(typeof svc.normalize).toBe('function');
  });

  it('exposes the pinned engine identity constants', () => {
    expect(NORMALIZER_ID).toBe('indago-text-canonicalizer');
    expect(NORMALIZER_VERSION).toBe('1.0.0');
  });

  it('exposes parseStoredRawExtraction and the strict row/body schemas', () => {
    expect(typeof parseStoredRawExtraction).toBe('function');
    expect(RawExtractionBodySchema).toBeDefined();
    expect(PersistedRawExtractionRowSchema).toBeDefined();
    expect(typeof PersistedRawExtractionRowSchema.parse).toBe('function');
    expect(typeof RawExtractionBodySchema.parse).toBe('function');
  });

  it('does not export Prisma, Neo4j, BullMQ, Redis, React, Express or UploadThing', async () => {
    const forbidden = ['prisma', 'neo4j', 'bullmq', 'redis', 'react', 'express', 'uploadthing'];
    const mod = await import('../../src/index.js');
    const moduleExports = Object.keys(mod);
    for (const name of forbidden) {
      const found = moduleExports.find((e) => e.toLowerCase().includes(name));
      expect(found).toBeUndefined();
    }
  });
});