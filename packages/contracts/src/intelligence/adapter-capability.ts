import { z } from 'zod';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Adapter Capability
//
// Declares what a source adapter supports.
// Used by the adapter registry to validate and route inputs.
// ============================================================================

export const AdapterCapabilitySchema = z.object({
  adapterId: z.string().min(1).max(200)
    .describe('Unique adapter identifier (e.g. "fir-narrative-v1", "cdr-csv-v1")'),
  adapterVersion: z.string().min(1).max(50)
    .describe('Semantic version of the adapter'),
  sourceType: z.string().min(1).max(200)
    .describe('Source type this adapter handles (e.g. "FIR_NARRATIVE", "CDR_CSV")'),
  supportedMimeTypes: z.array(z.string().min(1))
    .describe('MIME types this adapter can process'),
  supportedExtensions: z.array(z.string().min(1)).optional()
    .describe('File extensions this adapter handles (e.g. ".csv", ".pdf")'),
  description: z.string().max(2000).optional()
    .describe('Human-readable description of what this adapter does'),
  metadata: MetadataSchema.optional(),
}).strict();
export type AdapterCapability = z.infer<typeof AdapterCapabilitySchema>;
