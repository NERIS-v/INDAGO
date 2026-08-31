import { z } from 'zod';
import {
  EntityMentionCandidateIdSchema,
  ObservationIdSchema,
} from '../common/ids.js';
import { ProvenanceSchema } from '../common/provenance.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Entity Mention Candidate (M-A07)
//
// M-A07 answers:
//   "What entity-like mentions occur in these source-supported observations,
//    and what type might each mention represent?"
//
// M-A07 does NOT answer:
//   "Which canonical entity is this?"
//
// Therefore EntityMentionCandidate:
//   - carries a typed or untyped mention extracted from an Observation
//   - is grounded to the Observation → Evidence → Artifact provenance chain
//   - has a deterministic identity scoped to (observation, span, type, value)
//   - does NOT create canonical Entity records
//   - does NOT resolve identities
//   - does NOT merge candidates across observations
//
// Boundary: EntityMentionCandidate ≠ EntityCandidate (resolution-time contract)
//           EntityMentionCandidate ≠ Entity (canonical identity)
// ============================================================================

// ============================================================================
// EntityType — canonical v1 taxonomy for entity-like mentions
//
// One canonical enum. NOT reused from NormalizedValueType, PIIPatternType,
// GraphNodeType, RelationType, or ObservationType.
// ============================================================================

export const EntityTypeSchema = z.enum([
  'PERSON',
  'ORGANIZATION',
  'LOCATION',
  'PHONE',
  'EMAIL',
  'ACCOUNT',
  'DEVICE',
  'VEHICLE',
  'ADDRESS',
  'OTHER',
]).describe('Canonical entity type taxonomy for entity-like mentions (v1)');
export type EntityType = z.infer<typeof EntityTypeSchema>;

// ============================================================================
// ExtractionMethod — categorical method describing how the candidate was found
//
// NOT confidence, NOT probability, NOT score.
// Answers: "How did M-A07 find this candidate?"
// ============================================================================

export const ExtractionMethodSchema = z.enum([
  'PATTERN_MATCH',
  'GAZETTEER_MATCH',
  'CONTEXTUAL_RULE',
  'HEURISTIC_FALLBACK',
]).describe('Categorical method describing how the candidate was extracted');
export type ExtractionMethod = z.infer<typeof ExtractionMethodSchema>;

// ============================================================================
// EntityMentionCandidate — pre-resolution entity-like mention
//
// One candidate per (observation, span, type, canonicalValue).
// Across independent observations: same textual name → separate candidates.
// Entity resolution (future) merges candidates into canonical entities.
// ============================================================================

export const EntityMentionCandidateSchema = z.object({
  /** Deterministic UUID derived from (observationId, start, end, entityType, canonicalMatchValue) */
  id: EntityMentionCandidateIdSchema,

  /** Parent Observation this mention was extracted from */
  observationId: ObservationIdSchema,

  /** Exact source/surface text of the mention */
  text: z.string().min(1).max(200)
    .describe('Exact surface text of the mention'),

  /** Inclusive mention offset within the observation content */
  start: z.number().int().nonnegative()
    .describe('Inclusive start offset within the observation content'),

  /** Exclusive mention offset within the observation content */
  end: z.number().int().positive()
    .describe('Exclusive end offset within the observation content'),

  /** Optional candidate type. May be absent when uncertain — prefer explicit uncertainty over fabricated specificity */
  entityType: EntityTypeSchema.optional()
    .describe('Candidate entity type, or absent when uncertain'),

  /** Categorical method describing how the candidate was found */
  extractionMethod: ExtractionMethodSchema
    .describe('How the candidate was extracted (not confidence)'),

  /** Optional normalized value used for matching (distinct from surface text) */
  canonicalMatchValue: z.string().min(1).max(200).optional()
    .describe('Normalized matching value, distinct from surface text'),

  /** Source-grounded provenance (inherited from Observation) */
  provenance: ProvenanceSchema
    .describe('Provenance grounding to Observation → Evidence → Artifact'),

  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict()
  .refine(
    (obj) => obj.start < obj.end,
    { message: 'start must be less than end' },
  );
export type EntityMentionCandidate = z.infer<typeof EntityMentionCandidateSchema>;
