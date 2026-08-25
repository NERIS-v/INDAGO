import { z } from 'zod';
import { SourceIdSchema, ArtifactIdSchema, ObservationIdSchema, HypothesisIdSchema, LeadIdSchema } from './ids.js';
import { ObservedTimeSchema } from './timestamps.js';

// ============================================================================
// Provenance Contracts
//
// Provenance traces the chain: RAW SOURCE → OBSERVATION → DERIVED → HYPOTHESIS → LEAD
// Every material inference must be traceable to observations and source records.
// ============================================================================

/**
 * A single provenance entry linking to source material.
 */
export const ProvenanceSchema = z.object({
  sourceId: SourceIdSchema,
  artifactId: ArtifactIdSchema.optional(),
  documentRef: z.string().optional()
    .describe('Document identifier within the source'),
  pageRef: z.string().optional()
    .describe('Page or section reference'),
  spanRef: z.string().optional()
    .describe('Character/byte span within a document'),
  rowRef: z.string().optional()
    .describe('Row reference for tabular data'),
  extractor: z.string()
    .describe('Name/version of the extraction method'),
  extractionMethod: z.string().optional()
    .describe('Specific extraction technique used'),
  derivedFrom: z.array(ObservationIdSchema).optional()
    .describe('Upstream observation IDs this was derived from'),
}).strict();
export type Provenance = z.infer<typeof ProvenanceSchema>;

/**
 * Ordered provenance chain tracing the full lineage.
 */
export const ProvenanceChainSchema = z.object({
  entries: z.array(ProvenanceSchema).min(1)
    .describe('Ordered chain from raw source to current object'),
  currentHypothesisId: HypothesisIdSchema.optional(),
  currentLeadId: LeadIdSchema.optional(),
  createdAt: ObservedTimeSchema,
}).strict();
export type ProvenanceChain = z.infer<typeof ProvenanceChainSchema>;
