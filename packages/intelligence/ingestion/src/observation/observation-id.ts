// ============================================================================
// Deterministic Observation Identity (M-A06)
//
// ObservationId MUST be deterministic. NEVER:
//   - randomUUID()
//   - attemptId-only identity
//   - createdAt / ingestion time
//
// Stable identity inputs (locked design):
//   stable evidence identity
//   + stable source identity
//   + canonical source location
//   + ObservationType
//   + canonical observation content
//
// attemptId is EXPLICITLY excluded from the identity: it represents execution
// and may change across retries/reprocessing. Same
// evidence/source/location/type/content MUST yield the same ObservationId.
//
// The versioned identity representation is ALSO the durable
// `observationIdentityKey` used by the platform store for exact-duplicate
// database guards (see observationStore). Content is canonicalized before
// hashing so byte-level whitespace/Unicode differences never split identity.
// ============================================================================

import { computeContentHash } from '../acquisition/content-hasher.js';
import { bytesToUuid4 } from '../acquisition/uuid-bytes.js';
import type { ObservationType } from '@indago/contracts';

export const OBSERVATION_IDENTITY_NAMESPACE = 'indago:observation';
export const OBSERVATION_IDENTITY_VERSION = 1;

export interface ObservationIdentityInput {
  /** Stable evidence identity (retry-safe, includes submission/operation identity) */
  readonly evidenceId: string;
  /** Stable source identity (deterministic catalog source) */
  readonly sourceId: string;
  /** Deterministic serialization of the canonical source location */
  readonly locationKey: string;
  readonly type: ObservationType;
  /** Canonical observation content (whitespace/Unicode-canonicalized) */
  readonly canonicalContent: string;
}

/**
 * Build the versioned canonical identity representation.
 * Exposed separately so the durable store can persist the SAME key used to
 * derive the ObservationId (single source of canonical identity).
 */
export function buildObservationIdentityKey(input: ObservationIdentityInput): string {
  return JSON.stringify([
    OBSERVATION_IDENTITY_NAMESPACE,
    `v${OBSERVATION_IDENTITY_VERSION}`,
    input.evidenceId,
    input.sourceId,
    input.locationKey,
    input.type,
    input.canonicalContent,
  ]);
}

/**
 * Derive a deterministic ObservationId (UUID v4-shaped, satisfies
 * ObservationIdSchema) from the canonical identity representation.
 *
 * Same inputs → same id. Deterministic across machines, retries, and workers.
 */
export async function deterministicObservationId(
  input: ObservationIdentityInput,
): Promise<string> {
  const digest = await computeContentHash(
    new TextEncoder().encode(buildObservationIdentityKey(input)),
  );
  const hexPairs = digest.slice(0, 32).match(/.{1,2}/g) ?? [];
  const bytes = hexPairs.map((h) => parseInt(h, 16));
  return bytesToUuid4(bytes);
}

/**
 * Deterministic, canonical serialization of a source location so the identity
 * is stable while remaining distinct across different locations of the same
 * material. Offsets/indices are included ONLY when the source actually
 * provides them — nothing is fabricated (M-A06 source-citation rule).
 *
 * The `structure` discriminant is a stable label chosen by the extractor:
 *   'line'  → a narrative line / paragraph / span
 *   'row'   → a composed structured record (CDR / transaction / table row)
 *   'path'  → a JSON/XML structural path leaf
 *   'root'  → a whole-document unit (no finer locator available)
 */
export type LocationStructureKind = 'line' | 'row' | 'path' | 'root';

export function serializeSourceLocation(
  structure: LocationStructureKind,
  ref: {
    readonly page?: number;
    readonly line?: number;
    readonly row?: number;
    readonly column?: number;
    readonly block?: number;
    readonly table?: number;
    readonly cell?: number;
    readonly path?: string;
    readonly charStart?: number;
    readonly charEnd?: number;
  },
): string {
  const parts: string[] = [structure];

  // Explicit structural coordinates ONLY when actually provided.
  if (ref.page !== undefined) parts.push(`page:${ref.page}`);
  if (ref.table !== undefined) parts.push(`table:${ref.table}`);
  if (ref.row !== undefined) parts.push(`row:${ref.row}`);
  if (ref.column !== undefined) parts.push(`col:${ref.column}`);
  if (ref.block !== undefined) parts.push(`block:${ref.block}`);
  if (ref.line !== undefined) parts.push(`line:${ref.line}`);
  if (ref.cell !== undefined) parts.push(`cell:${ref.cell}`);
  if (ref.path !== undefined) parts.push(`path:${ref.path}`);

  // Character offsets only when the extraction provides them natively.
  if (ref.charStart !== undefined && ref.charEnd !== undefined) {
    parts.push(`span:${ref.charStart}-${ref.charEnd}`);
  }

  return parts.join(':');
}