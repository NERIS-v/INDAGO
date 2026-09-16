// ============================================================================
// Gap Classification Error (Phase 5A-PR14)
//
// Contracted typed failures (policy §12). The classifier NEVER silently
// returns a plausible category for invalid input: it throws a typed error
// carrying a closed failure code. A non-throwing epistemic state
// (INSUFFICIENT_CONTEXT) is a RESULT, not an error.
// ============================================================================

import { GapClassificationFailureCodeSchema } from '@indago/contracts';
import type { z } from 'zod';

export type GapClassificationErrorCode = z.infer<typeof GapClassificationFailureCodeSchema>;

export const GapClassificationErrorCodes = GapClassificationFailureCodeSchema.enum;

/** Typed, code-carrying failure of the deterministic classifier boundary. */
export class GapClassificationError extends Error {
  readonly code: GapClassificationErrorCode;

  constructor(code: GapClassificationErrorCode, message: string) {
    super(message);
    this.name = 'GapClassificationError';
    this.code = code;
  }
}