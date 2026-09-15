// ============================================================================
// Targeted Reblocking — content-addressed run identity (Phase 5A-PR11)
//
// runId = SHA-256 hex of a canonical identity string. Same inputs → same
// runId every time. Re-running a targeted reblock for the same region, same
// selected candidate universe, same policy versions → SAME identity → the
// platform persist is a no-op (identityKey @unique) and auditing converges.
//
// The identity deliberately includes the selected (not merely eligible)
// candidate universe, so a change in boundary conditions produces a NEW run
// identity — never an ambiguous mutation of an existing run record.
// ============================================================================

import {
  canonicalizeDeterministic,
  TARGETED_REBLOCK_POLICY_VERSION,
  type TargetedReblockPolicyVersion,
} from '@indago/contracts';
import { sha256Hex } from '@indago/graph-hole-region';

export const TARGETED_REBLOCK_IDENTITY_NAMESPACE = 'indago:targeted-reblock';
export const TARGETED_REBLOCK_IDENTITY_VERSION = 1;

export interface TargetedReblockIdentityInput {
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly regionId: string;
  readonly regionPolicyVersion: string;
  readonly policyVersion: TargetedReblockPolicyVersion;
  readonly selectedCandidateIds: readonly string[];
}

/** Canonical identity string for a targeted reblock run. */
export function buildTargetedReblockIdentityKey(
  input: TargetedReblockIdentityInput,
): string {
  return canonicalizeDeterministic({
    namespace: TARGETED_REBLOCK_IDENTITY_NAMESPACE,
    version: `v${TARGETED_REBLOCK_IDENTITY_VERSION}`,
    caseId: input.caseId,
    graphVersionId: input.graphVersionId,
    regionId: input.regionId,
    regionPolicyVersion: input.regionPolicyVersion,
    policyVersion: input.policyVersion,
    selectedCandidateIds: [...new Set(input.selectedCandidateIds)].sort(),
  });
}

/** Content-addressed run id (64-char lowercase hex). */
export function targetedReblockRunId(identityKey: string): string {
  return sha256Hex(identityKey);
}

export { TARGETED_REBLOCK_POLICY_VERSION };