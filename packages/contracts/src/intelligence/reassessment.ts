import { z } from 'zod';
import {
  CaseIdSchema,
  InvestigationIdSchema,
  EvidenceIdSchema,
  ObservationIdSchema,
  EntityHypothesisIdSchema,
  EntityIdSchema,
  RelationHypothesisIdSchema,
  RelationIdSchema,
  GraphVersionIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { canonicalizeDeterministic } from './identity-canonicalization.js';

// ============================================================================
// Incremental Graph-Hole Reassessment Contracts (Phase 5A-PR12)
//
// Deterministic, bounded orchestration layer that recomputes ONLY the graph-hole
// intelligence that a change could have affected while preserving historical
// assessments and never treating stale results as current.
//
// PR12 is an ORCHESTRATION LAYER. It is NOT:
//   - an entity-resolution engine (M-A09 owns acceptance)
//   - a relation-resolution engine (M-A10 owns acceptance)
//   - a replacement for M-A08 blocking / M-A12 graph versioning / M-A13 semantics
//   - a criminality classifier, evidence truth authority, or human approval flow
//   - a whole-case rerun fallback
//
// AUTHORITY:
//   Content-addressed identities are the truth. There is NO invalidation table.
//   Affectedness is recomputed lazily from persisted authoritative data; client
//   claims of impact are never trusted.
//
// TRIGGERS (frozen vocabulary):
//   NEW_OBSERVATION, NEW_EVIDENCE, ENTITY_RESOLUTION_ACCEPTED,
//   RELATION_ACCEPTED, REASSESSMENT_REQUESTED
//
// EFFECT CLASSES:
//   EVIDENCE_AFFECTING  - observations/evidence do NOT create a GraphVersion;
//                         same graphVersionId/regionId/candidateId.
//   GRAPH_AFFECTING     - entity/relation materialization creates a GraphVersion;
//                         new version => new region/candidate identities.
//   MANUAL_REASSESSMENT - explicit operator-scoped request.
//
// IDEMPOTENCY:
//   changeId = SHA-256(canonical change identity) — same authoritative change,
//   same changeId regardless of computedAt. CaseReassessmentChange.changeId
//   @unique guarantees duplicate delivery is a no-op.
//
// DETERMINISM:
//   No clock, no random, no Map/Set iteration dependence. computedAt is the only
//   timestamp and never influences semantics. All orderings canonical (id asc).
// ============================================================================

// ============================================================================
// Policy Version
// ============================================================================

export const REASSESSMENT_POLICY_VERSION = 'v1' as const;
export type ReassessmentPolicyVersion = typeof REASSESSMENT_POLICY_VERSION;

// ============================================================================
// Bounds Policy — Frozen V1 constants
//
// Run-level fanout limits aligned to the existing 5A ceilings.
//
// maxChangesPerRun: drains a bounded batch of pending changes per worker run.
//   25 keeps a single run observable and restartable.
//
// maxAffectedHypothesesPerChange: equals MAX_HYPOTHESES_IN_CONTEXT (the frozen
//   hypothesis-context budget) — impact analysis never needs more hypotheses
//   than a bounded analysis context can hold.
//
// maxAffectedGroupsPerChange: grouped atomics are a derived grouping over the
//   hypothesis set; 25 reflects the shared-canonical-entity overlap ceiling
//   used by the grouping model.
//
// maxAffectedRegionsPerChange: a single change fanning out to more than 10
//   regions is pathological; equal to MAX_AI_ANALYSES_PER_REGION ceiling used
//   elsewhere. Region fanout beyond this is surfaced as truncation, never
//   silently dropped.
//
// maxReassessmentsPerChange: one work item per affected region means this cap
//   is the region cap; kept explicit so both invariants are auditable.
// ============================================================================

export const PR12_MAX_CHANGES_PER_RUN = 25 as const;
export const PR12_MAX_AFFECTED_HYPOTHESES_PER_CHANGE = 50 as const;
export const PR12_MAX_AFFECTED_GROUPS_PER_CHANGE = 25 as const;
export const PR12_MAX_AFFECTED_REGIONS_PER_CHANGE = 10 as const;
export const PR12_MAX_REASSESSMENTS_PER_CHANGE = 10 as const;

export const REASSESSMENT_CHANGE_ID_NAMESPACE = 'indago:graph-hole-reassessment' as const;

// ============================================================================
// Content-addressed id shapes (mirror the per-package convention)
// ============================================================================

export const ReassessmentChangeIdSchema = z.string().min(1).max(256)
  .describe('SHA-256 hex change identity (64 chars) of the canonical change identity.');
export type ReassessmentChangeId = z.infer<typeof ReassessmentChangeIdSchema>;

export const ReassessmentRunIdSchema = z.string().uuid()
  .describe('Deterministic UUID row id of a reassessment run.');
export type ReassessmentRunId = z.infer<typeof ReassessmentRunIdSchema>;

export const ReassessmentRegionIdSchema = z.string().min(1).max(256)
  .describe('Content-addressed region identifier (SHA-256 hex of the canonical region identity).');
export type ReassessmentRegionId = z.infer<typeof ReassessmentRegionIdSchema>;

export const ReassessmentCandidateIdSchema = z.string().min(1).max(256)
  .describe('Content-addressed graph-hole candidate identifier.');
export type ReassessmentCandidateId = z.infer<typeof ReassessmentCandidateIdSchema>;

export const ReassessmentGroupIdSchema = z.string().min(1).max(256)
  .describe('Content-addressed hypothesis-group identifier over shared canonical entities.');
export type ReassessmentGroupId = z.infer<typeof ReassessmentGroupIdSchema>;

export const ReassessmentHoleIdSchema = z.string().min(1).max(256)
  .describe('Persisted GraphHole row id (reassessment relative to a persisted hole).');
export type ReassessmentHoleId = z.infer<typeof ReassessmentHoleIdSchema>;

// ============================================================================
// Effect Class
// ============================================================================

export const ReassessmentEffectClassSchema = z.enum([
  'EVIDENCE_AFFECTING',
  'GRAPH_AFFECTING',
  'MANUAL_REASSESSMENT',
]).describe(
  'Whether the change re-evaluates intelligence on the SAME graph version ' +
  '(EVIDENCE_AFFECTING), requires a NEW graph version / new region + candidate ' +
  'identities (GRAPH_AFFECTING), or is an explicit operator-scoped request.',
);
export type ReassessmentEffectClass = z.infer<typeof ReassessmentEffectClassSchema>;

// ============================================================================
// Manual Reassessment Scope
// ============================================================================

export const ReassessmentScopeSchema = z.enum([
  'CASE_WIDE',
  'REGIONS',
  'CANDIDATES',
  'HOLES',
]).describe('Explicit operator-declared scope for REASSESSMENT_REQUESTED.');
export type ReassessmentScope = z.infer<typeof ReassessmentScopeSchema>;

export const ManualReassessmentScopeSchema = z.object({
  scope: ReassessmentScopeSchema,
  regionIds: z.array(ReassessmentRegionIdSchema)
    .describe('Sorted, deduped target region ids (scope=REGIONS).').optional(),
  candidateIds: z.array(ReassessmentCandidateIdSchema)
    .describe('Sorted, deduped target candidate ids (scope=CANDIDATES).').optional(),
  holeIds: z.array(ReassessmentHoleIdSchema)
    .describe('Sorted, deduped target persisted hole ids (scope=HOLES).').optional(),
  graphVersionId: GraphVersionIdSchema.optional()
    .describe('Present => graph-affecting scope on a concrete version; absent => current version.'),
  requestToken: z.string().min(1).max(128).optional()
    .describe('Operator-supplied token for deterministic forced re-runs. Same scope + same token => same changeId.'),
}).strict();
export type ManualReassessmentScope = z.infer<typeof ManualReassessmentScopeSchema>;

// ============================================================================
// Trigger Taxonomy — frozen discriminated union
//
// No trigger may assert its own impact ("affected region ids", "resolved=true",
// scores, or current status). Affectedness is always recomputed authoritatively.
// ============================================================================

export const NewObservationTriggerSchema = z.object({
  triggerType: z.literal('NEW_OBSERVATION'),
  caseId: CaseIdSchema,
  observationId: ObservationIdSchema,
  computedAt: ObservedTimeSchema
    .describe('Caller-provided observed time. NEVER part of change identity; REQUIRED input.'),
}).strict();
export type NewObservationTrigger = z.infer<typeof NewObservationTriggerSchema>;

export const NewEvidenceTriggerSchema = z.object({
  triggerType: z.literal('NEW_EVIDENCE'),
  caseId: CaseIdSchema,
  evidenceId: EvidenceIdSchema,
  computedAt: ObservedTimeSchema
    .describe('Caller-provided observed time. NEVER part of change identity; REQUIRED input.'),
}).strict();
export type NewEvidenceTrigger = z.infer<typeof NewEvidenceTriggerSchema>;

export const EntityResolutionAcceptedTriggerSchema = z.object({
  triggerType: z.literal('ENTITY_RESOLUTION_ACCEPTED'),
  caseId: CaseIdSchema,
  entityHypothesisId: EntityHypothesisIdSchema,
  entityId: EntityIdSchema
    .describe('Authoritative resolved canonical entity produced by M-A09 acceptance.'),
  graphVersionId: GraphVersionIdSchema
    .describe('New GraphVersion created by entity materialization (graph-affecting).'),
  computedAt: ObservedTimeSchema
    .describe('Caller-provided observed time. NEVER part of change identity; REQUIRED input.'),
}).strict();
export type EntityResolutionAcceptedTrigger = z.infer<typeof EntityResolutionAcceptedTriggerSchema>;

export const RelationAcceptedTriggerSchema = z.object({
  triggerType: z.literal('RELATION_ACCEPTED'),
  caseId: CaseIdSchema,
  relationHypothesisId: RelationHypothesisIdSchema,
  relationId: RelationIdSchema
    .describe('Authoritative resolved canonical relation produced by M-A10 acceptance.'),
  graphVersionId: GraphVersionIdSchema
    .describe('New GraphVersion created by relation materialization (graph-affecting).'),
  computedAt: ObservedTimeSchema
    .describe('Caller-provided observed time. NEVER part of change identity; REQUIRED input.'),
}).strict();
export type RelationAcceptedTrigger = z.infer<typeof RelationAcceptedTriggerSchema>;

export const ReassessmentRequestedTriggerSchema = z.object({
  triggerType: z.literal('REASSESSMENT_REQUESTED'),
  caseId: CaseIdSchema,
  scope: ManualReassessmentScopeSchema,
  computedAt: ObservedTimeSchema
    .describe('Caller-provided observed time. NEVER part of change identity; REQUIRED input.'),
}).strict();
export type ReassessmentRequestedTrigger = z.infer<typeof ReassessmentRequestedTriggerSchema>;

export const ReassessmentTriggerSchema = z.discriminatedUnion('triggerType', [
  NewObservationTriggerSchema,
  NewEvidenceTriggerSchema,
  EntityResolutionAcceptedTriggerSchema,
  RelationAcceptedTriggerSchema,
  ReassessmentRequestedTriggerSchema,
]);
export type ReassessmentTrigger = z.infer<typeof ReassessmentTriggerSchema>;

export const REASSESSMENT_TRIGGER_TYPES: readonly ReassessmentTrigger['triggerType'][] = [
  'NEW_OBSERVATION',
  'NEW_EVIDENCE',
  'ENTITY_RESOLUTION_ACCEPTED',
  'RELATION_ACCEPTED',
  'REASSESSMENT_REQUESTED',
];

// ============================================================================
// Trigger → Effect class (frozen V1 mapping)
// ============================================================================

export const EFFECT_CLASS_BY_TRIGGER_TYPE: Readonly<Record<
  ReassessmentTrigger['triggerType'],
  ReassessmentEffectClass
>> = {
  NEW_OBSERVATION: 'EVIDENCE_AFFECTING',
  NEW_EVIDENCE: 'EVIDENCE_AFFECTING',
  ENTITY_RESOLUTION_ACCEPTED: 'GRAPH_AFFECTING',
  RELATION_ACCEPTED: 'GRAPH_AFFECTING',
  REASSESSMENT_REQUESTED: 'MANUAL_REASSESSMENT',
};

export function deriveReassessmentEffectClass(
  trigger: ReassessmentTrigger,
): ReassessmentEffectClass {
  if (trigger.triggerType === 'REASSESSMENT_REQUESTED' && trigger.scope.graphVersionId) {
    return 'GRAPH_AFFECTING';
  }
  return EFFECT_CLASS_BY_TRIGGER_TYPE[trigger.triggerType];
}

// ============================================================================
// Change identity — canonical serialization (digest lives in the runtime)
//
// Same authoritative change -> same canonical string regardless of computedAt.
// computedAt is EXCLUDED by construction (identity payload is picked per type).
// ============================================================================

function changeIdentityPayload(trigger: ReassessmentTrigger): Record<string, unknown> {
  switch (trigger.triggerType) {
    case 'NEW_OBSERVATION':
      return {
        caseId: trigger.caseId,
        triggerType: trigger.triggerType,
        observationId: trigger.observationId,
      };
    case 'NEW_EVIDENCE':
      return {
        caseId: trigger.caseId,
        triggerType: trigger.triggerType,
        evidenceId: trigger.evidenceId,
      };
    case 'ENTITY_RESOLUTION_ACCEPTED':
      return {
        caseId: trigger.caseId,
        triggerType: trigger.triggerType,
        entityHypothesisId: trigger.entityHypothesisId,
        entityId: trigger.entityId,
        graphVersionId: trigger.graphVersionId,
      };
    case 'RELATION_ACCEPTED':
      return {
        caseId: trigger.caseId,
        triggerType: trigger.triggerType,
        relationHypothesisId: trigger.relationHypothesisId,
        relationId: trigger.relationId,
        graphVersionId: trigger.graphVersionId,
      };
    case 'REASSESSMENT_REQUESTED': {
      const { graphVersionId, requestToken, ...rest } = trigger.scope;
      return {
        caseId: trigger.caseId,
        triggerType: trigger.triggerType,
        scope: {
          ...rest,
          ...(graphVersionId ? { graphVersionId } : {}),
          ...(requestToken ? { requestToken } : {}),
        },
      };
    }
  }
}

/**
 * Stable canonical serialization of a change identity. Same authoritative
 * change yields the same string, independent of `computedAt`, delivery order,
 * or requester identity. The runtime computes the SHA-256 hex digest from this.
 */
export function canonicalizeReassessmentChangeIdentity(trigger: ReassessmentTrigger): string {
  return canonicalizeDeterministic({
    namespace: REASSESSMENT_CHANGE_ID_NAMESPACE,
    identity: changeIdentityPayload(trigger),
  });
}

// ============================================================================
// Affected Set — deterministic, lazy, content-addressed
//
// Status distinguishes "genuinely nothing affected" from "affected but the
// bounded fanout limit truncated the impact". Truncation is never silent.
// ============================================================================

export const ReassessmentAffectedStatusSchema = z.enum([
  'NO_AFFECTED',
  'AFFECTED_COMPLETE',
  'AFFECTED_TRUNCATED',
]);
export type ReassessmentAffectedStatus = z.infer<typeof ReassessmentAffectedStatusSchema>;

export const ReassessmentAffectedSetAccountingSchema = z.object({
  observationUniverseCount: z.number().int().nonnegative()
    .describe('Observations consulted as evidence for hypothesis membership.'),
  hypothesisUniverseCount: z.number().int().nonnegative()
    .describe('Hypotheses examined for affectedness.'),
  candidateUniverseCount: z.number().int().nonnegative()
    .describe('Hypotheses referencing the changed evidence.'),
  groupUniverseCount: z.number().int().nonnegative()
    .describe('Persisted groups examined.'),
  regionUniverseCount: z.number().int().nonnegative()
    .describe('Persisted regions examined for overlap.'),
}).strict();
export type ReassessmentAffectedSetAccounting = z.infer<typeof ReassessmentAffectedSetAccountingSchema>;

export const ReassessmentAffectedSetSchema = z.object({
  caseId: CaseIdSchema,
  graphVersionId: GraphVersionIdSchema
    .describe('The single authoritative version the affected set is resolved against.'),
  changeId: ReassessmentChangeIdSchema,
  effectClass: ReassessmentEffectClassSchema,
  status: ReassessmentAffectedStatusSchema,
  affectedObservationIds: z.array(ObservationIdSchema).describe('Sorted, deduped.'),
  affectedEntityHypothesisIds: z.array(EntityHypothesisIdSchema).describe('Sorted, deduped.'),
  affectedRelationHypothesisIds: z.array(RelationHypothesisIdSchema).describe('Sorted, deduped.'),
  affectedGroupIds: z.array(ReassessmentGroupIdSchema).describe('Sorted, deduped.'),
  affectedRegionIds: z.array(ReassessmentRegionIdSchema).describe('Sorted, deduped.'),
  affectedCandidateIds: z.array(ReassessmentCandidateIdSchema).describe('Sorted, deduped.'),
  truncated: z.boolean()
    .describe('true when any fanout bound stopped the resolution (status=AFFECTED_TRUNCATED).'),
  accounting: ReassessmentAffectedSetAccountingSchema,
}).strict();
export type ReassessmentAffectedSet = z.infer<typeof ReassessmentAffectedSetSchema>;

// ============================================================================
// Reassessment Plan — pure, bounded, canonical work items
// ============================================================================

export const ReassessmentPlanItemSchema = z.object({
  regionId: ReassessmentRegionIdSchema
    .describe('Existing region id (evidence-affecting) or the region id to derive (graph-affecting).'),
  graphVersionId: GraphVersionIdSchema
    .describe('Version the work item is bound to (single-version binding).'),
  effectClass: ReassessmentEffectClassSchema,
  recomputeIdentity: z.boolean()
    .describe('true => region must be rebuilt (new version => new content-addressed region id).'),
  candidateIds: z.array(ReassessmentCandidateIdSchema)
    .describe('Existing candidates bound to this region/version when effect is evidence-affecting.'),
}).strict();
export type ReassessmentPlanItem = z.infer<typeof ReassessmentPlanItemSchema>;

export const ReassessmentPlanSchema = z.array(ReassessmentPlanItemSchema)
  .describe('Canonical ordered work items (regionId asc). One item per affected region.');
export type ReassessmentPlan = z.infer<typeof ReassessmentPlanSchema>;

// ============================================================================
// Outcome semantics
//
// Precedence: SUPERSEDED > RESOLVED > CONTRADICTED > score direction >
// no-change (skip; append nothing for evidence-affecting).
// ============================================================================

export const ReassessmentOutcomeSchema = z.enum([
  'STRENGTHENED',
  'WEAKENED',
  'RESOLVED',
  'CONTRADICTED',
  'SUPERSEDED',
]).describe(
  'Deterministic lifecycle conclusion for a reassessed hole. RESOLVED is derived ' +
  'from authoritative graph/evidence state (the hole\'s expected structural ' +
  'condition is now satisfied) — NEVER from the analyst/judge alone. SUPERSEDED ' +
  'requires an actual replacement GraphHole record on the new graph version.',
);
export type ReassessmentOutcome = z.infer<typeof ReassessmentOutcomeSchema>;

export const REASSESSMENT_OUTCOME_PRECEDENCE: Readonly<Record<ReassessmentOutcome, number>> = {
  SUPERSEDED: 0,
  RESOLVED: 1,
  CONTRADICTED: 2,
  STRENGTHENED: 3,
  WEAKENED: 3,
};

export const ReassessmentRegionResultStatusSchema = z.enum([
  'REUSED',
  'RECOMPUTED',
  'SKIPPED_CONTEXT_UNCHANGED',
  'SKIPPED_NO_CHANGE',
  'FAILED',
]);
export type ReassessmentRegionResultStatus = z.infer<typeof ReassessmentRegionResultStatusSchema>;

export const ReassessmentRegionResultSchema = z.object({
  regionId: ReassessmentRegionIdSchema,
  recomputeIdentity: z.boolean(),
  status: ReassessmentRegionResultStatusSchema,
  outcome: ReassessmentOutcomeSchema.optional()
    .describe('Absent => no change (no assessment appended for evidence-affecting).'),
  contextSha256: z.string().min(1).max(64).optional()
    .describe('New bounded analysis context digest when a context was built.'),
  assessmentsAppended: z.number().int().nonnegative(),
  holesSuperseded: z.number().int().nonnegative(),
}).strict();
export type ReassessmentRegionResult = z.infer<typeof ReassessmentRegionResultSchema>;

export const ReassessmentRunStatusSchema = z.enum([
  'COMPLETED',
  'PARTIAL',
  'FAILED',
  'NO_OP',
]);
export type ReassessmentRunStatus = z.infer<typeof ReassessmentRunStatusSchema>;

// ============================================================================
// Cursor state
// ============================================================================

export const ReassessmentCursorStateSchema = z.object({
  caseId: CaseIdSchema,
  lastProcessedSequence: z.number().int().nonnegative()
    .describe('Per-case monotonic watermark; 0 when nothing processed.'),
  updatedAt: ObservedTimeSchema,
  policyVersion: z.literal(REASSESSMENT_POLICY_VERSION),
}).strict();
export type ReassessmentCursorState = z.infer<typeof ReassessmentCursorStateSchema>;

// ============================================================================
// Accounting — deterministic per-run counts
// ============================================================================

export const ReassessmentAccountingSchema = z.object({
  policyVersion: z.literal(REASSESSMENT_POLICY_VERSION),
  appliedChangeCount: z.number().int().nonnegative(),
  coalescedChangeCount: z.number().int().nonnegative()
    .describe('Number of additional pending changes coalesced into this batch.'),
  pendingChangeCount: z.number().int().nonnegative()
    .describe('Remaining pending changes for this case after this run.'),
  affectedRegionCount: z.number().int().nonnegative()
    .describe('Plan size (distinct affected regions).'),
  regionsReused: z.number().int().nonnegative()
    .describe('Regions satisfied by the no-repeat gate (equivalent completed assessment exists).'),
  regionsRecomputed: z.number().int().nonnegative(),
  regionsSkippedContextUnchanged: z.number().int().nonnegative(),
  regionsFailed: z.number().int().nonnegative(),
  regionsTruncated: z.number().int().nonnegative(),
  aiAnalysesRun: z.number().int().nonnegative()
    .describe('Analyst+validator+judge executions that actually ran.'),
  aiAnalysesSkipped: z.number().int().nonnegative()
    .describe('AI stages skipped (context unchanged / no-change).'),
  assessmentsAppended: z.number().int().nonnegative(),
  holesStrengthened: z.number().int().nonnegative(),
  holesWeakened: z.number().int().nonnegative(),
  holesResolved: z.number().int().nonnegative(),
  holesContradicted: z.number().int().nonnegative(),
  holesSuperseded: z.number().int().nonnegative(),
  nextBestEvidenceRecomputed: z.boolean()
    .describe('PR10 stage recomputed only when candidate set or utility inputs changed.'),
  truncated: z.boolean(),
}).strict();
export type ReassessmentAccounting = z.infer<typeof ReassessmentAccountingSchema>;

// ============================================================================
// Run record — the persisted result envelope
// ============================================================================

export const IncrementalReassessmentRunSchema = z.object({
  runId: ReassessmentRunIdSchema,
  caseId: CaseIdSchema,
  investigationId: InvestigationIdSchema.optional(),
  changeId: ReassessmentChangeIdSchema,
  trigger: ReassessmentTriggerSchema,
  effectClass: ReassessmentEffectClassSchema,
  graphVersionId: GraphVersionIdSchema
    .describe('Single authoritative version this run evaluated against.'),
  computedAt: ObservedTimeSchema
    .describe('Caller-provided observed time. Evidence of when the reassessment was requested.'),
  policyVersion: z.literal(REASSESSMENT_POLICY_VERSION),
  affectedSet: ReassessmentAffectedSetSchema,
  plan: ReassessmentPlanSchema,
  regionResults: z.array(ReassessmentRegionResultSchema).describe('Canonical (regionId asc).'),
  accounting: ReassessmentAccountingSchema,
  status: ReassessmentRunStatusSchema,
}).strict();
export type IncrementalReassessmentRun = z.infer<typeof IncrementalReassessmentRunSchema>;