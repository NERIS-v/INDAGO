// ============================================================================
// Candidate wording templates (Phase 5A-PR17, policy §11)
//
// Every candidate is NEUTRAL and ACTIONABLE. Wording NEVER asserts concealment
// or guilt and NEVER frames a request as proving a split occurred. Templates
// are pattern-compatible only — the candidate proposes that a request could
// discriminate between the explicitly-considered explanations.
// ============================================================================

import type { EvidenceType } from '@indago/contracts';
import type { DiscriminationKind } from './generation-policy.js';

function typeLabel(evidenceType: EvidenceType): string {
  return evidenceType.charAt(0).toUpperCase() + evidenceType.slice(1).toLowerCase();
}

export interface TemplateInput {
  readonly discriminationKind: DiscriminationKind;
  readonly evidenceType: EvidenceType;
  readonly discriminatesAmongIds: readonly string[];
}

/**
 * Deterministic, neutral rationale. Never asserts a fact about the competing
 * explanations — only that the request would help distinguish them.
 */
export function rationaleFor(input: TemplateInput): string {
  const label = typeLabel(input.evidenceType);
  switch (input.discriminationKind) {
    case 'COMPETING_PAIR':
      return (
        `${label} evidence would help distinguish between the competing explanations of why this ` +
        `investigative gap exists. Requesting it proposes discriminating signal; it asserts no ` +
        `explanation is correct.`
      );
    case 'ER_SPLIT_CROSS':
      return (
        `${label} evidence would help determine whether the apparent entity-identity difference ` +
        `reflects distinct entities or a representation artifact, in the context of the competing ` +
        `explanations. It asserts no split occurred.`
      );
    case 'SINGLE_TARGET':
      return (
        `${label} evidence would add supporting signal for the leading explanation of this gap. ` +
        `Requesting it proposes corroboration only.`
      );
  }
}

/** Deterministic, descriptive, traceable wording (ids included for audit). */
export function descriptionFor(input: TemplateInput): string {
  const label = typeLabel(input.evidenceType);
  const target = [...new Set(input.discriminatesAmongIds)].sort().join(',');
  return `${label} evidence request to discriminate among explanation(s) [${target}].`;
}