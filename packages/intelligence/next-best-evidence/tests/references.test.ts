// ============================================================================
// Reference-resolution tests (PR10 §4/fail-closed reference handling)
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  canonicalHypothesisIdFromDerivedId,
  resolveDerivedIdsToUuids,
} from '../src/references.js';
import { H1, H2, INVENTED_H, relDerived, DEFAULT_COMPETING_DERIVED } from './fixtures.js';
import { buildAtomicLookup } from '../src/references.js';
import type { Pr10AtomicHypothesis } from '../src/types.js';

describe('derived-id canonicalization', () => {
  it('extracts the canonical UUID from a RELATION_HYPOTHESIS derivedId', () => {
    expect(canonicalHypothesisIdFromDerivedId(relDerived(H1))).toBe(H1.toLowerCase());
  });

  it('extracts the canonical UUID from an ENTITY_HYPOTHESIS derivedId', () => {
    expect(canonicalHypothesisIdFromDerivedId(`atomic:ENTITY_HYPOTHESIS:${H2}`)).toBe(H2);
  });

  it('normalizes uppercase UUID tails to lowercase', () => {
    expect(canonicalHypothesisIdFromDerivedId(`atomic:RELATION_HYPOTHESIS:${H1.toUpperCase()}`))
      .toBe(H1.toLowerCase());
  });

  it('rejects invented prefixes and malformed shapes (null)', () => {
    expect(canonicalHypothesisIdFromDerivedId('atomic:UNKNOWN_TYPE:0000')).toBeNull();
    expect(canonicalHypothesisIdFromDerivedId('competing:whatever')).toBeNull();
    expect(canonicalHypothesisIdFromDerivedId('free text hypothesis')).toBeNull();
    expect(canonicalHypothesisIdFromDerivedId(`atomic:RELATION_HYPOTHESIS:not-a-uuid`)).toBeNull();
  });
});

describe('closed-world reference resolution', () => {
  it('resolves only references present in the atomic context; counts the rest', () => {
    const context = [
      { derivedId: relDerived(H1) },
      { derivedId: relDerived(H2) },
    ] as Pr10AtomicHypothesis[];
    const lookup = buildAtomicLookup(context);

    const result = resolveDerivedIdsToUuids(
      [relDerived(H1), relDerived(H2), relDerived(INVENTED_H), 'invented'],
      lookup,
    );

    expect(result.resolved).toEqual([H1, H2]);
    expect(result.unresolvableCount).toBe(2);
  });

  it('dedupes and sorts resolved UUIDs', () => {
    const context = DEFAULT_COMPETING_DERIVED.map(
      (derivedId) => ({ derivedId }) as Pr10AtomicHypothesis,
    );
    const lookup = buildAtomicLookup(context);

    const result = resolveDerivedIdsToUuids([relDerived(H2), relDerived(H1), relDerived(H2)], lookup);

    expect(result.resolved).toEqual([H1, H2]);
    expect(result.unresolvableCount).toBe(0);
  });
});