// ============================================================================
// Public API Client
//
// Client-side API module. This does NOT contain auth logic.
// For authenticated calls, use Server Actions that call lib/api/server.ts.
//
// This module provides:
// - Type exports for components to consume
// - Client-side helpers that don't need auth (if any exist in the future)
// ============================================================================

export type {
  InvestigationStatusResponse,
  StartInvestigationRequest,
  StartInvestigationResponse,
  HealthResponse,
  ApiErrorResponse,
} from "./types.js";

export { ApiError } from "./types.js";
