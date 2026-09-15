import { type ReassessmentOutcome } from '@indago/contracts';

// ============================================================================
// Deterministic lifecycle outcome derivation (PR12 V1)
//
// Precedence (frozen):
//   SUPERSEDED > RESOLVED > CONTRADICTED > score direction > no-change.
//
// RESOLVED PRODUCER RULE (V1):
//   RESOLVED is a deterministic lifecycle conclusion derived from authoritative
//   graph/evidence state — NEVER from the analyst/judge alone. A hole is
//   resolved when its previously-missing expected structural condition is NOW
//   satisfied by an authoritative canonical relation in the current graph
//   projection (endpoint set-equality + relation-type match; order matters for
//   directed relations).
//
// Touchstones (tested):
//   - evidence that merely makes a hole "less interesting" ⇒ WEAKENED, NOT RESOLVED
//   - direct authoritative contradiction ⇒ CONTRADICTED, NOT RESOLVED
//   - a newer-version candidate replacing the old logical hole ⇒ SUPERSEDED,
//     NOT RESOLVED (also requires an actual replacement record to exist)
//
// STRENGTHENED vs WEAKENED is a lexicographic direction comparison of
// independentSupportUnitCount > evidenceSupportScore > structuralScore >
// expectedInformationValue.
// ============================================================================

export interface AuthoritativeRelationRef {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly relationType: string;
  readonly directed: boolean;
}

export interface PriorHoleSnapshot {
  readonly independentSupportUnitCount: number;
  readonly evidenceSupportScore: number;
  readonly structuralScore: number;
  readonly expectedInformationValue: number;
  readonly contradictingObservationIds: readonly string[];
}

export interface CurrentCandidateAssessment {
  readonly independentSupportUnitCount: number;
  readonly evidenceSupportScore: number;
  readonly structuralScore: number;
  readonly expectedInformationValue: number;
  readonly contradictingObservationIds: readonly string[];
  readonly expectedRelationshipType: string | null;
  readonly canonicalNodeIds: readonly string[];
}

export interface DeriveOutcomeInput {
  readonly prior: PriorHoleSnapshot;
  readonly current: CurrentCandidateAssessment;
  /** Authoritative canonical relations present in the CURRENT graph version. */
  readonly presentRelations: readonly AuthoritativeRelationRef[];
  /** true when a new graph-version replacement GraphHole record was created. */
  readonly replacementCreated: boolean;
  /** true when the current hole was superceded by that replacement record. */
  readonly candidateReplaced: boolean;
}

export function deriveReassessmentOutcome(
  input: DeriveOutcomeInput,
): ReassessmentOutcome | null {
  if (input.candidateReplaced && input.replacementCreated) {
    return 'SUPERSEDED';
  }

  if (satisfiesExpectedCondition(input.current, input.presentRelations)) {
    return 'RESOLVED';
  }

  if (hasNewContradiction(
    input.current.contradictingObservationIds,
    input.prior.contradictingObservationIds,
  )) {
    return 'CONTRADICTED';
  }

  const direction = compareSupport(input.prior, input.current);
  if (direction > 0) return 'STRENGTHENED';
  if (direction < 0) return 'WEAKENED';
  return null;
}

/**
 * The RESOLVED producer predicate: an authoritative canonical relation exists
 * whose endpoint set equals the candidate's canonical node ids and whose type
 * matches the candidate's expected relationship type. Directed relations match
 * ordered endpoints; undirected relations match endpoint set-equality.
 */
export function satisfiesExpectedCondition(
  current: CurrentCandidateAssessment,
  presentRelations: readonly AuthoritativeRelationRef[],
): boolean {
  const { expectedRelationshipType, canonicalNodeIds } = current;
  if (expectedRelationshipType === null || expectedRelationshipType === undefined) {
    return false;
  }
  if (canonicalNodeIds.length !== 2) return false;

  const first = canonicalNodeIds[0];
  const second = canonicalNodeIds[1];
  if (first === undefined || second === undefined) return false;

  return presentRelations.some((relation) => {
    if (relation.relationType !== expectedRelationshipType) return false;
    if (relation.directed) {
      return (
        relation.sourceNodeId === first &&
        relation.targetNodeId === second
      );
    }
    const a = new Set([relation.sourceNodeId, relation.targetNodeId]);
    return (
      a.size === 2 &&
      a.has(first) &&
      a.has(second)
    );
  });
}

function hasNewContradiction(
  current: readonly string[],
  prior: readonly string[],
): boolean {
  const priorSet = new Set(prior);
  return current.some((id) => !priorSet.has(id));
}

function compareSupport(prior: PriorHoleSnapshot, current: CurrentCandidateAssessment): number {
  if (current.independentSupportUnitCount !== prior.independentSupportUnitCount) {
    return current.independentSupportUnitCount > prior.independentSupportUnitCount ? 1 : -1;
  }
  if (current.evidenceSupportScore !== prior.evidenceSupportScore) {
    return current.evidenceSupportScore > prior.evidenceSupportScore ? 1 : -1;
  }
  if (current.structuralScore !== prior.structuralScore) {
    return current.structuralScore > prior.structuralScore ? 1 : -1;
  }
  if (current.expectedInformationValue !== prior.expectedInformationValue) {
    return current.expectedInformationValue > prior.expectedInformationValue ? 1 : -1;
  }
  return 0;
}

// ============================================================================
// PR10 interaction — recompute only when its inputs actually changed
// ============================================================================

export interface NbeRecomputeInput {
  /** Deterministic candidate request-key set before the reassessment. */
  readonly prevCandidateKeySet: readonly string[];
  /** Deterministic candidate request-key set after the reassessment. */
  readonly newCandidateKeySet: readonly string[];
  /** Optional generic evidence-utility input signature (before). */
  readonly prevUtilitySignature?: string;
  /** Optional generic evidence-utility input signature (after). */
  readonly newUtilitySignature?: string;
}

/** true => PR10 must recompute; false => PR10 can be skipped (inputs unchanged). */
export function nbeRecomputeRequired(input: NbeRecomputeInput): boolean {
  const prev = [...input.prevCandidateKeySet].sort();
  const next = [...input.newCandidateKeySet].sort();
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i] !== next[i]) return true;
  }
  if (
    input.prevUtilitySignature !== undefined &&
    input.newUtilitySignature !== undefined &&
    input.prevUtilitySignature !== input.newUtilitySignature
  ) {
    return true;
  }
  return false;
}