import { z } from 'zod';
import {
  InvestigativeGapIdSchema,
  InvestigationIdSchema,
  CaseIdSchema,
  EntityIdSchema,
  HypothesisIdSchema,
  EvidenceRequestIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { AnalyticalConfidenceSchema, ExpectedInformationGainSchema } from '../common/confidence.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Investigative Gap
//
// A gap in the investigation — information that is missing or unresolved.
// Gaps drive evidence requests and lead prioritization.
//
// SEPARATION FROM GRAPH HOLES:
//   GapType (this file): BROAD DOMAIN reason/classification
//     MISSING_EVIDENCE, UNRESOLVED_IDENTITY, etc.
//
//   GraphHoleType (intelligence/graph-holes.ts): STRUCTURAL detection category
//     MISSING_EDGE, MISSING_PATH, ISOLATED_NODE, etc.
//
// Flow: GRAPH HOLE → candidate missing edge → possible explanations
//       → gap classification (InvestigativeGap) → evidence request
//
// A graph hole may lead to an InvestigativeGap, but they are distinct:
//   - GraphHole = structural pattern in the graph
//   - InvestigativeGap = domain-level reason something is missing
// ============================================================================

export const GapTypeSchema = z.enum([
  'MISSING_EVIDENCE',
  'UNRESOLVED_IDENTITY',
  'UNRESOLVED_RELATION',
  'TEMPORAL_GAP',
  'GEOGRAPHIC_GAP',
  'FINANCIAL_GAP',
  'COMMUNICATION_GAP',
  'KNOWLEDGE_GAP',
  'OTHER',
]);
export type GapType = z.infer<typeof GapTypeSchema>;

export const GapPrioritySchema = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);
export type GapPriority = z.infer<typeof GapPrioritySchema>;


export const GapStatusSchema = z.enum([
  'IDENTIFIED',
  'UNDER_REVIEW',
  'EVIDENCE_REQUESTED',
  'WAITING_FOR_EVIDENCE',
  'ADDRESSED',
  'WONT_FIX',
]);
export type GapStatus = z.infer<typeof GapStatusSchema>;

export const InvestigativeGapSchema = z.object({
  id: InvestigativeGapIdSchema,
  investigationId: InvestigationIdSchema,
  caseId: CaseIdSchema,
  type: GapTypeSchema,
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(10000),
  status: GapStatusSchema,
  priority: GapPrioritySchema,
  impact: AnalyticalConfidenceSchema
    .describe('How much this gap affects investigation confidence'),
  expectedInformationValue: ExpectedInformationGainSchema.optional()
    .describe('Expected reduction in uncertainty if this gap is addressed'),
  relatedEntityIds: z.array(EntityIdSchema).optional()
    .describe('Entities affected by this gap'),
  relatedHypothesisIds: z.array(HypothesisIdSchema).optional()
    .describe('Hypotheses weakened by this gap'),
  evidenceRequestIds: z.array(EvidenceRequestIdSchema).optional()
    .describe('Evidence requests raised to address this gap'),
  resolution: z.string().optional()
    .describe('How this gap was resolved, if applicable'),
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  resolvedAt: ObservedTimeSchema.optional(),
  metadata: MetadataSchema.optional(),
}).strict();
export type InvestigativeGap = z.infer<typeof InvestigativeGapSchema>;