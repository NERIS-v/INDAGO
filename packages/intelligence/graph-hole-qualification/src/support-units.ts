// ============================================================================
// Independent support-unit derivation (Phase 5A-PR5)
//
// V1 support-unit rule (frozen, graph-hole-policy.ts §9):
//   sourceContextId  (slot 1)
//     else artifactId (slot 2)
//     else contentHash (slot 3)
//     else sourceId    (slot 4)
//
// Two observations are INDEPENDENT IFF their resolved keys differ. PR5 counts:
//   - observation IDs themselves  → NEVER (key-based, not id-based)
//   - hypothesis IDs              → NEVER
//   - duplicate keys from the same source/context/artifact → ONE unit
//   - detector count, multiple mentions from one source    → ONE unit
//
// FAIL-CLOSED: a supporting observation that is NOT present in the supplied
// observation set cannot resolve a support unit — the caller has insufficient
// authority. The missing ids are reported so the qualification gate can emit
// MISSING_AUTHORITY instead of inventing a provenance slot.
// ============================================================================

import { resolveSupportUnitKey } from '@indago/contracts';
import type { RawGraphHoleCandidate } from '@indago/contracts';
import type { QualificationObservation } from './types.js';

export interface SupportUnitResolutionResult {
  /** Resolved support-unit keys, sorted unique. */
  readonly keys: readonly string[];
  /** Supporting observation ids that could NOT be resolved (fail-closed). */
  readonly missingObservationIds: readonly string[];
}

/**
 * Resolve the independent support units for a candidate from its SUPPORTING
 * observations only (contradicting observations never count as support).
 */
export function resolveIndependentSupportUnits(
  candidate: RawGraphHoleCandidate,
  observations: readonly QualificationObservation[],
): SupportUnitResolutionResult {
  const byId = new Map(observations.map((o) => [o.id, o] as const));
  const keys = new Set<string>();
  const missing: string[] = [];
  const supportingIds = [...candidate.supportingObservationIds].sort();

  for (const id of supportingIds) {
    const obs = byId.get(id);
    if (obs === undefined) {
      missing.push(id);
      continue;
    }
    const resolution = resolveSupportUnitKey(obs);
    if (resolution === null) {
      missing.push(id);
      continue;
    }
    keys.add(resolution.key);
  }

  return {
    keys: [...keys].sort(),
    missingObservationIds: missing.sort(),
  };
}

/** Count of independent support units (distinct keys). */
export function independentSupportUnitCount(
  result: SupportUnitResolutionResult,
): number {
  return result.keys.length;
}