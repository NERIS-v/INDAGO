// ============================================================================
// M-A08 Candidate Pair — blocking passes and deterministic block keys
//
// Each pass is a DETERMINISTIC, code-only rule that groups candidates into
// blocks. A BlockKey means "candidates sharing this key belong to the same
// candidate-generation block" — it does NOT imply identity.
//
// Passes are type-aware and bounded. Untyped (NULL) and OTHER candidates are
// handled conservatively so they never become universal pair generators.
// ============================================================================

import type { BlockingPass, EntityMentionCandidate, EntityType } from '@indago/contracts';

/**
 * A typed, deterministic block key. `value` is the normalized grouping token;
 * `entityType` is the concrete type when the candidate is typed, or the
 * literal 'untyped' for a NULL candidate — so NULL candidates can never share
 * a block with a typed candidate for the same token.
 */
export interface BlockKey {
  readonly pass: BlockingPass;
  readonly entityType: EntityType | 'untyped';
  readonly value: string;
}

/** Structured-identifier types that produce Pass-1 strong identifier keys. */
const STRONG_IDENTIFIER_TYPES: ReadonlySet<EntityType> = new Set([
  'EMAIL',
  'PHONE',
  'ACCOUNT',
  'DEVICE',
  'VEHICLE',
  'ADDRESS',
]);

/** Name-like types that carry a meaningful canonical value for Pass 2. */
const CANONICAL_VALUE_TYPES: ReadonlySet<EntityType> = new Set([
  'PERSON',
  'ORGANIZATION',
  'LOCATION',
]);

/** Two candidate types are compatible if they are the SAME type, or both
 * untyped (NULL). Cross-type and NULL↔typed pairings are never compatible —
 * this prevents NULL/OTHER from becoming a universal match. OTHER↔OTHER is
 * allowed only because it is a concrete same-type match. */
export function areTypesCompatible(
  a: EntityType | undefined,
  b: EntityType | undefined,
): boolean {
  if (a !== undefined && b !== undefined) return a === b;
  if (a === undefined && b === undefined) return true;
  return false;
}

function typedKey(token: EntityType | undefined, value: string): string {
  return `${token ?? 'untyped'}:${value}`;
}

/**
 * Pass 1 — EXACT_STRONG_IDENTIFIER.
 * Applies to structured-identifier types (email/phone/account/device/vehicle/
 * address) with a deterministic canonical value. Uses M-A07's
 * canonicalMatchValue (the only normalized identifier the candidate carries);
 * MA05 linkage is indirect through the observation, never re-derived here.
 */
export function strongIdentifierKey(
  candidate: EntityMentionCandidate,
): { key: string; pass: BlockingPass } | undefined {
  const t = candidate.entityType;
  if (t === undefined) return undefined; // untyped candidates are not strong identifiers
  if (!STRONG_IDENTIFIER_TYPES.has(t)) return undefined;
  const value = candidate.canonicalMatchValue;
  if (value === undefined || value.length === 0) return undefined;
  return { key: typedKey(t, value), pass: 'EXACT_STRONG_IDENTIFIER' };
}

/**
 * Pass 2 — EXACT_CANONICAL_VALUE.
 * Applies to name-like types (PERSON/ORGANIZATION/LOCATION) plus untyped
 * candidates that still carry a deterministic canonicalMatchValue. Identical
 * canonical value + compatible type → same block. Raw surface text alone is
 * never the key — only the normalized canonical value.
 */
export function canonicalValueKey(
  candidate: EntityMentionCandidate,
): { key: string; pass: BlockingPass } | undefined {
  const t = candidate.entityType;
  // Untyped candidates may participate ONLY when they have a deterministic
  // canonical value, and they block apart from typed candidates.
  if (t !== undefined && !CANONICAL_VALUE_TYPES.has(t)) return undefined;
  const value = candidate.canonicalMatchValue;
  if (value === undefined || value.length === 0) return undefined;
  return { key: typedKey(t, value), pass: 'EXACT_CANONICAL_VALUE' };
}

/**
 * Deterministic surname + first-initial derivation for PERSON names.
 * Returns undefined for single-token names or anything not name-like.
 * Only conservative, whole-token structure is used — never "first two letters",
 * arbitrary substrings, or phonetic keys.
 *
 * "Rahul Sharma"    → { surname: 'sharma', firstInitial: 'r' }
 * "R. Sharma"       → { surname: 'sharma', firstInitial: 'r' }
 */
export function deriveSurnameInitial(
  text: string,
): { surname: string; firstInitial: string } | undefined {
  const tokens = text.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length < 2) return undefined;
  const first = tokens[0]!;
  const surname = tokens[tokens.length - 1]!;
  const firstInitial = (first[0] ?? '').toLowerCase();
  const surnameLower = surname.toLowerCase();
  if (surnameLower.length === 0 || firstInitial.length === 0) return undefined;
  return { surname: surnameLower, firstInitial };
}

/**
 * Pass 3 — NAME_INITIAL_BLOCK.
 * Applies to PERSON candidates with a deterministic surname + first initial.
 * A looser recall pass that groups "Rahul Sharma" with "R. Sharma". It stays
 * bounded because it is subject to maxBlockSize, and it never matches on
 * first-name-only tokens.
 */
export function nameInitialKey(
  candidate: EntityMentionCandidate,
): { key: string; pass: BlockingPass } | undefined {
  if (candidate.entityType !== 'PERSON') return undefined;
  const n = deriveSurnameInitial(candidate.text);
  if (n === undefined) return undefined;
  return {
    key: `person:${n.surname}:${n.firstInitial}`,
    pass: 'NAME_INITIAL_BLOCK',
  };
}
