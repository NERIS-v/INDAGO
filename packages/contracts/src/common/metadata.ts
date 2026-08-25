import { z } from 'zod';

// ============================================================================
// Metadata Contracts
//
// Generic metadata shapes attached to domain objects.
// ============================================================================

export const LabelSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().min(1).max(500),
}).strict();
export type Label = z.infer<typeof LabelSchema>;

export const TagSchema = z.object({
  name: z.string().min(1).max(50)
    .describe('Tag name, lowercase, hyphen-separated'),
  category: z.string().optional()
    .describe('Optional category grouping'),
}).strict();
export type Tag = z.infer<typeof TagSchema>;

export const MetadataSchema = z.object({
  labels: z.array(LabelSchema).optional(),
  tags: z.array(TagSchema).optional(),
  customFields: z.record(z.string(), z.unknown()).optional()
    .describe('Extensible key-value store. Prefer typed fields over this.'),
}).strict();
export type Metadata = z.infer<typeof MetadataSchema>;
