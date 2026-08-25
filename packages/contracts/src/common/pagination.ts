import { z } from 'zod';

// ============================================================================
// Pagination Contracts
//
// Used for API list endpoints and paginated results.
// ============================================================================

export const PaginationRequestSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
}).strict();
export type PaginationRequest = z.infer<typeof PaginationRequestSchema>;

export const PaginationResponseSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
  hasMore: z.boolean(),
}).strict();
export type PaginationResponse = z.infer<typeof PaginationResponseSchema>;

export const PaginatedResultSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    pagination: PaginationResponseSchema,
  }).strict();
