// ============================================================================
// M-A09 Candidate Resolution — deterministic comparison features
//
// Compares two EntityMentionCandidates down to a small, auditable set of
// deterministic evidence items. NO ML, NO embeddings, NO fuzzy libraries,
// NO external APIs.
//
// ABSENT ≠ DIFFERENT:
//   - ABSENT (BOTH_ABSENT / LEFT_ABSENT / RIGHT_ABSENT) contributes 0 weight
//     and is NEVER a contradiction.
//   - DIFFERENT means BOTH candidates carry a DIFFERENT value for the SAME
//     strong-identifier feature → a hard contradiction.
// ============================================================================

import type {
  EntityMentionCandidate,
  EntityType,
} from '@indago/contracts';
import {
  deriveSurnameInitial,
} from '@indago/ingestion';
import { SCORING_V1 } from './types.js';
import type { ComparisonEvidence as ComparisonEvidenceContract } from '@indago/contracts';

const ABSENT = 'ABSENT';

/**
 * Structured-identifier types whose normalized match is a STRONG identifier.
 * Mirrors the M-A08 strong-identifier universe (EMAIL/PHONE/ACCOUNT/DEVICE/
 * VEHICLE/ADDRESS); other strong identifier types (e.g. a UUID-like ACCOUNT)
 * are handled through the same exact-match path.
 */
const STRONG_IDENTIFIER_TYPES: ReadonlySet<EntityType> = new Set([
  'EMAIL',
  'PHONE',
  'ACCOUNT',
  'DEVICE',
  'VEHICLE',
  'ADDRESS',
]);

/** Name-like types whose canonical value participates in name compare. */
const NAME_TYPES: ReadonlySet<EntityType> = new Set([
  'PERSON',
  'ORGANIZATION',
  'LOCATION',
]);

function strongIdentifierFeature(t: EntityType): string | undefined {
  if (t === 'PHONE') return 'PHONE';
  if (t === 'EMAIL') return 'EMAIL';
  if (t === 'ACCOUNT') return 'ACCOUNT';
  if (t === 'DEVICE') return 'DEVICE';
  if (t === 'VEHICLE') return 'VEHICLE';
  if (t === 'ADDRESS') return 'ADDRESS';
  return undefined;
}

/**
 * Compare the strong-identifier evidence between two candidates.
 * Identical normalized identifiers → EXACT_MATCH (+0.35).
 * DIFFERENT normalized identifiers (both present) → hard contradiction (−0.30).
 * ABSENT on either/both side → 0 weight, never a contradiction.
 * Returns nothing when neither candidate is a strong-identifier type.
 */
export function compareStrongIdentifier(
  left: EntityMentionCandidate,
  right: EntityMentionCandidate,
): ComparisonEvidenceContract | undefined {
  const lType = left.entityType;
  const rType = right.entityType;
  // Both must be the SAME strong-identifier type to be mutually comparable.
  if (
    lType === undefined ||
    rType === undefined ||
    !STRONG_IDENTIFIER_TYPES.has(lType) ||
    !STRONG_IDENTIFIER_TYPES.has(rType) ||
    lType !== rType
  ) {
    return undefined;
  }
  const feature = strongIdentifierFeature(lType);
  if (feature === undefined) return undefined;

  const lv = left.canonicalMatchValue;
  const rv = right.canonicalMatchValue;

  const leftVal = lv !== undefined && lv.length > 0 ? lv : ABSENT;
  const rightVal = rv !== undefined && rv.length > 0 ? rv : ABSENT;

  // ABSENT (either or both sides) — no signal, never a contradiction.
  if (leftVal === ABSENT || rightVal === ABSENT) {
    const relation =
      leftVal === ABSENT && rightVal === ABSENT
        ? 'BOTH_ABSENT'
        : leftVal === ABSENT
          ? 'LEFT_ABSENT'
          : 'RIGHT_ABSENT';
    return {
      feature,
      leftValue: leftVal,
      rightValue: rightVal,
      relation,
      weight: 0,
      reason: `${relation}: missing normalized ${feature.toLowerCase()} is not contradictory evidence`,
    };
  }

  if (leftVal === rightVal) {
    return {
      feature,
      leftValue: leftVal,
      rightValue: rightVal,
      relation: 'EXACT_MATCH',
      weight: SCORING_V1.strongIdentifierExactMatch,
      reason: `same normalized ${feature.toLowerCase()} identifier on both candidates`,
    };
  }

  // Both present, DIFFERENT → hard contradiction.
  return {
    feature,
    leftValue: leftVal,
    rightValue: rightVal,
    relation: 'DIFFERENT',
    weight: SCORING_V1.hardContradiction,
    reason: `conflicting normalized ${feature.toLowerCase()} identifiers (${leftVal} vs ${rightVal}) — recorded as contradiction, not averaged away`,
  };
}

/**
 * Compare the canonical-name evidence between two candidates.
 * Identical canonical name → EXACT_MATCH (+0.25).
 * PERSON surname+initial agreement → INITIAL_MATCH (+0.15).
 * Otherwise no name evidence item.
 */
export function compareName(
  left: EntityMentionCandidate,
  right: EntityMentionCandidate,
): ComparisonEvidenceContract[] {
  const lType = left.entityType;
  const rType = right.entityType;
  // NAME evidence requires BOTH candidates to carry an explicit name-like
  // entity type (PERSON / ORGANIZATION / LOCATION). Untyped candidates are
  // deliberately excluded: an opaque canonicalMatchValue on an untyped
  // candidate has NO reliable name semantics, and treating it as a "canonical
  // name" would manufacture identity evidence out of an unclassifiable value
  // (Point 5 of the M-A09 semantic review).
  if (
    lType === undefined ||
    rType === undefined ||
    !NAME_TYPES.has(lType) ||
    !NAME_TYPES.has(rType)
  ) {
    return [];
  }

  const lv = left.canonicalMatchValue;
  const rv = right.canonicalMatchValue;
  const leftVal = lv !== undefined && lv.length > 0 ? lv : left.text;
  const rightVal = rv !== undefined && rv.length > 0 ? rv : right.text;

  if (leftVal === rightVal) {
    return [
      {
        feature: 'NAME',
        leftValue: leftVal,
        rightValue: rightVal,
        relation: 'EXACT_MATCH',
        weight: SCORING_V1.canonicalNameExactMatch,
        reason: 'identical normalized canonical name',
      },
    ];
  }

  // PERSON surname+initial agreement.
  if (lType === 'PERSON' && rType === 'PERSON') {
    const nl = deriveSurnameInitial(leftVal);
    const nr = deriveSurnameInitial(rightVal);
    if (
      nl !== undefined &&
      nr !== undefined &&
      nl.surname === nr.surname &&
      nl.firstInitial === nr.firstInitial
    ) {
      return [
        {
          feature: 'NAME',
          leftValue: leftVal,
          rightValue: rightVal,
          relation: 'INITIAL_MATCH',
          weight: SCORING_V1.nameInitialAgreement,
          reason: `deterministic surname+initial agreement (${nl.surname}/${nl.firstInitial})`,
        },
      ];
    }
  }

  return [];
}

/**
 * Compare entity-type compatibility.
 * Same type (or both untyped) → TYPE_COMPATIBLE (+0.10).
 * Incompatible types → TYPE_MISMATCH (caller excludes as ineligible).
 */
export function compareType(
  left: EntityMentionCandidate,
  right: EntityMentionCandidate,
): ComparisonEvidenceContract {
  const lType = left.entityType;
  const rType = right.entityType;
  const compatible =
    (lType !== undefined && rType !== undefined && lType === rType) ||
    (lType === undefined && rType === undefined);
  return {
    feature: 'TYPE',
    leftValue: lType ?? ABSENT,
    rightValue: rType ?? ABSENT,
    relation: compatible ? 'TYPE_COMPATIBLE' : 'TYPE_MISMATCH',
    weight: compatible ? SCORING_V1.typeCompatibility : 0,
    reason: compatible
      ? 'entity types are compatible'
      : 'entity types are incompatible (pair ineligible)',
  };
}
