import { z } from 'zod';
import {
  EntityIdSchema,
  EntityHypothesisIdSchema,
  EntityRoleHypothesisIdSchema,
  ObservationIdSchema,
  EvidenceIdSchema,
  CaseIdSchema,
  InvestigationIdSchema,
  EntityComparisonIdSchema,
  CandidatePairIdSchema,
  EntityMentionCandidateIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { ResolutionScoreSchema, RoleSignalSchema } from '../common/confidence.js';
import { EntityComparisonStatusSchema, EntityResolutionStatusSchema } from '../common/comparison-status.js';
import { ProvenanceSchema } from '../common/provenance.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Entity
//
// Entity is the canonical internal identity within an investigation.
// An Entity may have multiple hypotheses about its identity and role.
//
// ENTITY ID SEMANTIC BOUNDARY:
//   EntityId is the stable internal identity within INDAGO.
//   It represents a single canonical person/thing for the duration of
//   the investigation, regardless of how many source identifiers or
//   aliases exist.
//
//   IMPORTANT: EntityId is NOT the same as an evidence identifier.
//   EntityId is INDAGO-internal. External source identifiers are stored
//   in Entity.sourceIdentifiers — never treated as EntityIds.
//
// Architecture:
//   Canonical Entity (EntityId)
//       ├── observations that reference this entity
//       ├── source identifiers across evidence
//       └── hypotheses
//              ├── EntityHypothesis (identity resolution)
//              └── EntityRoleHypothesis (role classification)
//
// EntityId is the stable internal identity. EntityHypothesis proposes that
// observations refer to a specific EntityId.
// ============================================================================

export const EntityRoleSchema = z.enum([
  'victim',
  'suspect',
  'witness',
  'facilitator',
  'unknown',
]).describe('Role classification. Default: unknown. Role is reversible. NOT legal status.');
export type EntityRole = z.infer<typeof EntityRoleSchema>;

export const EntityStatusSchema = z.enum([
  'CANDIDATE',
  'ACTIVE',
  'MERGED',
  'SPLIT',
  'ARCHIVED',
]);
export type EntityStatus = z.infer<typeof EntityStatusSchema>;

/**
 * Canonical Entity — the stable internal identity within an investigation.
 */
export const EntitySchema = z.object({
  id: EntityIdSchema,
  caseId: CaseIdSchema,
  investigationId: InvestigationIdSchema.optional(),
  canonicalName: z.string().min(1).max(500)
    .describe('Best-known name. May be updated as ER resolves.'),
  status: EntityStatusSchema,
  observationIds: z.array(ObservationIdSchema)
    .describe('Observations that reference this entity'),
  evidenceIds: z.array(EvidenceIdSchema)
    .describe('Evidence packages referencing this entity'),
  hypothesisIds: z.array(EntityHypothesisIdSchema)
    .describe('Identity hypotheses about this entity'),
  roleHypothesisIds: z.array(EntityRoleHypothesisIdSchema)
    .describe('Role hypotheses about this entity'),
  comparisonIds: z.array(EntityComparisonIdSchema).optional()
    .describe('Pairwise comparisons involving this entity'),
  sourceIdentifiers: z.array(z.object({
    sourceId: z.string(),
    identifier: z.string(),
    context: z.string().optional(),
  })).optional()
    .describe('Identifiers from external source systems'),
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type Entity = z.infer<typeof EntitySchema>;

/**
 * Typed candidate for EntityHypothesis.
 * Not loose strings — each candidate references a canonical EntityId.
 */
export const EntityCandidateSchema = z.object({
  entityId: EntityIdSchema,
  confidence: ResolutionScoreSchema,
  evidence: z.array(ObservationIdSchema)
    .describe('Observations supporting this candidate'),
  sourceCount: z.number().int().nonnegative()
    .describe('Number of independent sources supporting this candidate'),
}).strict();
export type EntityCandidate = z.infer<typeof EntityCandidateSchema>;

/**
 * EntityHypothesis — proposes that observations refer to specific entity candidates.
 * Proposes identity resolution, not role.
 *
 * V1 supports two resolution flows:
 *   - Candidate↔Candidate (M-A09 v1): candidatePairId is set, entityId is absent.
 *       References EntityMentionCandidates via supportingCandidateIds.
 *       supportingObservationIds/contradictingObservationIds carry the evidence
 *       observation sets. candidateEntities is NOT used in this flow.
 *   - Entity↔Entity (future): entityId is set and candidateEntities is populated.
 *       References canonical Entities.
 *
 * ResolutionScore is a RANKING / SUPPORT signal. It is NOT a calibrated
 * probability. High score may create a PROPOSED hypothesis, but must NOT
 * automatically become ACCEPTED. Acceptance is a deliberate decision path.
 *
 * A reversal does NOT delete the hypothesis — it changes status to REVERSED
 * and creates audit history. REVERSED ≠ MERGED.
 *
 * M-A09 v1 semantics (locked):
 *   - Hypothesis identity is DETERMINISTIC: candidatePairId + scoreModelVersion
 *       → SHA-256 → stable UUID. The same pair under the same scoring model
 *       converges to ONE logical hypothesis (no duplicates on retry).
 *   - scoreModelVersion records the scoring model that produced the score so a
 *       future re-resolution under a new model yields a NEW hypothesis version
 *       rather than silently mutating historical data.
 *   - supportingObservationIds carry ONLY genuine positive identity evidence.
 *   - contradictingObservationIds carry ONLY explicit mutually-exclusive
 *       identity evidence (never mere "different observations", never ABSENT).
 *       The two sets MUST NOT overlap.
 *   - No canonical Entity is created in v1: entityId/resolvedEntityId are
 *       absent (NULL) for Candidate↔Candidate.
 */
export const EntityHypothesisSchema = z.object({
  id: EntityHypothesisIdSchema,
  caseId: CaseIdSchema
    .describe('Case scope — M-A09 v1 resolves same-case CandidatePairs only'),
  investigationId: InvestigationIdSchema.optional()
    .describe('Investigation scope (optional; when known it must match the candidate pair)'),
  entityId: EntityIdSchema.optional()
    .describe('Canonical entity (future Entity↔Entity flow). Absent for v1 Candidate↔Candidate.'),
  candidatePairId: CandidatePairIdSchema.optional()
    .describe('CandidatePair this hypothesis was derived from (v1 Candidate↔Candidate flow)'),
  supportingCandidateIds: z.array(EntityMentionCandidateIdSchema).min(1).optional()
    .describe('EntityMentionCandidate IDs supporting this hypothesis (v1)'),
  candidateEntities: z.array(EntityCandidateSchema).min(1).optional()
    .describe('Typed candidate entities (future Entity↔Entity flow). Not used in v1 Candidate↔Candidate.'),
  contradictions: z.array(EntityHypothesisIdSchema).optional()
    .describe('Hypotheses that contradict this one'),
  comparisonStatus: EntityComparisonStatusSchema
    .describe('Current comparison status'),
  score: ResolutionScoreSchema
    .describe('Ranking/support signal for identity match. NOT a probability. NOT lifecycle authority — high score creates PROPOSED, never auto-ACCEPTED.'),
  scoreModelVersion: z.string().min(1)
    .describe('Deterministic scoring-model version that produced this score/support. Part of hypothesis identity.'),
  supportingObservationIds: z.array(ObservationIdSchema).optional()
    .describe('Observations providing genuine POSITIVE identity evidence (M-A09 v1)'),
  contradictingObservationIds: z.array(ObservationIdSchema).optional()
    .describe('Observations providing explicit mutually-exclusive identity evidence (M-A09 v1). Never ABSENT, never mere "different observations", never overlapping supporting.'),
  status: EntityResolutionStatusSchema
    .describe('Hypothesis lifecycle status. REVERSED ≠ MERGED.'),
  resolvedEntityId: EntityIdSchema.optional()
    .describe('Canonical entity link (future). Absent in v1 Candidate↔Candidate.'),
  provenance: ProvenanceSchema,
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type EntityHypothesis = z.infer<typeof EntityHypothesisSchema>;

/**
 * EntityRoleHypothesis — proposes a role for an entity.
 * Default: unknown. Role is reversible (roleReversible = true).
 * NOT legal status. NOT isSuspect/isGuilty.
 */
export const EntityRoleHypothesisSchema = z.object({
  id: EntityRoleHypothesisIdSchema,
  entityId: EntityIdSchema
    .describe('The canonical entity this role hypothesis applies to'),
  role: EntityRoleSchema.default('unknown'),
  roleScore: RoleSignalSchema
    .describe('Evidence-supported role classification strength'),
  evidenceBasis: z.array(ObservationIdSchema)
    .describe('Observations supporting this role classification'),
  contradictions: z.array(ObservationIdSchema).optional()
    .describe('Observations that contradict this role'),
  roleReversible: z.literal(true)
    .describe('Role is always reversible in INDAGO'),
  provenance: ProvenanceSchema,
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type EntityRoleHypothesis = z.infer<typeof EntityRoleHypothesisSchema>;
