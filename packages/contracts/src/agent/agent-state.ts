import { z } from 'zod';
import {
  InvestigationIdSchema,
  InvestigationRunIdSchema,
  HypothesisIdSchema,
  LeadIdSchema,
} from '../common/ids.js';
import { AnalyticalConfidenceSchema } from '../common/confidence.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Agent State
//
// The internal state of the INDAGO agent during execution.
// ============================================================================

export const AgentPhaseSchema = z.enum([
  'INITIALIZING',
  'OBSERVING',
  'HYPOTHESIZING',
  'ANALYZING',
  'REASONING',
  'ACTING',
  'REVIEWING',
  'IDLE',
]);
export type AgentPhase = z.infer<typeof AgentPhaseSchema>;

export const AgentStateSchema = z.object({
  investigationId: InvestigationIdSchema,
  runId: InvestigationRunIdSchema,
  phase: AgentPhaseSchema,
  currentHypothesisIds: z.array(HypothesisIdSchema)
    .describe('Hypotheses currently being evaluated'),
  currentLeadIds: z.array(LeadIdSchema)
    .describe('Leads currently being pursued'),
  overallConfidence: AnalyticalConfidenceSchema
    .describe('Agent confidence in current model'),
  reasoningChain: z.array(z.object({
    step: z.number().int().positive(),
    action: z.string()
      .describe('What the agent did'),
    rationale: z.string()
      .describe('Why the agent did it'),
    confidence: AnalyticalConfidenceSchema
      .describe('Confidence in this reasoning step'),
    timestamp: ObservedTimeSchema,
  }))
    .describe('Chain of reasoning for explainability'),
  iterationCount: z.number().int().nonnegative()
    .describe('Number of reasoning iterations'),
  maxIterations: z.number().int().positive()
    .describe('Maximum allowed iterations'),
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type AgentState = z.infer<typeof AgentStateSchema>;
