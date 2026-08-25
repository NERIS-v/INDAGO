import { z } from 'zod';
import {
  InvestigationIdSchema,
  ObservationIdSchema,
  EvidenceIdSchema,
  HypothesisIdSchema,
} from '../common/ids.js';
import { EvidenceStrengthSchema } from '../common/confidence.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { ProvenanceSchema } from '../common/provenance.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Counter-Evidence
//
// Identifies and tracks evidence that contradicts hypotheses.
// ============================================================================

export const CounterEvidenceSignalSchema = z.object({
  observationId: ObservationIdSchema
    .describe('The contradicting observation'),
  evidenceId: EvidenceIdSchema
    .describe('The evidence package containing this observation'),
  hypothesisId: HypothesisIdSchema
    .describe('The hypothesis being contradicted'),
  strength: EvidenceStrengthSchema
    .describe('Strength of the contradiction'),
  contradictionType: z.enum([
    'DIRECT_REFUTATION',
    'TEMPORAL_IMPOSSIBILITY',
    'LOGICAL_INCONSISTENCY',
    'SOURCE_CREDIBILITY',
    'INCOMPLETE_INFORMATION',
  ]),
  description: z.string()
    .describe('How this observation contradicts the hypothesis'),
  provenance: ProvenanceSchema,
  detectedAt: ObservedTimeSchema,
}).strict();
export type CounterEvidenceSignal = z.infer<typeof CounterEvidenceSignalSchema>;

export const CounterEvidenceReportSchema = z.object({
  investigationId: InvestigationIdSchema,
  hypothesisId: HypothesisIdSchema,
  signals: z.array(CounterEvidenceSignalSchema).min(1),
  totalContradictingObservations: z.number().int().nonnegative(),
  totalContradictingEvidence: z.number().int().nonnegative(),
  strongestContradiction: EvidenceStrengthSchema,
  hypothesisStatus: z.enum([
    'STILL_SUPPORTED',
    'WEAKENED',
    'CONTRADICTED',
    'REFUTED',
  ]),
  computedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type CounterEvidenceReport = z.infer<typeof CounterEvidenceReportSchema>;
