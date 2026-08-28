// ============================================================================
// Deterministic Source Identity
//
// Derives a stable, valid SourceIdSchema UUID from a seed value (e.g. the
// upstream provider's fileKey for this investigation).
//
// Rationale: evidence submitted via the platform currently has no Source
// domain record (Source domains land pre-MA05). Fabricating a random source
// UUID per execution would break retry-idempotency and provenance. Instead
// we derive a deterministic UUID — same seed, same sourceId, every execution —
// satisfying the canonical SourceIdSchema contract. Provenance is documented
// in the ingestion tables; a real Source domain record supersedes this when
// MA05 lands.
// ============================================================================

import { computeContentHash } from './content-hasher.js';
import { bytesToUuid4 } from './uuid-bytes.js';

const SOURCE_ID_NAMESPACE = 'indago:source';

/**
 * Derive a deterministic source ID (UUID v4-shaped) from a seed string.
 *
 * Same seed → same sourceId. Must not be used as a secret or as a
 * substitute for a real Source domain record.
 */
export async function deterministicSourceId(seed: string): Promise<string> {
  const digest = await computeContentHash(
    new TextEncoder().encode(`${SOURCE_ID_NAMESPACE}:${seed}`),
  );
  const hexPairs = digest.slice(0, 32).match(/.{1,2}/g) ?? [];
  const bytes = hexPairs.map((h) => parseInt(h, 16));
  return bytesToUuid4(bytes);
}