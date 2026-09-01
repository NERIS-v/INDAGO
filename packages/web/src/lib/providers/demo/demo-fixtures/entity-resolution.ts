// ============================================================================
// Operation Financial Shadow — Entity Resolution fixtures (canonical shape)
//
// The demo ambiguity: is the "nominee director" of Shell One (registry filing
// ND-118) the SAME person as Victor Aldridge? OBS_8 derives a shared-address
// match; OBS_9 (registry cross-check CC-882) records a DIFFERENT address for
// director "V. Aldridge" — both present, so ADDRESS counts as genuine
// contradiction. ABSENT values (UUID BOTH_ABSENT) contribute NO contradiction
// (ABSENT ≠ DIFFERENT).
//
// M-A09 semantics honored:
//   - score 0.51 is a RANKING SIGNAL, not a probability, and does not
//     auto-accept anything (status stays UNRESOLVED until a deliberate
//     analyst decision).
//   - No canonical Entity is created for the nominee; the unresolved identity
//     IS the ambiguity being demonstrated.
// ============================================================================

import {
  EntityMentionCandidateSchema,
  CandidatePairSchema,
  CandidateResolutionSchema,
  EntityHypothesisSchema,
} from "@indago/contracts";
import {
  CASE_ID,
  INVESTIGATION_ID,
  OBS_8,
  OBS_9,
  SRC_REGISTRY,
  EMC_NOMINEE,
  EMC_VICTOR_RESIDENCE,
  EMC_VICTOR_SURVEILLANCE,
  PAIR_RES_1,
  HYP_RES_1,
  ENT_VICTOR,
} from "./lookup";
import { obs } from "./times";

const OBS_8_CONTENT =
  "Registry lists a nominee director for Shell One with residential address shared with Victor.";
const OBS_9_CONTENT =
  "Registry cross-check CC-882 lists the residential address for director V. Aldridge as 8 Rue des Capucines, Lyon — conflicting with the Shell One beneficiary filing's shared-address line (14 Rue de la Paix, Paris).";

function mentionSpan(content: string, text: string): { start: number; end: number } {
  const start = content.indexOf(text);
  if (start < 0) throw new Error(`Mention "${text}" not found in fixture content.`);
  return { start, end: start + text.length };
}

const nomineeSpan = mentionSpan(OBS_8_CONTENT, "nominee director");
const victorSpan = mentionSpan(OBS_8_CONTENT, "Victor");
const surveySpan = mentionSpan(OBS_9_CONTENT, "V. Aldridge");

// The two candidates under comparison (canonical ordering: EMC_NOMINEE is
// lexically smaller than EMC_VICTOR_RESIDENCE, so it is the left side).
const c1 = {
  id: EMC_NOMINEE,
  observationId: OBS_8,
  text: "nominee director",
  start: nomineeSpan.start,
  end: nomineeSpan.end,
  entityType: "PERSON" as const,
  extractionMethod: "GAZETTEER_MATCH" as const,
  canonicalMatchValue: "nominee-director-118",
  provenance: { sourceId: SRC_REGISTRY, extractor: "registry.extractor.v1" },
  createdAt: obs("2024-06-25"),
  updatedAt: obs("2024-06-25"),
};

const c2 = {
  id: EMC_VICTOR_RESIDENCE,
  observationId: OBS_8,
  text: "Victor",
  start: victorSpan.start,
  end: victorSpan.end,
  entityType: "PERSON" as const,
  extractionMethod: "CONTEXTUAL_RULE" as const,
  canonicalMatchValue: "victor-aldridge",
  provenance: { sourceId: SRC_REGISTRY, extractor: "registry.extractor.v1" },
  createdAt: obs("2024-06-25"),
  updatedAt: obs("2024-06-25"),
};

const c3 = {
  id: EMC_VICTOR_SURVEILLANCE,
  observationId: OBS_9,
  text: "V. Aldridge",
  start: surveySpan.start,
  end: surveySpan.end,
  entityType: "PERSON" as const,
  extractionMethod: "PATTERN_MATCH" as const,
  canonicalMatchValue: "victor-aldridge",
  provenance: { sourceId: SRC_REGISTRY, extractor: "registry.extractor.v1" },
  createdAt: obs("2024-06-25"),
  updatedAt: obs("2024-06-25"),
};

const pair = {
  id: PAIR_RES_1,
  caseId: CASE_ID,
  investigationId: INVESTIGATION_ID,
  leftCandidateId: EMC_NOMINEE,
  rightCandidateId: EMC_VICTOR_RESIDENCE,
  blockingPasses: ["NAME_INITIAL_BLOCK"] as const,
  createdAt: obs("2024-06-25"),
};

const resolution = {
  candidatePairId: PAIR_RES_1,
  leftCandidateId: EMC_NOMINEE,
  rightCandidateId: EMC_VICTOR_RESIDENCE,
  score: 0.51,
  comparisonEvidence: [
    {
      feature: "NAME",
      leftValue: "V. Aldridge",
      rightValue: "victor-aldridge",
      relation: "INITIAL_MATCH",
      weight: 0.42,
      reason: "Surname + initial agree between the filing line and the Victor mention.",
    },
    {
      feature: "ADDRESS",
      leftValue: "14 rue de la paix paris",
      rightValue: "8 rue des capucines lyon",
      relation: "DIFFERENT",
      weight: 0.1,
      reason:
        "Both candidates carry a residential address and they DIFFER (ND-118 shared line vs CC-882 cross-check). Genuine contradiction — grounded in OBS_9.",
    },
    {
      feature: "TYPE",
      leftValue: "person",
      rightValue: "person",
      relation: "TYPE_COMPATIBLE",
      weight: 0.12,
      reason: "Both mentions are typed PERSON.",
    },
    {
      feature: "UUID",
      leftValue: "ABSENT",
      rightValue: "ABSENT",
      relation: "BOTH_ABSENT",
      weight: 0,
      reason:
        "Neither candidate carries a government UUID. ABSENT ≠ DIFFERENT — contributes no contradiction.",
    },
  ],
  supportingObservationIds: [OBS_8],
  contradictingObservationIds: [OBS_9],
  comparisonStatus: "COMPARED_AND_UNRESOLVED",
  status: "UNRESOLVED",
  scoreModelVersion: "indago:resolution-score:v1",
};

const hypothesis = {
  id: HYP_RES_1,
  caseId: CASE_ID,
  investigationId: INVESTIGATION_ID,
  candidatePairId: PAIR_RES_1,
  supportingCandidateIds: [EMC_NOMINEE, EMC_VICTOR_RESIDENCE],
  comparisonStatus: "COMPARED_AND_UNRESOLVED",
  score: 0.51,
  scoreModelVersion: "indago:resolution-score:v1",
  supportingObservationIds: [OBS_8],
  contradictingObservationIds: [OBS_9],
  status: "UNRESOLVED",
  provenance: { sourceId: SRC_REGISTRY, extractor: "eresolve.comparison.v1" },
  createdAt: obs("2024-06-25"),
  updatedAt: obs("2024-06-25"),
};

/** Canonical parsed entity mention candidates. */
export const operationFinancialShadowCandidates = [
  EntityMentionCandidateSchema.parse(c1),
  EntityMentionCandidateSchema.parse(c2),
  EntityMentionCandidateSchema.parse(c3),
];

/** Canonical parsed candidate pair. */
export const operationFinancialShadowCandidatePairs = [
  CandidatePairSchema.parse(pair),
];

/** Canonical parsed engine comparison output. */
export const operationFinancialShadowResolutions = [
  CandidateResolutionSchema.parse(resolution),
];

/** Canonical parsed entity hypothesis (lifecycle state owner). */
export const operationFinancialShadowEntityHypotheses = [
  EntityHypothesisSchema.parse(hypothesis),
];

/**
 * The canonical entity the RIGHT candidate is currently linked to. The LEFT
 * candidate (nominee) intentionally has NO link — that absence is the
 * ambiguity (no canonical Entity is created for an unresolved identity).
 */
export const ENTITY_LINK_BY_CANDIDATE: Record<string, string> = {
  [EMC_VICTOR_RESIDENCE]: ENT_VICTOR,
  [EMC_VICTOR_SURVEILLANCE]: ENT_VICTOR,
};