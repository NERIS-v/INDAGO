import { describe, expect, it } from 'vitest';

import { contentHashOf, queryHashOf, sha256Hex } from '../src/content-hash.js';

describe('sha256Hex', () => {
  it('matches the standard empty-string digest', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('is deterministic and hex-encoded', () => {
    expect(sha256Hex('Payment received')).toBe(sha256Hex('Payment received'));
    expect(sha256Hex('Payment received')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('contentHashOf', () => {
  it('hashes the canonical text and never the raw input', () => {
    expect(contentHashOf('Payment received')).toBe(sha256Hex('Payment received'));
    expect(contentHashOf(' Payment received ')).not.toBe(contentHashOf('Payment received'));
  });
});

describe('queryHashOf', () => {
  const scope = {
    caseId: '11bf5b37-e0b8-42e0-8dcf-dc8c4aefc000',
    canonicalQuery: 'Payment received July',
    temporalContext: null,
  };

  it('is deterministic and free of timestamps/randomness', () => {
    expect(queryHashOf(scope)).toBe(queryHashOf({ ...scope }));
    expect(queryHashOf(scope)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the case, query or temporal context changes', () => {
    const base = queryHashOf(scope);
    expect(queryHashOf({ ...scope, caseId: '22bf5b37-e0b8-42e0-8dcf-dc8c4aefc000' })).not.toBe(base);
    expect(queryHashOf({ ...scope, canonicalQuery: 'received July' })).not.toBe(base);
    expect(
      queryHashOf({
        ...scope,
        temporalContext: {
          validFrom: { value: '2024-07-01', precision: 'day' },
          precision: 'day' as const,
          semantics: 'observed' as const,
        },
      }),
    ).not.toBe(base);
  });
});