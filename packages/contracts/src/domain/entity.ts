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
 */
export const EntityHypothesisSchema = z.object({
  id: EntityHypothesisIdSchema,
  entityId: EntityIdSchema
    .describe('The canonical entity this hypothesis is about'),
  candidateEntities: z.array(EntityCandidateSchema).min(1)
    .describe('Typed candidate entities. Not loose strings.'),
  contradictions: z.array(EntityHypothesisIdSchema).optional()
    .describe('Hypotheses that contradict this one'),
  comparisonStatus: EntityComparisonStatusSchema
    .describe('Current comparison status'),
  score: ResolutionScoreSchema
    .describe('Support for this identity match'),
  status: EntityResolutionStatusSchema
    .describe('Current resolution status'),
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
