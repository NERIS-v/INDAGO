// ============================================================================
// Identity Canonicalization (Phase 5A-PR0)
//
// Minimal, pure, deterministic serialization used for region and candidate
// identities.
//
// Contract-level rules (frozen for V1):
//   - object keys are serialized in sorted order (never insertion order)
//   - arrays whose elements are all strings are sorted ascending
//     (this is what makes "same IDs in different input order" collapse to the
//     same canonical identity)
//   - no timestamps of "now", no random UUIDs, no environment state, no
//     iteration-order dependence are ever introduced here
//
// The output is a stable STRING. Later PRs (PR1/PR2 region builder, PR5
// qualification identity) may feed it to a content hash (e.g. SHA-256) to
// produce regionId / candidateId. This module does NOT decide or compute the
// digest — it only guarantees the canonical serialization is stable.
//
// This is a policy/canonicalization utility, NOT a graph-hole detection
// algorithm.
// ============================================================================

/**
 * Deterministic canonical JSON serialization of an identity-shaped value.
 *
 * Sorted keys, sorted string arrays. Result is stable across:
 *   - object key insertion order
 *   - string-array element order
 */
export function canonicalizeDeterministic(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => normalize(item));
    if (items.every((item) => typeof item === 'string')) {
      items.sort();
    }
    return items;
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = normalize(value[key]);
    }
    return out;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}