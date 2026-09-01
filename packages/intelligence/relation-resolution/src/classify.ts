// ============================================================================
// M-A10 Relation Resolution — deterministic relation type classification
//
// Classifies the relation type of a co-occurrence from the observation's
// declared type and content. This is deterministic, rule-based, and
// source-grounded: it only ever reads the durable Observation, never graph
// proximity.
//
// SCOPING RULES (locked):
//   - COMMUNICATION type  → communication
//   - FINANCIAL type      → financial
//   - SPATIAL type        → co-location
//   - RELATIONAL/IDENTITY/BEHAVIORAL with an EXPLICIT association claim
//                         → association (association REQUIRES an explicit claim;
//                           generic co-occurrence is NEVER association)
//   - explicit ownership / organizational / transport / family / vehicle /
//     case-link content cues → the corresponding type
//   - Generic co-occurrence with no explicit signal → undefined (resolves to
//     `other` at the pair level). Generic same-record presence is NOT typed.
//
// The vocabulary is the locked RelationTypeSchema — no renaming, no
// re-duplication, no new types.
// ============================================================================

import type { Observation, RelationType } from '@indago/contracts';

const ASSOCIATION_CUES = [
  'associate',
  'associat',
  'colleague',
  'partner',
  'co-conspirator',
  'co-conspira',
  'working with',
  'working alongside',
  'linked to',
  'connected to',
  'affiliated',
  'member of',
] as const;

const OWNERSHIP_CUES = [
  'owns',
  'owner of',
  'owned by',
  'registered to',
  'registered under',
  'shareholder',
  'holding of',
  'beneficial owner',
] as const;

const ORGANIZATIONAL_CUES = [
  'supervisor',
  'manager of',
  'reports to',
  'subordinate',
  'department of',
  'division of',
  'employee of',
  'director of',
  'subsidiary of',
] as const;

const TRANSPORT_CUES = [
  'transported',
  'transported by',
  'shipped by',
  'carried by',
  'traveled with',
  'travelled with',
  'conveyed',
] as const;

const FAMILY_CUES = [
  'father',
  'mother',
  'brother',
  'sister',
  'son',
  'daughter',
  'wife',
  'husband',
  'spouse',
  'relative',
  'sibling',
] as const;

const VEHICLE_CUES = [
  'vehicle registered',
  'license plate',
  'registration plate',
  'vrn',
  'car registered',
  'truck registered',
] as const;

const CASE_LINK_CUES = [
  'co-defendant',
  'co-accused',
  'co-def',
  'co-accused of',
  'linked case',
  'related case',
  'jointly charged',
] as const;

function hasCue(content: string, cues: readonly string[]): boolean {
  const lower = content.toLowerCase();
  return cues.some((cue) => lower.includes(cue.toLowerCase()));
}

/**
 * Classify the relation type from a single observation. Returns a specific
 * RelationType when there is an explicit, source-grounded signal; returns
 * undefined for generic co-occurrence (the pair then resolves to `other`).
 */
export function classifyObservationRelationType(
  observation: Observation,
): RelationType | undefined {
  const typeSignal = observation.type;
  if (typeSignal === 'COMMUNICATION') return 'communication';
  if (typeSignal === 'FINANCIAL') return 'financial';
  if (typeSignal === 'SPATIAL') return 'co-location';

  const content = observation.content;

  // Explicit non-generic cues win over generic fallbacks.
  if (hasCue(content, OWNERSHIP_CUES)) return 'ownership';
  if (hasCue(content, ORGANIZATIONAL_CUES)) return 'organizational';
  if (hasCue(content, TRANSPORT_CUES)) return 'transport';
  if (hasCue(content, FAMILY_CUES)) return 'family';
  if (hasCue(content, VEHICLE_CUES)) return 'vehicle';
  if (hasCue(content, CASE_LINK_CUES)) return 'case-link';

  // association REQUIRES an explicit claim — never generic co-occurrence.
  if (
    (typeSignal === 'RELATIONAL' ||
      typeSignal === 'IDENTITY' ||
      typeSignal === 'BEHAVIORAL') &&
    hasCue(content, ASSOCIATION_CUES)
  ) {
    return 'association';
  }

  return undefined;
}

/**
 * Deterministically pick a relation type for a co-occurrence pair from its
 * co-occurrence observations. Direct observation-classification signals are
 * aggregated; a single explicit non-generic signal wins; otherwise the pair
 * resolves to `other`. Never invents a type from graph structure.
 */
export function pickRelationType(
  coOccurrenceObservations: readonly Observation[],
): RelationType {
  const seen = new Set<RelationType>();
  for (const o of coOccurrenceObservations) {
    const t = classifyObservationRelationType(o);
    if (t !== undefined) seen.add(t);
  }
  // Direct type signals (communication/financial/co-location) are the most
  // reliable. Any explicit signal wins deterministically; pick the
  // lexicographically first for stability when several co-occur.
  if (seen.size === 0) return 'other';
  const sorted = [...seen];
  sorted.sort();
  return sorted[0]!;
}
