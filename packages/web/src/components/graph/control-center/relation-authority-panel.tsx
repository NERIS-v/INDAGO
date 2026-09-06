"use client";

// ============================================================================
// PR-8 — Relation Authority Panel
//
// The deliberate-analyst command surface for a selected relation hypothesis.
// Rendered in the contextual panel footer slot (graph-context mode) only; the
// object OperationalRail "Challenge" command is the other entry to the same
// workflow (one model — relation-authority.ts).
//
// Behaviour contract:
//   - Accept (PROPOSED only) executes immediately.
//   - Reject / Reverse require an inline two-step confirmation (destructive-ish
//     decisions) with an optional reason.
//   - Every mutation goes through the provider seam (`onMutate`); the panel
//     NEVER writes state directly. Live mode renders an honest unsupported
//     state (typed-unsupported on the web seam).
//   - After success the returned relation is verified against the expected
//     lifecycle target; a mismatch surfaces the stale-conflict note instead of
//     silently claiming the mutation landed.
//   - Provider failures surface verbatim (ProviderError messages) — never
//     swallowed into a generic toast.
// ============================================================================

import { useState } from "react";
import type { RelationHypothesis } from "@indago/contracts";
import type {
  RelationAuthorityAction,
  RelationAuthorityGate,
} from "@/lib/context/relation-authority";
import {
  RELATION_AUTHORITY_ACTIONS,
  RELATION_AUTHORITY_ACTION_HINT,
  RELATION_AUTHORITY_ACTION_LABEL,
  RELATION_STATUS_LABEL,
  relationAuthorityAllows,
  relationAuthorityExpectedStatus,
} from "@/lib/context/relation-authority";

interface RelationAuthorityPanelProps {
  /** The authoritative current relation hypothesis (from resolved context). */
  readonly relation: RelationHypothesis;
  /** Whether the current data mode exposes the authority workflow at all. */
  readonly gate: RelationAuthorityGate;
  /** The provider-backed mutation entry point (footer owns the call + refresh). */
  readonly onMutate: (
    action: RelationAuthorityAction,
    reason?: string,
  ) => Promise<RelationHypothesis>;
}

export function RelationAuthorityPanel({
  relation,
  gate,
  onMutate,
}: RelationAuthorityPanelProps) {
  const [confirming, setConfirming] = useState<RelationAuthorityAction | null>(null);
  const [busy, setBusy] = useState<RelationAuthorityAction | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<RelationAuthorityAction | null>(null);

  if (!gate.available) {
    return (
      <div
        data-testid="relation-authority"
        data-authority-state="unsupported"
        className="flex flex-col gap-1"
      >
        <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
          Relation authority
        </p>
        <p className="type-caption" data-testid="relation-authority-unavailable">
          {gate.unavailableReason ?? "Relation authority is unavailable on this provider seam."}
        </p>
      </div>
    );
  }

  const legal = RELATION_AUTHORITY_ACTIONS.filter((a) => relationAuthorityAllows(a, relation.status));
  const terminal = legal.length === 0;

  const run = async (action: RelationAuthorityAction) => {
    setError(null);
    setStale(null);
    try {
      const result = await onMutate(action, reason.trim() || undefined);
      const expected = relationAuthorityExpectedStatus(action);
      if (result.status !== expected) {
        setStale(
          `Relation changed since it was loaded: it is now ${RELATION_STATUS_LABEL[result.status]}, not ${RELATION_STATUS_LABEL[expected]}.`,
        );
      } else {
        setLastAction(action);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Relation authority mutation failed.");
    } finally {
      setConfirming(null);
      setBusy(null);
      setReason("");
    }
  };

  const handleClick = (action: RelationAuthorityAction) => {
    if (busy) return;
    if (action === "accept" || confirming === action) {
      setBusy(action);
      void run(action);
    } else {
      setConfirming(action);
      setLastAction(null);
    }
  };

  const authorityState = busy
    ? "mutating"
    : stale
      ? "stale"
      : error
        ? "error"
        : confirming
          ? "confirming"
          : "ready";

  return (
    <section
      data-testid="relation-authority"
      data-authority-state={authorityState}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
          Relation authority
        </span>
        <span
          className="status-tag"
          data-testid="relation-authority-status"
        >
          {RELATION_STATUS_LABEL[relation.status]}
        </span>
      </div>

      <p className="truncate font-mono text-[10px] uppercase tracking-widest text-semantic-foreground-faint" data-testid="relation-authority-meta">
        {relation.relationType} · support {relation.support.toFixed(2)}
      </p>

      {terminal && (
        <p className="type-caption" data-testid="relation-authority-terminal">
          This relation hypothesis is terminal ({RELATION_STATUS_LABEL[relation.status]}).
          No further authority decisions are available.
        </p>
      )}

      {legal.map((action) => {
        const destructive = action !== "accept";
        const isConfirming = confirming === action;
        return (
          <div key={action} className="flex flex-col gap-1">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => handleClick(action)}
              aria-label={`${action === "accept" ? RELATION_AUTHORITY_ACTION_LABEL[action] : confirming === action ? `Confirm ${RELATION_AUTHORITY_ACTION_LABEL[action].toLowerCase()}` : RELATION_AUTHORITY_ACTION_LABEL[action]} relation ${relation.id}`}
              data-testid={`relation-authority-${action}`}
              className={`w-full rounded-md px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus disabled:opacity-50 ${
                destructive
                  ? isConfirming
                    ? "bg-semantic-contradiction-subtle hover:bg-semantic-contradiction/25"
                    : "hover:bg-semantic-contradiction-subtle"
                  : "hover:bg-semantic-surface-elevated"
              }`}
            >
              <span
                className={`block text-[11px] font-medium uppercase tracking-wider ${
                  destructive && isConfirming
                    ? "text-semantic-contradiction"
                    : "text-semantic-foreground"
                }`}
              >
                {isConfirming
                  ? `Confirm ${RELATION_AUTHORITY_ACTION_LABEL[action]}`
                  : RELATION_AUTHORITY_ACTION_LABEL[action]}
              </span>
              <span className="block truncate text-[10px] font-mono uppercase tracking-widest text-semantic-foreground-faint">
                {RELATION_AUTHORITY_ACTION_HINT[action]}
              </span>
            </button>
            {isConfirming && (
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase tracking-widest text-semantic-foreground-faint">
                  Reason (optional)
                </span>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={`Why ${action}?`}
                  aria-label="Optional reason for this authority decision"
                  data-testid="relation-authority-reason"
                  className="rounded-md border border-semantic-border bg-semantic-surface-elevated px-2 py-1 text-[12px] text-semantic-foreground placeholder:text-semantic-foreground-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus"
                />
              </label>
            )}
          </div>
        );
      })}

      {busy && (
        <p className="type-caption" data-testid="relation-authority-busy">
          Applying {RELATION_AUTHORITY_ACTION_LABEL[busy].toLowerCase()}…
        </p>
      )}

      {lastAction && !stale && !error && (
        <p className="type-caption text-semantic-foreground" data-testid="relation-authority-success">
          {RELATION_AUTHORITY_ACTION_LABEL[lastAction]} recorded.
        </p>
      )}

      {stale && (
        <p
          className="type-caption rounded-md border border-warning/30 bg-warning/10 px-2 py-1.5 text-semantic-foreground-muted"
          data-testid="relation-authority-stale"
        >
          {stale}
        </p>
      )}

      {error && (
        <p
          className="type-caption rounded-md border border-semantic-contradiction/30 bg-semantic-contradiction-subtle px-2 py-1.5 text-semantic-foreground-muted"
          data-testid="relation-authority-error"
        >
          {error}
        </p>
      )}
    </section>
  );
}