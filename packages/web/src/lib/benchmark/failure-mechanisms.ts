// ============================================================================
// Failure-mechanism annotations — audit-derived (benchmark/audit/deep-audit.md
// §10) root causes per planted hole. These are ANALYSIS of measured trace data,
// never fabricated metrics. The web surface renders each hole's MEASURED trace
// (region status, candidate counts, qualification reasons) from holes.json and
// attaches the documented mechanism as a labelled annotation. The two layers
// are never mixed.
// ============================================================================

import type { BenchmarkConditionLabel } from "@indago/contracts";

export interface FailureCauseAnnotation {
  readonly earliestLossStage: string;
  readonly mechanism: string;
  readonly llmRecover: "NO" | "N/A";
  readonly semanticRecover: "NO" | "MARGINAL" | "N/A";
  readonly reassessmentRecover: "POSSIBLY" | "UNLIKELY" | "N/A";
}

export interface HoleFailureAnnotation {
  readonly caseKey: string;
  readonly byCondition: Partial<Record<BenchmarkConditionLabel, FailureCauseAnnotation>>;
  readonly note?: string;
}

/**
 * Faithful transcription of audit §10 (failure root cause table). The column
 * values are copied from the audit; the web UI shows them only as annotations
 * attached to the measured trace.
 */
export const HOLE_FAILURE_ANNOTATIONS: readonly HoleFailureAnnotation[] = [
  {
    caseKey: "GAP-01",
    byCondition: {
      CLEAN: {
        earliestLossStage: "— (hit)",
        mechanism: "Qualified r1 (structural 0.7445 / significance 0.7417). Baseline detector + gate works.",
        llmRecover: "N/A",
        semanticRecover: "N/A",
        reassessmentRecover: "N/A",
      },
      NOISY_MISSING: {
        earliestLossStage: "PR5 qualification (candidate exists)",
        mechanism: "Deletions + aliasing drain evidential support; region connectivity drops (~0.8 → ~0.5). Rejected on LOW_STRUCTURAL_SCORE + LOW_SIGNIFICANCE.",
        llmRecover: "NO",
        semanticRecover: "NO",
        reassessmentRecover: "POSSIBLY",
      },
      ADVERSARIAL: {
        earliestLossStage: "PR5 qualification (candidate exists)",
        mechanism: "Same noise path as NOISY: support drained, gates reject the candidate.",
        llmRecover: "NO",
        semanticRecover: "NO",
        reassessmentRecover: "POSSIBLY",
      },
    },
  },
  {
    caseKey: "GAP-02",
    byCondition: {
      CLEAN: {
        earliestLossStage: "— (hit)",
        mechanism: "Hit r2. Robust across shared-id / alias mix.",
        llmRecover: "N/A",
        semanticRecover: "N/A",
        reassessmentRecover: "N/A",
      },
      NOISY_MISSING: {
        earliestLossStage: "— (hit)",
        mechanism: "Hit r2 despite noise.",
        llmRecover: "N/A",
        semanticRecover: "N/A",
        reassessmentRecover: "N/A",
      },
      ADVERSARIAL: {
        earliestLossStage: "— (hit)",
        mechanism: "Hit r1 (structural 0.7675). Highest-scoring arm.",
        llmRecover: "N/A",
        semanticRecover: "N/A",
        reassessmentRecover: "N/A",
      },
    },
  },
  {
    caseKey: "GAP-03",
    byCondition: {
      CLEAN: {
        earliestLossStage: "region / detection → qualification",
        mechanism: "TEMPORAL_GAP raw candidates (1) never clear the 0.70 gates. Documented honest-0 for a single-version corpus.",
        llmRecover: "NO",
        semanticRecover: "NO",
        reassessmentRecover: "UNLIKELY",
      },
      NOISY_MISSING: {
        earliestLossStage: "region / detection → qualification",
        mechanism: "TEMPORAL_GAP raw candidates (3) never clear the 0.70 gates.",
        llmRecover: "NO",
        semanticRecover: "NO",
        reassessmentRecover: "UNLIKELY",
      },
      ADVERSARIAL: {
        earliestLossStage: "region / detection → qualification",
        mechanism: "TEMPORAL_GAP raw candidates (3) never clear the 0.70 gates.",
        llmRecover: "NO",
        semanticRecover: "NO",
        reassessmentRecover: "UNLIKELY",
      },
    },
    note: "Temporal signal never clears the frozen gate; nothing post-PR5 can inject it.",
  },
  {
    caseKey: "GAP-04",
    byCondition: {
      CLEAN: {
        earliestLossStage: "— (hit)",
        mechanism: "Hit r1 (structural 0.7175 / significance 0.7255).",
        llmRecover: "N/A",
        semanticRecover: "N/A",
        reassessmentRecover: "N/A",
      },
      NOISY_MISSING: {
        earliestLossStage: "— (hit)",
        mechanism: "Hit r1 (structural 0.7175 / significance 0.7255).",
        llmRecover: "N/A",
        semanticRecover: "N/A",
        reassessmentRecover: "N/A",
      },
      ADVERSARIAL: {
        earliestLossStage: "PR5 (raw 5 → 0)",
        mechanism: "Shared-id + alias/noise collapse all candidate scores; all 5 rejected by the gates.",
        llmRecover: "NO",
        semanticRecover: "NO",
        reassessmentRecover: "POSSIBLY",
      },
    },
  },
  {
    caseKey: "NBE-01",
    byCondition: {
      CLEAN: {
        earliestLossStage: "region construction (floor / limited)",
        mechanism: "No candidate signal generated inside the region (floor-LIMITED region).",
        llmRecover: "NO",
        semanticRecover: "MARGINAL",
        reassessmentRecover: "POSSIBLY",
      },
      NOISY_MISSING: {
        earliestLossStage: "region construction (floor / limited)",
        mechanism: "No candidate signal generated inside the region.",
        llmRecover: "NO",
        semanticRecover: "MARGINAL",
        reassessmentRecover: "POSSIBLY",
      },
      ADVERSARIAL: {
        earliestLossStage: "region construction (floor / limited)",
        mechanism: "No candidate signal generated inside the region.",
        llmRecover: "NO",
        semanticRecover: "MARGINAL",
        reassessmentRecover: "POSSIBLY",
      },
    },
  },
  {
    caseKey: "NBE-02",
    byCondition: {
      CLEAN: {
        earliestLossStage: "region construction (floor / limited)",
        mechanism: "No candidate signal generated inside the region.",
        llmRecover: "NO",
        semanticRecover: "MARGINAL",
        reassessmentRecover: "POSSIBLY",
      },
      NOISY_MISSING: {
        earliestLossStage: "region construction (floor / limited)",
        mechanism: "No candidate signal generated inside the region.",
        llmRecover: "NO",
        semanticRecover: "MARGINAL",
        reassessmentRecover: "POSSIBLY",
      },
      ADVERSARIAL: {
        earliestLossStage: "region construction (floor / limited)",
        mechanism: "No candidate signal generated inside the region.",
        llmRecover: "NO",
        semanticRecover: "MARGINAL",
        reassessmentRecover: "POSSIBLY",
      },
    },
  },
  {
    caseKey: "SYS-01",
    byCondition: {
      CLEAN: {
        earliestLossStage: "region construction (floor / limited)",
        mechanism: "No candidate signal generated inside an empty floor region.",
        llmRecover: "NO",
        semanticRecover: "MARGINAL",
        reassessmentRecover: "POSSIBLY",
      },
      NOISY_MISSING: {
        earliestLossStage: "region construction (floor / limited)",
        mechanism: "No candidate signal generated inside an empty floor region.",
        llmRecover: "NO",
        semanticRecover: "MARGINAL",
        reassessmentRecover: "POSSIBLY",
      },
      ADVERSARIAL: {
        earliestLossStage: "region construction (floor / limited)",
        mechanism: "No candidate signal generated inside an empty floor region.",
        llmRecover: "NO",
        semanticRecover: "MARGINAL",
        reassessmentRecover: "POSSIBLY",
      },
    },
  },
];

export function findHoleAnnotation(
  caseKey: string,
  condition: BenchmarkConditionLabel,
): FailureCauseAnnotation | null {
  const row = HOLE_FAILURE_ANNOTATIONS.find((h) => h.caseKey === caseKey);
  return row?.byCondition[condition] ?? null;
}