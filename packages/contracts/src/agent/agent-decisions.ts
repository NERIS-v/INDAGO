import { z } from 'zod';
import {
  InvestigationIdSchema,
  InvestigationRunIdSchema,
  EntityIdSchema,
  HypothesisIdSchema,
  LeadIdSchema,
  ToolIdSchema,
} from '../common/ids.js';
import { AnalyticalConfidenceSchema, ExpectedInformationGainSchema } from '../common/confidence.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Agent Decisions
//
// Records decisions made by the agent during investigation execution.
// ============================================================================

export const DecisionTypeSchema = z.enum([
  'TOOL_SELECTION',
  'HYPOTHESIS_PRIORITY',
  'LEAD_SELECTION',
  'EVIDENCE_REQUEST',
  'GAP_ADDRESSING',
  'ENTITY_FOCUS',
  'STAGE_TRANSITION',
  'TERMINATION',
]);
export type DecisionType = z.infer<typeof DecisionTypeSchema>;

export const AgentDecisionSchema = z.object({
  investigationId: InvestigationIdSchema,
  runId: InvestigationRunIdSchema,
  type: DecisionTypeSchema,
  decision: z.string().min(1).max(5000)
    .describe('What was decided'),
  rationale: z.string().min(1).max(10000)
    .describe('Why this decision was made'),
  confidence: AnalyticalConfidenceSchema
    .describe('Confidence in this decision'),
  expectedInformationGain: ExpectedInformationGainSchema.optional()
    .describe('Expected information gain from this decision'),
  alternatives: z.array(z.object({
    option: z.string().min(1).max(500)
      .describe('Description of the alternative option'),
    score: z.number().min(0).max(1)
      .describe('Score for this alternative option'),
    rationale: z.string().min(1).max(5000)
      .describe('Why this option was considered'),
  })).optional()
    .describe('Alternative options considered'),
  relatedEntityIds: z.array(EntityIdSchema).optional(),
  relatedHypothesisIds: z.array(HypothesisIdSchema).optional(),
  relatedLeadIds: z.array(LeadIdSchema).optional(),
  toolId: ToolIdSchema.optional()
    .describe('Tool selected, if this is a tool selection decision'),
  timestamp: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type AgentDecision = z.infer<typeof AgentDecisionSchema>;
