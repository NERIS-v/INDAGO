import { describe, it, expect } from 'vitest';
import { EntityIdSchema } from '@indago/contracts';
import {
  buildEntityIdentityKey,
  deterministicEntityId,
  ENTITY_IDENTITY_NAMESPACE,
  ENTITY_IDENTITY_VERSION,
} from '../src/index.js';

// ============================================================================
// M-A09.5 Canonical Entity — deterministic identity unit tests
//
// Canonical EntityId is the deterministic, case-scoped identity that M-A09.5
// materialization and M-A10 relation resolution both consume. HARD RULES under
// test:
//   § deterministic — same (caseId, canonicalName, entityType) ⇒ same id across
//     passes, retries, and workers (no randomUUID, no clock, no attempt id).
//   § case-scoped — the identity embeds caseId, so a canonical name in a
//     different case yields a DIFFERENT EntityId (no cross-case collision).
//   § stable across materialization retry — the durable store persists the
//     identityKey that derives the id, so idempotent re-materialization
//     converges to the same canonical Entity (exact-dedup guard).
//   § EntityIdSchema-valid — the derived id is a valid EntityId (UUID shape),
//     because M-A10 / EntityStore consume real canonical EntityIds.
//   § ABSENT entityType is a distinct identity input — an untyped canonical
//     entity is NOT the same canonical identity as a typed one.
// ============================================================================

const CASE = '550e8400-e29b-41d4-a716-446655440010';

describe('M-A09.5 canonical entity identity', () => {
  it('is deterministic across repeated derivation (no random identity)', async () => {
    const input = { caseId: CASE, canonicalName: 'Acme Corp', entityType: 'ORGANIZATION' };
    const a = await deterministicEntityId(input);
    const b = await deterministicEntityId(input);
    expect(a).toBe(b);
  });

  it('derives a valid EntityId (EntityIdSchema shape)', async () => {
    const input = { caseId: CASE, canonicalName: 'Acme Corp', entityType: 'ORGANIZATION' };
    const id = await deterministicEntityId(input);
    expect(EntityIdSchema.safeParse(id).success).toBe(true);
  });

  it('is case-scoped — the same name in a different case diverges', async () => {
    const other = '550e8400-e29b-41d4-a716-446655440099';
    const a = await deterministicEntityId({ caseId: CASE, canonicalName: 'Acme Corp', entityType: 'ORGANIZATION' });
    const b = await deterministicEntityId({ caseId: other, canonicalName: 'Acme Corp', entityType: 'ORGANIZATION' });
    expect(a).not.toBe(b);
  });

  it('identityKey matches the persisted EntityStore boundary format', () => {
    const key = buildEntityIdentityKey({
      caseId: CASE,
      canonicalName: 'Acme Corp',
      entityType: 'ORGANIZATION',
    });
    expect(key).toContain(ENTITY_IDENTITY_NAMESPACE);
    expect(key).toContain(`v${ENTITY_IDENTITY_VERSION}`);
    expect(key).toContain(CASE);
    expect(key).toContain('Acme Corp');
    // JSON array of [namespace, vN, caseId, canonicalName, entityType|null].
    expect(JSON.parse(key)).toEqual(['indago:entity', 'v1', CASE, 'Acme Corp', 'ORGANIZATION']);
  });

  it('absent entityType is a distinct identity input (untyped vs typed)', async () => {
    const typed = await deterministicEntityId({ caseId: CASE, canonicalName: 'Acme Corp', entityType: 'ORGANIZATION' });
    const untyped = await deterministicEntityId({ caseId: CASE, canonicalName: 'Acme Corp' });
    expect(typed).not.toBe(untyped);
  });

  it('is deterministic with entityType absent (nullable canonical identity)', async () => {
    const a = await deterministicEntityId({ caseId: CASE, canonicalName: '919876543210' });
    const b = await deterministicEntityId({ caseId: CASE, canonicalName: '919876543210' });
    expect(a).toBe(b);
  });

  it('a different canonicalName diverges (no name collisions)', async () => {
    const a = await deterministicEntityId({ caseId: CASE, canonicalName: 'Acme Corp', entityType: 'ORGANIZATION' });
    const b = await deterministicEntityId({ caseId: CASE, canonicalName: 'Globex', entityType: 'ORGANIZATION' });
    expect(a).not.toBe(b);
  });
});
