import { z } from 'zod';
import { ToolIdSchema } from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Tool
//
// Definition of an INDAGO tool (plugin/module) that can be executed.
// ============================================================================

export const ToolCategorySchema = z.enum([
  'EXTRACTION',
  'ANALYSIS',
  'ENRICHMENT',
  'VERIFICATION',
  'EXPORT',
  'INTEGRATION',
]);
export type ToolCategory = z.infer<typeof ToolCategorySchema>;

export const ToolStatusSchema = z.enum([
  'REGISTERED',
  'ACTIVE',
  'DEPRECATED',
  'DISABLED',
]);
export type ToolStatus = z.infer<typeof ToolStatusSchema>;

export const ToolParameterSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.string()
    .describe('Zod schema name or JSON Schema type'),
  required: z.boolean().default(false),
  description: z.string().max(500).optional(),
  defaultValue: z.unknown().optional(),
}).strict();
export type ToolParameter = z.infer<typeof ToolParameterSchema>;

export const ToolSchema = z.object({
  id: ToolIdSchema,
  name: z.string().min(1).max(200)
    .describe('Machine-readable tool name'),
  displayName: z.string().min(1).max(200)
    .describe('Human-readable tool name'),
  version: z.string().min(1)
    .describe('Semantic version'),
  category: ToolCategorySchema,
  status: ToolStatusSchema,
  description: z.string().max(5000),
  parameters: z.array(ToolParameterSchema)
    .describe('Input parameters this tool accepts'),
  outputType: z.string()
    .describe('Output schema name'),
  timeoutMs: z.number().int().positive().optional()
    .describe('Default timeout in milliseconds'),
  maxRetries: z.number().int().nonnegative().default(0),
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type Tool = z.infer<typeof ToolSchema>;
