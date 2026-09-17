// ============================================================================
// ER-Split Explanation Error (Phase 5A-PR16)
//
// Contracted typed failures (policy §7). The generator NEVER silently returns
// a plausible set for invalid input: it throws a typed error carrying a closed
// failure code. A non-throwing epistemic state (no qualifying pair -> empty
// set) is a RESULT, not an error.
// ============================================================================

import { ErSplitExplanationFailureCodeSchema } from '@indago/contracts';
import type { z } from 'zod';

export type ErSplitExplanationErrorCode = z.infer<typeof ErSplitExplanationFailureCodeSchema>;

export const ErSplitExplanationErrorCodes = ErSplitExplanationFailureCodeSchema.enum;

/** Typed, code-carrying failure of the deterministic generator boundary. */
export class ErSplitExplanationError extends Error {
  readonly code: ErSplitExplanationErrorCode;

  constructor(code: ErSplitExplanationErrorCode, message: string) {
    super(message);
    this.name = 'ErSplitExplanationError';
    this.code = code;
  }
}