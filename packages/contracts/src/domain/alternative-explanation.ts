import { z } from 'zod';
import { EntityIdSchema, ObservationIdSchema } from '../common/ids.js';

// ============================================================================
// Alternative Explanation
//
// P4 discipline: every structural/temporal candidate that becomes a Lead
// (bridge, temporal burst, community, cross-case match) admits innocent,
// non-criminal readings — a bridge relation might be a shared employer, a
// burst might be a batch data import, a dense community might be a shared
// neutral venue. Structural signal != criminal relevance (same discipline as
// StructuralSignalSchema / RoleSignalSchema in confidence.ts) means every
// high-impact lead MUST ship with at least one alternative explanation
// surfaced alongside it, not buried or omitted.
//
// AlternativeExplanations are GENERATED DETERMINISTICALLY from the candidate
// type by @indago/lead-generation (template-based, not an LLM guess). 
// `plausibility` is an analytical
// heuristic (same semantics as AnalyticalConfidenceSchema: NOT a probability
// unless calibrated) that a human reviewer can use to triage which
// alternative to check first; it is never used to auto-dismiss the lead.
// ============================================================================

export const AlternativeExplanationKindSchema = z.enum([
  'SHARED_NEUTRAL_INSTITUTION',
  'ADMINISTRATIVE_OR_PROCEDURAL_LINK',
  'DATA_ARTIFACT',
  'COMMON_INFRASTRUCTURE',
  'COINCIDENTAL_TIMING',
  'INCOMPLETE_RESOLUTION',
  'OTHER',
]);
export type AlternativeExplanationKind = z.infer<typeof AlternativeExplanationKindSchema>;

export const AlternativeExplanationSchema = z.object({
  kind: AlternativeExplanationKindSchema,
  statement: z.string().min(1).max(2000)
    .describe('The non-incriminating alternative reading of the structural signal'),
  plausibility: z.number().min(0).max(1)
    .describe('Analytical heuristic for reviewer triage. NOT a probability unless calibrated.'),
  wouldBeConsistentWithEntityIds: z.array(EntityIdSchema).default([])
    .describe('Entities whose presence would support this alternative reading'),
  requiresAdditionalEvidence: z.array(z.string()).default([])
    .describe('Plain-language description of what evidence would confirm or rule this out'),
  relatedObservationIds: z.array(ObservationIdSchema).default([])
    .describe('Observations already on hand that are consistent with this alternative'),
}).strict();
export type AlternativeExplanation = z.infer<typeof AlternativeExplanationSchema>;
