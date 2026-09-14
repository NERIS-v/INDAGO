import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { convertSchemaDocument } from '../src/structured-output/schema.js';
import { thrownCode } from './support.js';

const AnalysisV1 = z.object({
  verdict: z.enum(['open', 'closed']),
  confidence: z.number().min(0).max(1),
  note: z.string().optional(),
});

describe('convertSchemaDocument', () => {
  it('is fully deterministic: identical schema → identical bytes', () => {
    const first = convertSchemaDocument(AnalysisV1);
    const second = convertSchemaDocument(AnalysisV1);
    expect(first.serialized).toBe(second.serialized);
    expect(first.schema).toEqual(second.schema);
    expect(first.byteLength).toBe(second.byteLength);
    expect(first.byteLength).toBe(Buffer.byteLength(first.serialized, 'utf8'));
  });

  it('produces the shared provider subset: enum, required, no $schema in the document', () => {
    const doc = convertSchemaDocument(AnalysisV1);
    const schema = doc.schema as {
      type?: string;
      properties?: Record<string, { type?: string; enum?: string[] }>;
      required?: string[];
    };

    expect(schema.type).toBe('object');
    expect(schema.properties?.verdict).toEqual({ type: 'string', enum: ['open', 'closed'] });
    expect(schema.properties?.note).toEqual({ type: 'string' });
    expect(schema.required).toEqual(['verdict', 'confidence']);
    expect(doc.serialized).not.toContain('$schema');
    expect(doc.serialized).not.toContain('$ref');
  });

  it('normalizes a nullable union into a null-in-type-array enum and leaves optional properties out of required', () => {
    const schema = convertSchemaDocument(
      z.object({ status: z.enum(['a', 'b']).nullable().optional() }),
    ).schema as { properties?: Record<string, unknown>; required?: string[] };

    expect(schema.properties?.status).toEqual({ type: ['string', 'null'], enum: ['a', 'b'] });
    expect(schema.required).toBeUndefined();
  });

  it('normalizes const into enum (providers have no const keyword)', () => {
    const doc = convertSchemaDocument(z.literal('x'));
    expect(doc.schema).toEqual({ type: 'string', enum: ['x'] });
  });

  it('keeps plain nullable read as a [type, null] array', () => {
    const doc = convertSchemaDocument(
      z.object({ score: z.number().nullable() }),
    ).schema as { properties?: { score?: unknown } };
    expect(doc.properties?.score).toEqual({ type: ['number', 'null'] });
  });

  it('keeps arrays and records expressible in the subset', () => {
    const arrayDoc = convertSchemaDocument(z.array(z.enum(['x', 'y'])));
    expect(arrayDoc.schema).toEqual({
      type: 'array',
      items: { type: 'string', enum: ['x', 'y'] },
    });

    const recordDoc = convertSchemaDocument(z.record(z.string(), z.number()));
    expect(recordDoc.schema).toEqual({
      type: 'object',
      additionalProperties: { type: 'number' },
    });
  });

  it('rejects an unconstrained (typeless) root with SCHEMA_VALIDATION_FAILED', () => {
    expect(thrownCode(() => convertSchemaDocument(z.any()))).toBe('SCHEMA_VALIDATION_FAILED');
    expect(thrownCode(() => convertSchemaDocument(z.unknown()))).toBe('SCHEMA_VALIDATION_FAILED');
  });

  it('rejects recursive lazy schemas (inline $ref) with UNSUPPORTED_CAPABILITY', () => {
    type NodeZ = z.ZodTypeAny;
    const node: NodeZ = z.lazy(() =>
      z.object({ children: z.array(node).optional() }),
    );
    expect(thrownCode(() => convertSchemaDocument(node))).toBe('UNSUPPORTED_CAPABILITY');
  });

  it('rejects oversized schemas with SCHEMA_VALIDATION_FAILED (maxBytes bound)', () => {
    expect(thrownCode(() => convertSchemaDocument(AnalysisV1, { maxBytes: 64 }))).toBe(
      'SCHEMA_VALIDATION_FAILED',
    );
    expect(() => convertSchemaDocument(AnalysisV1, { maxBytes: 10_000_000 })).not.toThrow();
  });

  it('rejects construct the shared provider subset cannot enforce (UNSUPPORTED_CAPABILITY)', () => {
    const cases: Array<[string, z.ZodTypeAny]> = [
      ['union-of-objects (anyOf)', z.union([z.object({ a: z.string() }), z.object({ b: z.string() })])],
      ['string length bound (minLength)', z.string().min(1)],
      ['string regex (pattern)', z.string().regex(/^[a-z]+$/u)],
      ['exclusive numeric bound', z.number().gt(5)],
      ['tuple (array-form items)', z.tuple([z.string(), z.number()])],
    ];
    for (const [name, schema] of cases) {
      expect(thrownCode(() => convertSchemaDocument(schema)), name).toBe('UNSUPPORTED_CAPABILITY');
    }
  });

  it('does not mutate or consume the caller zod schema', () => {
    const schema = AnalysisV1;
    const before = schema.safeParse({ verdict: 'open', confidence: 0.5 });
    convertSchemaDocument(schema);
    const after = schema.safeParse({ verdict: 'open', confidence: 0.5 });
    expect(after.success).toBe(true);
    expect(before.success).toBe(true);
  });
});