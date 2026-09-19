import type { GapType } from "@indago/contracts";

type GapClassificationType = 
  | "MISSING_INVESTIGATION" 
  | "MISSING_DATA" 
  | "MISSING_COMPARISON" 
  | "INFRASTRUCTURE_GAP" 
  | "CONCEALMENT_CONSISTENT_PATTERN";

export const GAP_TYPE_BY_CLASSIFICATION: Record<GapClassificationType, GapType> = {
  MISSING_DATA: "MISSING_EVIDENCE",
  MISSING_INVESTIGATION: "KNOWLEDGE_GAP",
  MISSING_COMPARISON: "KNOWLEDGE_GAP",
  INFRASTRUCTURE_GAP: "OTHER",
  CONCEALMENT_CONSISTENT_PATTERN: "OTHER",
};

/**
 * Maps Mayur's PR14 structural classification into the broad domain GapType.
 * Includes the v1 fallback mapping for when PR14 end-to-end wiring isn't available.
 */
export function mapGapClassificationToGapType(
  classificationType: string | null | undefined,
  fallbackHoleType: string
): GapType {
  // 1. Use the PR14 classification if available
  if (classificationType && classificationType in GAP_TYPE_BY_CLASSIFICATION) {
    return GAP_TYPE_BY_CLASSIFICATION[classificationType as GapClassificationType];
  }

  // 2. V1 Fallback mapping based on the raw structural hole type
  switch (fallbackHoleType) {
    case "MISSING_EDGE":
    case "TEMPORAL_GAP":
    case "BROKEN_CHAIN":
    case "MISSING_PATH":
      return "KNOWLEDGE_GAP"; // Spec says MISSING_INVESTIGATION, which maps to KNOWLEDGE_GAP
    case "ISOLATED_NODE":
      return "MISSING_EVIDENCE"; // Spec says MISSING_DATA, which maps to MISSING_EVIDENCE
    case "COMMUNITY_BOUNDARY":
      return "KNOWLEDGE_GAP"; // Spec says MISSING_COMPARISON, which maps to KNOWLEDGE_GAP
    default:
      return 'OTHER';
  }
}