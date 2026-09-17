// ============================================================================
// Candidate Evidence Request Generation Policy (Phase 5A-PR17)
//
// The FROZEN generation bounds live in @indago/contracts
// (intelligence/evidence-request-generation-policy.ts). This module re-exports
// the authoritative constants for the runtime and adds the runtime-owned
// evidence-type vectors used by the deterministic discrimination mapping
// (policy §6). These vectors are the ONLY place PR17 chooses which canonical
// EvidenceType to propose; it NEVER invents a vocabulary.
// ============================================================================

import type { EvidenceType } from '@indago/contracts';
import {
  EVIDENCE_REQUEST_GENERATION_POLICY_VERSION,
  EVIDENCE_REQUEST_GENERATION_POLICY_V1,
  MAX_GENERATED_CANDIDATE_REQUESTS_PER_GAP,
  MAX_GENERATED_CANDIDATE_REQUESTS_PER_EXPLANATION_PAIR,
  MAX_GENERATED_CANDIDATE_REQUESTS_PER_RUN,
  MAX_P10_CONSIDER_CEILING,
  EVIDENCE_REQUEST_GENERATION_DEDUP_RULE,
  type EvidenceRequestGenerationBounds,
  type EvidenceRequestGenerationPolicyVersion,
} from '@indago/contracts';

export {
  EVIDENCE_REQUEST_GENERATION_POLICY_VERSION,
  EVIDENCE_REQUEST_GENERATION_POLICY_V1,
  MAX_GENERATED_CANDIDATE_REQUESTS_PER_GAP,
  MAX_GENERATED_CANDIDATE_REQUESTS_PER_EXPLANATION_PAIR,
  MAX_GENERATED_CANDIDATE_REQUESTS_PER_RUN,
  MAX_P10_CONSIDER_CEILING,
  EVIDENCE_REQUEST_GENERATION_DEDUP_RULE,
  type EvidenceRequestGenerationBounds,
  type EvidenceRequestGenerationPolicyVersion,
};

/**
 * Canonical EvidenceType vectors the runtime may propose per discrimination
 * kind. Deterministic and conservative: records/documents are the canonical
 * evidence that would discriminate a recorded-vs-absent fact without asserting
 * concealment or guilt (policy §7/§11). Every vector length is well under the
 * frozen per-pair cap (5) so a bound is only reachable across many pairs.
 */
export const EVIDENCE_TYPE_VECTORS: Record<
  'COMPETING_PAIR' | 'ER_SPLIT_CROSS' | 'SINGLE_TARGET',
  readonly EvidenceType[]
> = {
  COMPETING_PAIR: ['RECORD', 'DOCUMENT'],
  ER_SPLIT_CROSS: ['RECORD', 'DOCUMENT'],
  SINGLE_TARGET: ['DOCUMENT'],
};

/** Discrimination kinds emitted by PR17 V1 (policy §6). */
export type DiscriminationKind = keyof typeof EVIDENCE_TYPE_VECTORS;