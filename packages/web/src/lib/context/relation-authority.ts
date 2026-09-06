// ============================================================================
// PR-8 — Relation Authority (pure, provider-agnostic)
//
// The set of deliberate analyst mutations a relation hypothesis supports,
// aligned to the DURABLE relation lifecycle documented by
// @indago/contracts RelationStatusSchema:
//
//   PROPOSED → ACCEPTED   (accept — endorse the hypothesis)
//   PROPOSED → REJECTED   (reject — dismiss the hypothesis)
//   ACCEPTED | REJECTED → REVERSED   (reverse — repeal a prior decision)
//
// REVERSED is lifecycle reversal: it does NOT erase the hypothesis. It changes
// the standing and creates audit history. REVERSED ≠ DELETED.
//
// This module is PURE: no providers, no Demo/Live seams, no fixtures, no UI.
// It answers three questions only:
//   1. Does this data mode expose relation authority at all? (gate)
//   2. May action X legally mutate status S? (transition legality)
//   3. What status should the provider's returned mutation carry? (expectation)
// ============================================================================

import type { RelationHypothesis, RelationStatus } from "@indago/contracts";

export type RelationAuthorityAction = "accept" | "reject" | "reverse";

/** The URL param-free command request sent to the provider seam. */
export interface RelationAuthorityTarget {
  readonly action: RelationAuthorityAction;
  readonly relationHypothesisId: string;
  readonly reason?: string;
}

export const RELATION_AUTHORITY_ACTIONS: readonly RelationAuthorityAction[] = [
  "accept",
  "reject",
  "reverse",
];

export const RELATION_AUTHORITY_ACTION_LABEL: Record<RelationAuthorityAction, string> = {
  accept: "Accept",
  reject: "Reject",
  reverse: "Reverse",
};

export const RELATION_AUTHORITY_ACTION_HINT: Record<RelationAuthorityAction, string> = {
  accept: "Endorse the relation hypothesis",
  reject: "Dismiss the relation hypothesis",
  reverse: "Repeal a prior decision",
};

/** Presentational status labels (stable, testable). */
export const RELATION_STATUS_LABEL: Record<RelationStatus, string> = {
  PROPOSED: "Proposed",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  REVERSED: "Reversed",
};

/**
 * Which lifecycle statuses each authority action may legally mutate. This is
 * the same transition table the platform reverse/accept/reject routes enforce
 * and the demo provider mirrors (defense in depth lives in the provider).
 */
export const RELATION_AUTHORITY_LEGAL_FROM: Record<
  RelationAuthorityAction,
  ReadonlySet<RelationStatus>
> = {
  accept: new Set(["PROPOSED"]),
  reject: new Set(["PROPOSED"]),
  reverse: new Set(["ACCEPTED", "REJECTED"]),
};

export function relationAuthorityAllows(
  action: RelationAuthorityAction,
  status: RelationStatus,
): boolean {
  return RELATION_AUTHORITY_LEGAL_FROM[action].has(status);
}

/** The status a successful mutation must carry (used to detect a stale
 *  concurrent change — the "relation changed since it was loaded" case). */
export function relationAuthorityExpectedStatus(
  action: RelationAuthorityAction,
): RelationStatus {
  switch (action) {
    case "accept":
      return "ACCEPTED";
    case "reject":
      return "REJECTED";
    case "reverse":
      return "REVERSED";
  }
}

export interface RelationAuthorityGate {
  readonly available: boolean;
  /** Honest reason when the gate is closed (never a generic stub message). */
  readonly unavailableReason?: string;
}

/**
 * Whether the current data mode can drive the relation-authority workflow.
 * Live is typed-unsupported on the web provider seam (capability table:
 * relations = demo only), so the authority surface must NOT fake itself into
 * live — it reports an honest unavailable state there.
 */
export function relationAuthorityAvailable(mode: "demo" | "live"): RelationAuthorityGate {
  if (mode === "live") {
    return {
      available: false,
      unavailableReason:
        "Relation authority is not available in live mode (typed unsupported on this provider seam).",
    };
  }
  return { available: true, unavailableReason: undefined };
}

/** Build the mutation target; rejects illegal transitions without a provider
 *  round-trip so the panel can disable buttons honestly from the model. */
export function relationAuthorityTarget(
  action: RelationAuthorityAction,
  relation: RelationHypothesis,
  reason?: string,
): RelationAuthorityTarget {
  if (!relationAuthorityAllows(action, relation.status)) {
    throw new Error(
      `Relation ${relation.id} (${relation.status}) does not support the "${action}" authority action.`,
    );
  }
  return {
    action,
    relationHypothesisId: relation.id,
    ...(reason && reason.trim() ? { reason: reason.trim() } : {}),
  };
}