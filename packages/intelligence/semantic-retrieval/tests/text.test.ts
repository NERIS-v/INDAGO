import { describe, expect, it } from 'vitest';

import { canonicalizeSemanticText } from '../src/text.js';
import { EmbeddingEngineError } from '../src/types.js';

describe('canonicalizeSemanticText', () => {
  it('trims and collapses whitespace to single ASCII spaces', () => {
    expect(canonicalizeSemanticText('  Payment\n\t  received  on  2024-07-03.  ')).toBe(
      'Payment received on 2024-07-03.',
    );
  });

  it('is deterministic across calls', () => {
    const input = 'Wire transfer   for assignment A-102';
    expect(canonicalizeSemanticText(input)).toBe(canonicalizeSemanticText(input));
  });

  it('preserves case (case folding is deliberately not applied)', () => {
    expect(canonicalizeSemanticText('Payment')).toBe('Payment');
  });

  it('applies NFKC normalization (canonical equivalence)', () => {
    // 'é' as composed (U+00E9) vs decomposed (e + U+0301) map to one form.
    const composed = 'r\u00e9sum\u00e9';
    const decomposed = 're\u0301sume\u0301';
    expect(canonicalizeSemanticText(composed)).toBe(canonicalizeSemanticText(decomposed));
  });

  it('rejects empty and whitespace-only text with EMPTY_SEMANTIC_TEXT', () => {
    for (const bad of ['', '   ', '\n\t  ']) {
      try {
        canonicalizeSemanticText(bad);
        expect.unreachable(`should have thrown for ${JSON.stringify(bad)}`);
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingEngineError);
        expect((error as EmbeddingEngineError).code).toBe('EMPTY_SEMANTIC_TEXT');
      }
    }
  });

  it('rejects non-string input', () => {
    expect(() => canonicalizeSemanticText(123 as unknown as string)).toThrow(
      EmbeddingEngineError,
    );
  });
});