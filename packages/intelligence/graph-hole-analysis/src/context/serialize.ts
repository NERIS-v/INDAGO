// ============================================================================
// Canonical serialization (Phase 5A-PR7)
//
// The model-facing package is the canonical JSON of a purpose-built PROFILE
// object. Byte-stability is a hard property:
//   - object keys are always emitted in ascending deterministic order
//     (recursively);
//   - arrays are emitted exactly in their builder-canonical order (the builder
//     already sorts by stable keys; the serializer NEVER re-sorts arrays);
//   - all `undefined` values are normalized to `null` BEFORE stringification,
//     so optional fields keep a fixed position (no key-drop variance);
//   - numbers/booleans/null/strings render natively; NaN/Infinity are refused
//     (canonical JSON has no representation for them).
//
// The SHA-256 digest over this string is the context identity stamp
// (`contextSha256`); identical authoritative input ⇒ identical digest.
// ============================================================================

import { GraphHoleAnalysisError } from '../errors/analysis-error.js';
import { sha256Hex } from './sha256.js';

function canonicalObject(value: Record<string, unknown>, out: string[]): void {
  const keys = Object.keys(value).sort();
  out.push('{');
  let first = true;
  for (const key of keys) {
    if (!first) out.push(',');
    first = false;
    out.push(JSON.stringify(key), ':');
    canonicalize(value[key], out);
  }
  out.push('}');
}

function canonicalize(value: unknown, out: string[]): void {
  if (value === null || value === undefined) {
    out.push('null');
    return;
  }
  if (typeof value === 'boolean') {
    out.push(value ? 'true' : 'false');
    return;
  }
  if (typeof value === 'string') {
    out.push(JSON.stringify(value));
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new GraphHoleAnalysisError(
        'INPUT_CONTEXT_INCONSISTENT',
        `Non-finite number cannot be canonicalized: ${String(value)}`,
      );
    }
    // Avoid -0 variance; identical integral values must render identically.
    out.push(Object.is(value, -0) ? '0' : String(value));
    return;
  }
  if (Array.isArray(value)) {
    out.push('[');
    for (let i = 0; i < value.length; i++) {
      if (i > 0) out.push(',');
      canonicalize(value[i], out);
    }
    out.push(']');
    return;
  }
  if (typeof value === 'object') {
    canonicalObject(value as Record<string, unknown>, out);
    return;
  }
  throw new GraphHoleAnalysisError(
    'INPUT_CONTEXT_INCONSISTENT',
    `Unsupported canonical value of type ${typeof value}`,
  );
}

/** Deterministic JSON string: sorted object keys, arrays untouched, undefined→null. */
export function canonicalStringify(value: unknown): string {
  const out: string[] = [];
  canonicalize(value, out);
  return out.join('');
}

/** Canonical identity digest of the serialized profile. */
export function digestOf(value: unknown): string {
  return sha256Hex(canonicalStringify(value));
}

/**
 * Serialize + digest the model-facing profile, enforcing the charBudget cap.
 * Exceeding the bound is a hard feature failure (CONTEXT_TOO_LARGE) — the
 * package provider NEVER silently truncates the package it promises to furnish.
 */
export function serializeGraphHoleAnalysisProfile(
  profile: Record<string, unknown>,
  charBudget: number,
): { readonly serialized: string; readonly seralizedContextChars: number; readonly contextSha256: string } {
  const serialized = canonicalStringify(profile);
  const chars = serialized.length;
  if (chars > charBudget) {
    throw new GraphHoleAnalysisError(
      'CONTEXT_TOO_LARGE',
      `Serialized context is ${chars} chars (budget ${charBudget})`,
    );
  }
  return { serialized, seralizedContextChars: chars, contextSha256: sha256Hex(serialized) };
}