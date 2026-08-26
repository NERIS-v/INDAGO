// ============================================================================
// Validation Schemas
//
// Zod validation for API response payloads.
// Uses @indago/contracts schemas where they exist.
// Local schemas where contracts don't cover the response shape.
// ============================================================================

import { z } from "zod";
import {
  InvestigationRunStateSchema,
  InvestigationRunStatusSchema,
} from "@indago/contracts";

// ============================================================================
// Investigation Status Response (GET /api/v1/investigations/:id)
// No contracts match — defines local shape matching Prisma model output.
// ============================================================================

export const InvestigationStatusResponseSchema = z.object({
  id: z.string().uuid(),
  investigationId: z.string().uuid(),
  status: InvestigationRunStatusSchema,
  state: InvestigationRunStateSchema,
  currentStage: z.string().optional(),
  error: z.string().optional(),
  retryCount: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ============================================================================
// Start Investigation Response (POST /api/v1/investigations/start)
// ============================================================================

export const StartInvestigationResponseSchema = z.object({
  message: z.string(),
  runId: z.string().uuid(),
});

// ============================================================================
// Health Response
// ============================================================================

export const HealthResponseSchema = z.object({
  status: z.string(),
  service: z.string(),
});

// ============================================================================
// API Error Response
// ============================================================================

export const ApiErrorResponseSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});

// ============================================================================
// SSE Audit Event (matches AuditEvent Prisma model shape)
// ============================================================================

export const SseAuditEventSchema = z.object({
  id: z.string().optional(),
  investigationId: z.string(),
  action: z.string().optional(),
  actor: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  description: z.string().optional(),
  timestamp: z.string().optional(),
  previousHash: z.string().optional(),
  hash: z.string().optional(),
});
