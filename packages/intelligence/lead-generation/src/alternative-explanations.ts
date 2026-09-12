// ============================================================================
// Alternative explanation generation
//
// P4 / Phase 6 / Phase 9 discipline: structural signal != criminal relevance.
// Every lead this package drafts ships with at least one deterministic,
// template-based (never LLM-guessed) non-incriminating alternative reading of
// the same signal, so a reviewer sees the innocent explanation alongside the
// investigative one rather than having to think of it themselves.
//
// These are DETERMINISTIC TEMPLATES keyed on candidate type — not learned,
// not scored by any model, and not case-specific speculation. `plausibility`
// values are fixed per template (a considered analytical judgment about how
// commonly that innocent reading applies to this SHAPE of structural
// signal), not computed from case content — computing a case-specific
// plausibility score would itself be exactly the kind of semantic guess this
// package is designed to avoid.
// ============================================================================

import type { AlternativeExplanation, LeadSourceCandidateType } from '@indago/contracts';

export interface AlternativeExplanationContext {
  readonly relatedEntityIds: readonly string[];
  readonly relatedObservationIds?: readonly string[];
}

function bridgeAlternatives(ctx: AlternativeExplanationContext): AlternativeExplanation[] {
  return [
    {
      kind: 'ADMINISTRATIVE_OR_PROCEDURAL_LINK',
      statement:
        'The single connecting relation may be an administrative or procedural link (e.g. a shared employer, landlord, legal representative, or service provider) rather than a coordinated connection between the two sides.',
      plausibility: 0.5,
      wouldBeConsistentWithEntityIds: [...ctx.relatedEntityIds],
      requiresAdditionalEvidence: [
        'Confirm the nature of the relation type recorded on the bridge edge.',
        'Check whether either endpoint has an independent, non-suspicious reason to be linked (e.g. institutional role).',
      ],
      relatedObservationIds: [...(ctx.relatedObservationIds ?? [])],
    },
    {
      kind: 'INCOMPLETE_RESOLUTION',
      statement:
        'The apparent bridge may be an artifact of incomplete entity resolution elsewhere in the graph — a missing relation on either side (not yet observed or not yet resolved) could mean the two components are actually already connected another way, and this edge is not truly the sole connector.',
      plausibility: 0.35,
      wouldBeConsistentWithEntityIds: [...ctx.relatedEntityIds],
      requiresAdditionalEvidence: [
        'Review whether additional evidence sources for either component remain unprocessed.',
      ],
      relatedObservationIds: [],
    },
  ];
}

function temporalBurstAlternatives(ctx: AlternativeExplanationContext): AlternativeExplanation[] {
  return [
    {
      kind: 'DATA_ARTIFACT',
      statement:
        'The clustered timestamps may reflect a batch data import, a backfilled record set, or a source system that only reports periodically — not a genuine burst of real-world activity.',
      plausibility: 0.55,
      wouldBeConsistentWithEntityIds: [...ctx.relatedEntityIds],
      requiresAdditionalEvidence: [
        'Check whether the contributing observations share a single ingestion/evidence batch.',
        'Compare the recorded event-time precision — coarse precision (month/year) clustering at a bucket boundary can be a rounding artifact.',
      ],
      relatedObservationIds: [...(ctx.relatedObservationIds ?? [])],
    },
    {
      kind: 'COINCIDENTAL_TIMING',
      statement:
        'Multiple independent, unrelated events may simply have occurred in the same short window by coincidence, especially for an entity with generally high activity.',
      plausibility: 0.3,
      wouldBeConsistentWithEntityIds: [...ctx.relatedEntityIds],
      requiresAdditionalEvidence: [
        "Compare this entity's overall activity level against other entities of the same type.",
      ],
      relatedObservationIds: [],
    },
  ];
}

function communityAlternatives(ctx: AlternativeExplanationContext): AlternativeExplanation[] {
  return [
    {
      kind: 'SHARED_NEUTRAL_INSTITUTION',
      statement:
        'Dense mutual connectivity within this group may reflect membership in a shared neutral institution (workplace, family, social group, apartment building, or service provider) rather than coordinated activity.',
      plausibility: 0.5,
      wouldBeConsistentWithEntityIds: [...ctx.relatedEntityIds],
      requiresAdditionalEvidence: [
        'Check whether the relation types binding this community are predominantly one administrative/social type (e.g. all "association" via a single shared context).',
      ],
      relatedObservationIds: [...(ctx.relatedObservationIds ?? [])],
    },
    {
      kind: 'COMMON_INFRASTRUCTURE',
      statement:
        'The community may be an artifact of shared infrastructure (a common phone exchange, financial intermediary, or address) rather than direct relationships between the members themselves.',
      plausibility: 0.35,
      wouldBeConsistentWithEntityIds: [...ctx.relatedEntityIds],
      requiresAdditionalEvidence: [
        'Identify whether a single third-party entity or service is the common link across most pairs in the community.',
      ],
      relatedObservationIds: [],
    },
  ];
}

function crossCaseAlternatives(ctx: AlternativeExplanationContext): AlternativeExplanation[] {
  return [
    {
      kind: 'SHARED_NEUTRAL_INSTITUTION',
      statement:
        'The same entity appearing in both cases may reflect a neutral, unrelated role (e.g. a common service provider, financial institution, or public official) rather than a substantive link between the two cases.',
      plausibility: 0.45,
      wouldBeConsistentWithEntityIds: [...ctx.relatedEntityIds],
      requiresAdditionalEvidence: [
        "Check whether the entity's role differs meaningfully between the two cases.",
      ],
      relatedObservationIds: [...(ctx.relatedObservationIds ?? [])],
    },
    {
      kind: 'INCOMPLETE_RESOLUTION',
      statement:
        'The match may be a false positive of entity resolution — two distinct real-world individuals or organizations sharing a common name/identifier string without actually being the same entity.',
      plausibility: 0.4,
      wouldBeConsistentWithEntityIds: [...ctx.relatedEntityIds],
      requiresAdditionalEvidence: [
        'Confirm the match with a secondary, higher-specificity identifier before treating the two cases as linked.',
      ],
      relatedObservationIds: [],
    },
  ];
}

/**
 * Generate the deterministic alternative-explanation set for a lead, keyed
 * by which P4 candidate detector produced it. MANUAL leads (human-authored,
 * not detector-sourced) get no auto-generated alternatives — a human
 * authoring a lead directly is expected to supply their own reasoning.
 */
export function generateAlternativeExplanations(
  sourceCandidateType: LeadSourceCandidateType,
  ctx: AlternativeExplanationContext,
): AlternativeExplanation[] {
  switch (sourceCandidateType) {
    case 'BRIDGE':
      return bridgeAlternatives(ctx);
    case 'TEMPORAL_BURST':
      return temporalBurstAlternatives(ctx);
    case 'COMMUNITY':
      return communityAlternatives(ctx);
    case 'CROSS_CASE':
      return crossCaseAlternatives(ctx);
    case 'MANUAL':
      return [];
    default: {
      const _exhaustive: never = sourceCandidateType;
      return _exhaustive;
    }
  }
}
