// ============================================================================
// Competing Explanation Error (Phase 5A-PR15)
//
// Contracted typed failures (policy §7). The generator NEVER silently returns
// a plausible set for invalid input: it throws a typed error carrying a closed
// failure code. A non-throwing epistemic state (INSUFFICIENT_CONTEXT -> empty
// set) is a RESULT, not an error.
// ============================================================================

import { CompetingExplanationFailureCodeSchema } from '@indago/contracts';
import type { z } from 'zod';

export type CompetingExplanationErrorCode = z.infer<typeof CompetingExplanationFailureCodeSchema>;

export const CompetingExplanationErrorCodes = CompetingExplanationFailureCodeSchema.enum;

/** Typed, code-carrying failure of the deterministic generator boundary. */
export class CompetingExplanationError extends Error {
  readonly code: CompetingExplanationErrorCode;

  constructor(code: CompetingExplanationErrorCode, message: string) {
    super(message);
    this.name = 'CompetingExplanationError';
    this.code = code;
  }
}