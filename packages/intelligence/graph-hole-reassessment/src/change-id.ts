import {
  canonicalizeReassessmentChangeIdentity,
  type ReassessmentTrigger,
} from '@indago/contracts';
import { sha256Hex } from './sha256.js';

// ============================================================================
// Change identity
//
// changeId = SHA-256(canonicalizeReassessmentChangeIdentity(trigger)).
//
// Determinism guarantees:
//   - Same authoritative change -> same changeId regardless of computedAt,
//     delivery order, or worker identity.
//   - The case-scoped CaseReassessmentChange.changeId @unique constraint turns
//     duplicate publication / crash-then-rerun into an idempotent no-op.
// ============================================================================

export function buildReassessmentChangeId(trigger: ReassessmentTrigger): string {
  return sha256Hex(canonicalizeReassessmentChangeIdentity(trigger));
}