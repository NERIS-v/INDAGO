// ============================================================================
// PR-20 — Review surfaces → ReviewCenter display adapter
//
// Maps canonical reviewable records into the ReviewTaskMock display shape the
// ReviewCenter renders. Two sources:
//   - canonical ReviewTask      (ReviewProvider.listTasks, demo serving)
//   - canonical Lead needing gate review (live REVIEW_REQUIRED run checkpoint;
//     the reviewable queue is the leads still under authority review)
//
// Mapping discipline:
//   - description/context come VERBATIM from the canonical record.
//   - task TYPE is a display fold of the canonical discriminator.
//   - PRIORITY is a deterministic render: ReviewTask has no priority field, so
//     tasks default to a neutral LOW; leads fold their canonical priority.
//   - non-actionable tasks (COMPLETED / ESCALATED / CANCELLED) are filtered by
//     the caller, never fabricated here.
// ============================================================================

import type { ReviewTask, Lead } from "@indago/contracts";
import type { ReviewTaskMock } from "@/components/intel/review-center";

function foldTaskType(type: ReviewTask["type"]): ReviewTaskMock["type"] {
  switch (type) {
    case "EVIDENCE_REVIEW":
    case "GAP_REVIEW":
      return "EVIDENCE_REQUEST";
    case "LEAD_REVIEW":
    case "HYPOTHESIS_REVIEW":
      return "LEAD_PROMOTION";
    case "ENTITY_RESOLUTION_REVIEW":
    case "RELATION_REVIEW":
    case "QUALITY_ASSURANCE":
      return "ENTITY_RESOLUTION";
    default:
      return "ENTITY_RESOLUTION";
  }
}

export function mapReviewTaskToReviewTaskMock(task: ReviewTask): ReviewTaskMock {
  return {
    id: task.id,
    type: foldTaskType(task.type),
    description: task.title,
    context: task.description,
    // REVIEW TASKS CARRY NO PRIORITY — neutral deterministic display fold.
    priority: "LOW",
  };
}

function foldLeadPriority(priority: Lead["priority"]): ReviewTaskMock["priority"] {
  switch (priority) {
    case "CRITICAL":
    case "HIGH":
      return "HIGH";
    case "MEDIUM":
      return "MODERATE";
    default:
      return "LOW";
  }
}

export function mapLeadToReviewTaskMock(lead: Lead): ReviewTaskMock {
  return {
    id: lead.id,
    type: "LEAD_PROMOTION",
    description: lead.title,
    context: lead.description,
    priority: foldLeadPriority(lead.priority),
  };
}

/** Whether a canonical ReviewTask is actionable in the ReviewCenter (maps to a
 *  PENDING display state). */
export function isActionableReviewTask(task: ReviewTask): boolean {
  return task.status === "PENDING" || task.status === "IN_PROGRESS";
}