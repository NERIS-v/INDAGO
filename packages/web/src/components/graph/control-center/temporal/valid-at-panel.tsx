"use client";

// ============================================================================
// PR-22 — Temporal · VALID-AT projection control
//
// An honest backend projection surface that lives alongside the VERSIONS tab:
// the analyst requests a graph projection valid at a chosen domain instant and
// the panel calls the provider's getValidAt seam (→ GET /cases/:caseId/graph/
// valid-at?at=<ISO>). The returned ProjectedGraph is shown exactly as the
// backend returned it (node/edge counts + truncation), clearly labelled as a
// BACKEND valid-at projection — never a local filter of the current graph.
//
// Honesty rules (see lib/context/temporal-valid-at.ts):
//   - An active valid-at request never falls back to the current/version graph.
//   - A live request failure surfaces the typed provider/API error.
//   - as-of is a deferred 501 capability and is never offered.
//
// The surface is capability-gated: when the provider exposes no getValidAt seam
// it renders an honest unavailable note, and it never fabricates a projection.
// ============================================================================

import { useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { toProviderError } from "@/lib/providers";
import {
  AS_OF_UNSUPPORTED,
  deriveValidAtViewState,
  validAtLabel,
  type ValidAtSelection,
} from "@/lib/context/temporal-valid-at";

interface ValidAtPanelProps {
  /** Optional lifted valid-at selection (shell-owned). Absent → the panel keeps
   *  its own local copy so standalone/test renders stay stable. */
  readonly selection?: ValidAtSelection;
  readonly onSelectionChange?: (selection: ValidAtSelection) => void;
}

export function ValidAtPanel({
  selection: selectionProp,
  onSelectionChange,
}: ValidAtPanelProps) {
  const workspace = useWorkspace();
  const [localSelection, setLocalSelection] = useState<ValidAtSelection>({
    mode: "current",
    at: null,
  });
  const [atInput, setAtInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    at: string;
    nodeCount: number;
    edgeCount: number;
  } | null>(null);

  const selection = selectionProp ?? localSelection;

  const commitSelection = (next: ValidAtSelection) => {
    if (onSelectionChange) onSelectionChange(next);
    else setLocalSelection(next);
  };

  const available = typeof workspace.graph.getValidAt === "function";

  const view = deriveValidAtViewState({
    selection,
    available,
    pending,
    resolved: result !== null,
    error,
  });

  const request = async () => {
    const at = atInput.trim();
    if (!at) return;
    if (!workspace.graph.getValidAt) {
      setError("Valid-at projection is not available on this provider seam.");
      return;
    }
    setPending(true);
    setError(null);
    setResult(null);
    commitSelection({ mode: "valid-at", at });
    try {
      const response = await workspace.graph.getValidAt(workspace.caseId, at);
      setResult({
        at: response.at,
        nodeCount: response.nodeCount,
        edgeCount: response.edgeCount,
      });
    } catch (err) {
      setError(toProviderError(err).message);
    } finally {
      setPending(false);
    }
  };

  const returnCurrent = () => {
    commitSelection({ mode: "current", at: null });
    setResult(null);
    setError(null);
    setAtInput("");
  };

  return (
    <div data-temporal-valid-at className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-surface-700">
          Valid-at projection
        </h3>
      </div>

      <p className="type-caption text-surface-500">
        Request the authoritative graph projection valid at a domain instant —
        a backend projection, not a client-side filter.
      </p>

      {!available && (
        <p
          data-testid="valid-at-unavailable"
          className="type-caption rounded-lg border border-surface-200/60 bg-surface-0 px-3 py-2 text-surface-500"
        >
          Valid-at projection is not available on this provider seam — the
          current graph is never shown on its behalf.
        </p>
      )}

      {available && view.kind === "idle" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="datetime-local"
              data-testid="valid-at-input"
              value={atInput}
              onChange={(e) => setAtInput(e.target.value)}
              className="w-full rounded-lg border border-surface-200/60 bg-surface-0 px-3 py-1.5 text-[12px] text-surface-800 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="button"
              data-testid="valid-at-request"
              disabled={!atInput.trim() || pending}
              onClick={() => void request()}
              className="shrink-0 rounded-lg border border-brand-500/40 bg-brand-50 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-brand-700 disabled:opacity-50"
            >
              Project
            </button>
          </div>
          <p className="px-1 font-mono text-[9px] uppercase tracking-widest text-surface-400">
            {AS_OF_UNSUPPORTED}
          </p>
        </div>
      )}

      {view.kind === "loading" && (
        <p data-testid="valid-at-loading" className="type-caption text-surface-400">
          Requesting valid-at projection…
        </p>
      )}

      {view.kind === "error" && (
        <div className="space-y-2">
          <p
            data-testid="valid-at-error"
            className="type-caption rounded-lg border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-amber-800"
          >
            {error}
          </p>
          <button
            type="button"
            data-testid="valid-at-return-current"
            onClick={returnCurrent}
            className="rounded-lg border border-brand-500/40 bg-brand-50 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-brand-700"
          >
            Return to current
          </button>
        </div>
      )}

      {view.kind === "valid-at" && result && (
        <div className="space-y-2">
          <div
            data-testid="valid-at-summary"
            className="rounded-lg border border-brand-300/60 bg-brand-50/60 px-3 py-2"
          >
            <p className="text-sm font-medium text-surface-800">
              {validAtLabel(result.at)}
            </p>
            <p className="text-[9px] font-mono uppercase tracking-widest text-surface-500">
              Backend projection · {result.nodeCount} nodes · {result.edgeCount} edges
            </p>
          </div>
          <button
            type="button"
            data-testid="valid-at-return-current"
            onClick={returnCurrent}
            className="rounded-lg border border-brand-500/40 bg-brand-50 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-brand-700"
          >
            Return to current
          </button>
        </div>
      )}
    </div>
  );
}

