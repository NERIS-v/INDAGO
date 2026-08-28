import { describe, it, expect } from 'vitest';
import { deterministicSourceId } from '../../src/acquisition/source-id.js';
import { SourceIdSchema } from '@indago/contracts';

// ============================================================================
// deterministicSourceId Tests
//
// Deterministic source identity: same seed → same UUID, valid against the
// canonical SourceIdSchema, distinct across investigations/files. No random
// fabrication — retries over BullMQ always resolve to the same sourceId.
// ============================================================================

const INV_A = '550e8400-e29b-41d4-a716-446655440000';
const INV_B = '660e8400-e29b-41d4-a716-446655440001';

describe('deterministicSourceId', () => {
  it('returns a UUID satisfying SourceIdSchema', async () => {
    const sid = await deterministicSourceId(`${INV_A}:abc123.pdf`);
    expect(SourceIdSchema.safeParse(sid).success).toBe(true);
  });

  it('is deterministic — same seed, same sourceId', async () => {
    const seed = `${INV_A}:abc123.pdf`;
    const s1 = await deterministicSourceId(seed);
    const s2 = await deterministicSourceId(seed);
    expect(s1).toBe(s2);
  });

  it('different fileKey → different sourceId', async () => {
    const s1 = await deterministicSourceId(`${INV_A}:abc123.pdf`);
    const s2 = await deterministicSourceId(`${INV_A}:def456.pdf`);
    expect(s1).not.toBe(s2);
  });

  it('different investigationId → different sourceId', async () => {
    const s1 = await deterministicSourceId(`${INV_A}:abc123.pdf`);
    const s2 = await deterministicSourceId(`${INV_B}:abc123.pdf`);
    expect(s1).not.toBe(s2);
  });
});