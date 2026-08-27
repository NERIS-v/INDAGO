// ============================================================================
// Operation Financial Shadow — Review Task fixtures (canonical shape)
// ============================================================================

import { ReviewTaskSchema } from "@indago/contracts";
import type { ReviewTask } from "@indago/contracts";
import {
  REVIEW_1,
  REVIEW_2,
  INVESTIGATION_ID,
  ENT_VICTOR,
  ENT_SHELL_ONE,
  EVID_REGISTRY,
  HYP_1,
  HYP_2,
} from "./lookup";
import { obs } from "./times";

const rv1: ReviewTask = {
  id: REVIEW_1,
  investigationId: INVESTIGATION_ID,
  type: "ENTITY_RESOLUTION_REVIEW",
  status: "IN_PROGRESS",
  title: "Review nominee director beneficial ownership",
  description:
    "Confirm the registry's nominated director resolves to Victor Aldridge as beneficial owner.",
  assignedTo: "analyst.entity@indago.dev",
  relatedEntityIds: [ENT_SHELL_ONE, ENT_VICTOR],
  relatedEvidenceIds: [EVID_REGISTRY],
  relatedHypothesisIds: [HYP_1],
  reviewComments: [
    {
      author: "analyst.entity@indago.dev",
      content:
        "Registry filing lists a nominee; recommending manual verification before resolution.",
      timestamp: obs("2024-06-26", "14:00"),
      decision: "NEEDS_MORE_INFO",
    },
  ],
  createdAt: obs("2024-06-20"),
  updatedAt: obs("2024-06-26"),
};

const rv2: ReviewTask = {
  id: REVIEW_2,
  investigationId: INVESTIGATION_ID,
  type: "HYPOTHESIS_REVIEW",
  status: "PENDING",
  title: "Review shell-network hypothesis confidence",
  description:
    "Weight the corroboration for the shell-network laundering hypothesis before deciding whether to promote.",
  relatedHypothesisIds: [HYP_1, HYP_2],
  createdAt: obs("2024-06-28"),
  updatedAt: obs("2024-06-28"),
};

/** Canonical parsed review tasks. */
export const operationFinancialShadowReviewTasks: ReviewTask[] = [
  ReviewTaskSchema.parse(rv1),
  ReviewTaskSchema.parse(rv2),
];
