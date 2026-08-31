import { z } from 'zod';
import {
  EntityIdSchema,
  EntityHypothesisIdSchema,
  InvestigationIdSchema,
  ObservationIdSchema,
  EntityComparisonIdSchema,
  CandidatePairIdSchema,
  EntityMentionCandidateIdSchema,
} from '../common/ids.js';
import { ResolutionScoreSchema } from '../common/confidence.js';
import { EntityComparisonStatusSchema, EntityResolutionStatusSchema } from '../common/comparison-status.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Entity Resolution
//
// Entity resolution matches and merges entities across sources.
//
// V1 scope: EntityMentionCandidate ↔ EntityMentionCandidate (same case only).
// Candidate↔Entity resolution is FUTURE scope.
// ============================================================================

export const EntityResolutionRequestSchema = z.object({
  investigationId: InvestigationIdSchema,
  entityHypothesisIds: z.array(EntityHypothesisIdSchema).min(2)
    .describe('Entity hypotheses to compare'),
  strictMode: z.boolean().default(false)
    .describe('If true, only resolve when confidence is high'),
}).strict();
export type EntityResolutionRequest = z.infer<typeof EntityResolutionRequestSchema>;

export const EntityResolutionCandidateSchema = z.object({
  entityId: EntityIdSchema,
  score: ResolutionScoreSchema,
  supportingObservations: z.array(ObservationIdSchema),
  contradictingObservations: z.array(ObservationIdSchema),
  sourceCount: z.number().int().nonnegative(),
}).strict();
export type EntityResolutionCandidate = z.infer<typeof EntityResolutionCandidateSchema>;

export const EntityResolutionResultSchema = z.object({
  entityHypothesisId: EntityHypothesisIdSchema,
  candidates: z.array(EntityResolutionCandidateSchema).min(1),
  comparisonId: EntityComparisonIdSchema,
  topCandidateScore: ResolutionScoreSchema,
  status: EntityResolutionStatusSchema,
  comparisonStatus: EntityComparisonStatusSchema,
  computedAt: ObservedTimeSchema,
  computationTimeMs: z.number().int().nonnegative(),
  metadata: MetadataSchema.optional(),
}).strict();
export type EntityResolutionResult = z.infer<typeof EntityResolutionResultSchema>;

// ============================================================================
// Candidate Resolution (M-A09 v1)
//
// M-A09 v1 operates on EntityMentionCandidate ↔ EntityMentionCandidate within
// the SAME CASE. This schema represents the typed output of a deterministic
// comparison between two candidates via a CandidatePair.
//
// This is NOT an EntityHypothesis — it is the intermediate pure-engine
// comparison result that the persistence layer maps to an EntityHypothesis
// record.
//
// ABSENT ≠ DIFFERENT:
//   Missing data (ABSENT) is not contradictory evidence. Two candidates where
//   one has a phone and the other does NOT have a phone are ABSENT — the
//   missing phone does not argue AGAINST identity. Two candidates where both
//   have DIFFERENT phone numbers IS contradictory evidence.
// ============================================================================

/**
 * Evidence item from a single comparison feature.
 * Keep small and auditable — not an enormous feature-vector schema.
 *
 * Relation semantics:
 *   EXACT_MATCH      — both present, normalized values identical
 *   INITIAL_MATCH    — name initials agree (surname + first initial)
 *   DIFFERENT        — both present, values differ (potential contradiction)
 *   TYPE_COMPATIBLE  — entity types are compatible
 *   TYPE_MISMATCH    — entity types are incompatible
 *   BOTH_ABSENT      — neither candidate has this feature (no signal)
 *   LEFT_ABSENT      — only right candidate has this feature (no contradiction)
 *   RIGHT_ABSENT     — only left candidate has this feature (no contradiction)
 *
 * CRITICAL: ABSENT (LEFT_ABSENT, RIGHT_ABSENT, BOTH_ABSENT) is NOT DIFFERENT.
 * Missing data does not argue against identity. Only DIFFERENT (both present,
 * different values) may contribute to contradiction.
 */
export const ComparisonEvidenceSchema = z.object({
  feature: z.string()
    .describe('Feature category compared (PHONE, EMAIL, NAME, TYPE, ACCOUNT, UUID, DEVICE, VEHICLE, ADDRESS)'),
  leftValue: z.string()
    .describe('Normalized left candidate value, or ABSENT'),
  rightValue: z.string()
    .describe('Normalized right candidate value, or ABSENT'),
  relation: z.enum([
    'EXACT_MATCH',
    'INITIAL_MATCH',
    'DIFFERENT',
    'TYPE_COMPATIBLE',
    'TYPE_MISMATCH',
    'BOTH_ABSENT',
    'LEFT_ABSENT',
    'RIGHT_ABSENT',
  ]).describe('Deterministic relation. ABSENT ≠ DIFFERENT.'),
  weight: z.number()
    .describe('Scoring weight applied for this evidence item'),
  reason: z.string()
    .describe('Human-readable explanation of why this weight was assigned'),
}).strict();
export type ComparisonEvidence = z.infer<typeof ComparisonEvidenceSchema>;

/**
 * CandidateResolution — the typed output of a deterministic comparison
 * between two EntityMentionCandidates via a CandidatePair.
 *
 * This is the pure engine output. The platform persistence layer maps this
 * to an EntityHypothesis record.
 *
 * ResolutionScore is a RANKING / SUPPORT signal. It is NOT a calibrated
 * probability. It does NOT determine hypothesis lifecycle status.
 */
export const CandidateResolutionSchema = z.object({
  candidatePairId: CandidatePairIdSchema
    .describe('The CandidatePair this resolution was derived from'),
  leftCandidateId: EntityMentionCandidateIdSchema
    .describe('Left candidate ID (canonical ordering)'),
  rightCandidateId: EntityMentionCandidateIdSchema
    .describe('Right candidate ID (canonical ordering)'),
  score: ResolutionScoreSchema
    .describe('Ranking/support signal for identity match. NOT a probability.'),
  comparisonEvidence: z.array(ComparisonEvidenceSchema).min(1)
    .describe('Deterministic comparison evidence items'),
  supportingObservationIds: z.array(ObservationIdSchema)
    .describe('Observations whose content contributes to the identity match evidence'),
  contradictingObservationIds: z.array(ObservationIdSchema)
    .describe('Observations containing evidence AGAINST the proposed identity. Only observations with mutually exclusive identity fields (e.g. different phones when both present) may enter this collection. Missing data (ABSENT) is NOT contradiction.'),
  comparisonStatus: EntityComparisonStatusSchema
    .describe('Comparison audit/recovery status'),
  status: EntityResolutionStatusSchema
    .describe('Hypothesis lifecycle status'),
  scoreModelVersion: z.string().min(1)
    .describe('Versioned scoring model identifier (indago:resolution-score:v1)'),
}).strict();
export type CandidateResolution = z.infer<typeof CandidateResolutionSchema>;
