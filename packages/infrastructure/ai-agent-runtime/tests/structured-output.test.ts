import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { parseJsonText } from '../src/structured-output/parse.js';
import { parseStructured, validateStructured } from '../src/structured-output/validate.js';
import { thrownCode } from './support.js';

const AnalysisV1 = z.object({
  verdict: z.enum(['open', 'closed']),
  confidence: z.number().min(0).max(1),
});

const StrictV1 = AnalysisV1.strict();

describe('parseJsonText', () => {
  it('parses clean JSON', () => {
    expect(parseJsonText('{"verdict":"open","confidence":0.8}')).toEqual({
      verdict: 'open',
      confidence: 0.8,
    });
  });

  it('strips a bare markdown fence', () => {
    expect(parseJsonText('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('strips a fenced block with language tag and whitespace', () => {
    expect(parseJsonText('``` json  \n{"a":1}\n```\n')).toEqual({ a: 1 });
  });

  it('recovers a JSON object wrapped in prose', () => {
    const raw = 'Here is your analysis:\n{"verdict":"open"}\nHope that helps.';
    expect(parseJsonText(raw)).toEqual({ verdict: 'open' });
  });

  it('rejects malformed JSON', () => {
    expect(thrownCode(() => parseJsonText('{"verdict": }'))).toBe('STRUCTURED_OUTPUT_INVALID');
  });

  it('rejects truncated JSON', () => {
    expect(thrownCode(() => parseJsonText('{"verdict":"open"'))).toBe('STRUCTURED_OUTPUT_INVALID');
  });

  it('rejects empty output', () => {
    expect(thrownCode(() => parseJsonText(''))).toBe('STRUCTURED_OUTPUT_INVALID');
    expect(thrownCode(() => parseJsonText('   '))).toBe('STRUCTURED_OUTPUT_INVALID');
  });

  it('does not arbitrarily repair arrays or scalars from prose', () => {
    expect(thrownCode(() => parseJsonText('just a plain sentence'))).toBe('STRUCTURED_OUTPUT_INVALID');
  });
});

describe('validateStructured', () => {
  it('validates and returns the typed data', () => {
    const data = validateStructured({ verdict: 'open', confidence: 0.7 }, AnalysisV1);
    expect(data).toEqual({ verdict: 'open', confidence: 0.7 });
  });

  it('rejects values that fail schema validation (wrong type)', () => {
    expect(thrownCode(() => validateStructured({ verdict: 42, confidence: 0.7 }, AnalysisV1))).toBe(
      'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects missing required fields', () => {
    expect(thrownCode(() => validateStructured({ verdict: 'open' }, AnalysisV1))).toBe(
      'SCHEMA_VALIDATION_FAILED',
    );
  });

  it('rejects unexpected fields for a strict schema', () => {
    expect(
      thrownCode(() =>
        validateStructured({ verdict: 'open', confidence: 0.7, extra: true }, StrictV1),
      ),
    ).toBe('SCHEMA_VALIDATION_FAILED');
  });

  it('surfaces schema issues by path only — never received values', () => {
    const raw = { verdict: 'open', confidence: '0.9-RECEIVED-VALUE' };
    const error = (() => {
      try {
        validateStructured(raw, AnalysisV1);
        return undefined;
      } catch (caught) {
        return caught;
      }
    })();
    expect(thrownCode(() => {
      if (error !== undefined) throw error;
    })).toBe('SCHEMA_VALIDATION_FAILED');
    const message = error instanceof Error ? error.message : String(error);
    const flattened = JSON.stringify(error);
    expect(message).toContain('confidence');
    expect(message).not.toContain('0.9-RECEIVED-VALUE');
    expect(flattened).not.toContain('0.9-RECEIVED-VALUE');
  });
});

describe('parseStructured', () => {
  it('runs the full parse → validate → reject path', () => {
    const data = parseStructured('```json\n{"verdict":"closed","confidence":0.2}\n```', AnalysisV1);
    expect(data.verdict).toBe('closed');
  });

  it('rejects when JSON is fine but the schema is not', () => {
    expect(
      thrownCode(() => parseStructured('{"verdict":"maybe"}', AnalysisV1)),
    ).toBe('SCHEMA_VALIDATION_FAILED');
  });
});