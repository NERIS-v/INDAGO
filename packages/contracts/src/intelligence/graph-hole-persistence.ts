// ============================================================================
// Graph-Hole Persistence Contracts (Phase 5A-PR6)
//
// PR6 makes the deterministic PR4/PR5 intelligence output durable. This module
// freezes the PERSISTED GraphHole representation support:
//   - the intelligence assessment status vocabulary (ACTIVE / SUPERSEDED /
//     RESOLVED / REJECTED) and its legal transitions;
//   - the deterministic detector-contribution identity key.
//
// Scope boundary:
//   - Persistence SUPPORT ONLY (statuses + identity builders). No Prisma, no
//     DB schema here — the platform seeds the schema from these contracts.
//   - PR6 statuses are INTELLIGENCE ASSESSMENT STATES, NOT a second
//     investigation workflow lifecycle. Human consequential state
//     (PROMOTED / REJECTED / ...) stays owned by the Phase-4 Lead authority.
//   - scoringPolicyVersion is PERSISTED METADATA and is deliberately NOT part
//     of candidateId (candidate identity = caseId, graphVersionId, holeType,
//     canonicalNodeIds, expectedRelationshipType, temporalScope,
//     detectionPolicyVersion — see graph-hole-candidate.ts).
// ============================================================================

import { z } from 'zod';

// ============================================================================
// §1 GraphHole intelligence assessment status
// ============================================================================

export const GraphHolePersistenceStatusSchema = z.enum([
  'ACTIVE',
  'SUPERSEDED',
  'REJECTED',
  'RESOLVED',
]).describe(
  'Intelligence assessment state of a persisted GraphHole. NOT an investigation ' +
  'workflow state (human consequence is owned by the Lead authority).',
);
export type GraphHolePersistenceStatus = z.infer<typeof GraphHolePersistenceStatusSchema>;

/**
 * Legal transitions of the GraphHole intelligence lifecycle.
 *
 *   ACTIVE    → SUPERSEDED  (a newer-version analysis of the same logical hole)
 *   ACTIVE    → REJECTED    (the candidate no longer qualifies / authority rejection)
 *   ACTIVE    → RESOLVED    (terminal mirror of a human consequential decision)
 *   REJECTED  → ACTIVE      (a later assessment revives the candidate)
 *   SUPERSEDED → (terminal; its history is the record)
 *   RESOLVED   → (terminal; consequential state is owned by Lead)
 */
export const GRAPH_HOLE_STATUS_TRANSITIONS: Readonly<Record<
  GraphHolePersistenceStatus,
  readonly GraphHolePersistenceStatus[]
>> = {
  ACTIVE: ['SUPERSEDED', 'REJECTED', 'RESOLVED'],
  REJECTED: ['ACTIVE'],
  SUPERSEDED: [],
  RESOLVED: [],
};

export function canTransitionGraphHoleStatus(
  from: GraphHolePersistenceStatus,
  to: GraphHolePersistenceStatus,
): boolean {
  return GRAPH_HOLE_STATUS_TRANSITIONS[from].includes(to);
}

// ============================================================================
// §2 GraphHole assessment / state-event types
// ============================================================================

export const GraphHoleAssessmentTypeSchema = z.enum([
  'QUALIFICATION', // initial qualified persist
  'REASSESSMENT', // later assessment of the SAME candidate (append-only snapshot + current-row update)
  'SUPERSESSION', // a newer graph version's analysis supersedes this record
  'REJECTION', // the candidate no longer qualifies / authority rejection
  'REVIVAL', // a later assessment reinstates a previously REJECTED candidate
  'RESOLUTION', // terminal human-consequence mirror (workflow state owned by Lead)
]).describe('Which kind of event a GraphHoleAssessment row records.');
export type GraphHoleAssessmentType = z.infer<typeof GraphHoleAssessmentTypeSchema>;

// ============================================================================
// §3 Detector contribution identity
// ============================================================================

/**
 * Deterministic per-detector contribution identity. One candidate may be
 * proposed independently by several detectors; each contribution is stored
 * once. The key is case-independent because candidateId already hashes
 * caseId + graphVersionId; case scoping is still enforced by the store and
 * the record keeps an explicit caseId column.
 */
export const GRAPH_HOLE_CONTRIBUTION_IDENTITY_NAMESPACE =
  'indago:graph-hole-contribution:v1' as const;

export interface DetectorContributionIdentityInput {
  readonly candidateId: string;
  readonly detectorType: string;
  readonly detectionPolicyVersion: string;
}

export function buildDetectorContributionIdentityKey(
  input: DetectorContributionIdentityInput,
): string {
  return [
    GRAPH_HOLE_CONTRIBUTION_IDENTITY_NAMESPACE,
    input.candidateId,
    input.detectorType,
    input.detectionPolicyVersion,
  ].join(':');
}