import { z } from 'zod';

// ============================================================================
// Semantic Score Types
//
// INDAGO separates distinct measurement semantics.
// Do NOT use generic `score: number` where these types apply.
// Unless explicitly calibrated on held-out labeled data,
// these are NOT probabilities.
// ============================================================================

/**
 * Analytical confidence in the model's output.
 * Range: [0, 1]. NOT a probability unless calibrated.
 */
export const AnalyticalConfidenceSchema = z.number()
  .min(0).max(1)
  .describe('Analytical confidence in the model output. NOT a probability unless calibrated.');
export type AnalyticalConfidence = z.infer<typeof AnalyticalConfidenceSchema>;

/**
 * Support for an identity match. Ranking signal, not identity certainty.
 * Range: [0, 1].
 */
export const ResolutionScoreSchema = z.number()
  .min(0).max(1)
  .describe('Support for an identity match. Ranking signal, not identity certainty.');
export type ResolutionScore = z.infer<typeof ResolutionScoreSchema>;

/**
 * Graph-theoretic importance. NOT criminal relevance.
 * Range: [0, 1].
 */
export const StructuralSignalSchema = z.number()
  .min(0).max(1)
  .describe('Graph-theoretic importance. NOT criminal relevance.');
export type StructuralSignal = z.infer<typeof StructuralSignalSchema>;

/**
 * Quality and strength of supporting observations.
 * Range: [0, 1].
 */
export const EvidenceStrengthSchema = z.number()
  .min(0).max(1)
  .describe('Quality and strength of supporting observations.');
export type EvidenceStrength = z.infer<typeof EvidenceStrengthSchema>;

/**
 * Perturbation stability count. NOT truth probability.
 * Range: [0, 100].
 */
export const RobustnessScoreSchema = z.number()
  .min(0).max(100)
  .describe('Perturbation stability count. NOT truth probability.');
export type RobustnessScore = z.infer<typeof RobustnessScoreSchema>;

/**
 * Evidence-supported role classification strength.
 * Range: [0, 1].
 */
export const RoleSignalSchema = z.number()
  .min(0).max(1)
  .describe('Evidence-supported role classification strength. NOT legal status.');
export type RoleSignal = z.infer<typeof RoleSignalSchema>;

/**
 * Expected reduction in uncertainty. Normalized heuristic, not calibrated probability.
 * Range: [0, 1].
 */
export const ExpectedInformationGainSchema = z.number()
  .min(0).max(1)
  .describe('Expected reduction in uncertainty. Normalized heuristic, not calibrated probability.');
export type ExpectedInformationGain = z.infer<typeof ExpectedInformationGainSchema>;

/**
 * Support for the existence/type of a relationship given available evidence.
 * Range: [0, 1].
 */
export const RelationSupportSchema = z.number()
  .min(0).max(1)
  .describe('Support for the existence/type of a relationship given available evidence.');
export type RelationSupport = z.infer<typeof RelationSupportSchema>;

/**
 * Coverage across multiple dimensions.
 */
export const CoverageSchema = z.object({
  sourceCoverage: z.number().min(0).max(1)
    .describe('Proportion of relevant source systems represented'),
  temporalCoverage: z.number().min(0).max(1)
    .describe('Proportion of relevant time range covered'),
  resolutionCoverage: z.number().min(0).max(1)
    .describe('Proportion of entity resolution space covered'),
}).strict();
export type Coverage = z.infer<typeof CoverageSchema>;

/**
 * Temporal compatibility signal between entities or events.
 * Not binary — supports graded compatibility.
 */
export const TemporalCompatibilitySignalSchema = z.object({
  score: z.number().min(0).max(1)
    .describe('Temporal compatibility strength'),
  status: z.enum([
    'exact',
    'strong',
    'partial',
    'unknown',
    'contradictory',
  ]),
  basis: z.string()
    .describe('Explanation of why this compatibility status was assigned'),
}).strict();
export type TemporalCompatibilitySignal = z.infer<typeof TemporalCompatibilitySignalSchema>;

/**
 * Evidence posture tier. Separate from analytical confidence.
 */
export const EvidencePostureSchema = z.enum([
  'T0_OBSERVATION',
  'T1_INVESTIGATIVE_LEAD',
  'T2_CORROBORATED_LEAD',
  'T3_EVIDENCE_PACKAGE_CANDIDATE',
]);
export type EvidencePosture = z.infer<typeof EvidencePostureSchema>;
