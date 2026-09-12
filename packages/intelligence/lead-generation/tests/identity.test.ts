import { describe, it, expect } from 'vitest';
import { deterministicLeadId, buildLeadIdentityKey } from '../src/identity.js';

describe('lead identity', () => {
  it('produces the same id for the same (caseId, type, key)', async () => {
    const input = { caseId: 'case-1', sourceCandidateType: 'BRIDGE' as const, sourceCandidateKey: 'edge-1' };
    const a = await deterministicLeadId(input);
    const b = await deterministicLeadId(input);
    expect(a).toBe(b);
  });

  it('produces different ids for different candidate keys', async () => {
    const a = await deterministicLeadId({ caseId: 'case-1', sourceCandidateType: 'BRIDGE', sourceCandidateKey: 'edge-1' });
    const b = await deterministicLeadId({ caseId: 'case-1', sourceCandidateType: 'BRIDGE', sourceCandidateKey: 'edge-2' });
    expect(a).not.toBe(b);
  });

  it('produces different ids for different cases (case isolation)', async () => {
    const a = await deterministicLeadId({ caseId: 'case-1', sourceCandidateType: 'BRIDGE', sourceCandidateKey: 'edge-1' });
    const b = await deterministicLeadId({ caseId: 'case-2', sourceCandidateType: 'BRIDGE', sourceCandidateKey: 'edge-1' });
    expect(a).not.toBe(b);
  });

  it('produces different ids for different candidate types over the same key', async () => {
    const a = await deterministicLeadId({ caseId: 'case-1', sourceCandidateType: 'BRIDGE', sourceCandidateKey: 'x' });
    const b = await deterministicLeadId({ caseId: 'case-1', sourceCandidateType: 'COMMUNITY', sourceCandidateKey: 'x' });
    expect(a).not.toBe(b);
  });

  it('produces a well-formed UUID v4-shaped string', async () => {
    const id = await deterministicLeadId({ caseId: 'case-1', sourceCandidateType: 'BRIDGE', sourceCandidateKey: 'edge-1' });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('buildLeadIdentityKey is namespaced and stable', () => {
    const key = buildLeadIdentityKey({ caseId: 'case-1', sourceCandidateType: 'BRIDGE', sourceCandidateKey: 'edge-1' });
    expect(key).toBe('indago:lead:v1|case-1|BRIDGE|edge-1');
  });
});
