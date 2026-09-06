// ============================================================================
// F-PR6 — Representation Switcher (Zone 2 view bar)
//
// Switches between the declared Network representations (Network / Pulse /
// Matrix / Adaptive Flow). F-PR16: the switcher is an IN-FLOW control strip of
// the NETWORK VISUALIZATION REGION — it is rendered above Zone 2's content by
// the shell (never absolutely positioned), so it cannot float over Zone 3's
// context panel or over the graph's own top-right chrome (zoom cluster, stat
// chips). The context panel owns its region independently; region separation
// comes from layout ownership, not z-index stacking.
//
// Buttons for representations that are declared but "not-ready" in the
// effective mode are disabled with an explanatory title — honest absence,
// never a fake-enabled control.
// ============================================================================

"use client";

import { networkViewLabel } from "@/lib/network/network-workspace";
import type { NetworkView } from "@/lib/network/network-workspace";
import type { CapabilityStatus } from "@/lib/providers/capabilities";

export const REPRESENTATION_VIEWS: readonly NetworkView[] = [
  "graph",
  "pulse",
  "matrix",
  "flow",
] as const;

/** Child button labels of the NETWORK destination (Graph / Pulse / …). */
const REPRESENTATION_BUTTON_LABELS: Record<NetworkView, string> = {
  graph: "Graph",
  pulse: "Pulse",
  matrix: "Matrix",
  flow: "Flow",
};

interface RepresentationSwitcherProps {
  readonly current: NetworkView;
  readonly onChange: (view: NetworkView) => void;
  /** Capability status per declared view for the effective workspace mode. */
  readonly availability: Partial<Record<NetworkView, CapabilityStatus>>;
}

export function RepresentationSwitcher({
  current,
  onChange,
  availability,
}: RepresentationSwitcherProps) {
  return (
    <div
      data-testid="representation-switcher"
      className="flex items-center gap-2 rounded-lg border border-surface-300/60 bg-surface-50/80 backdrop-blur-md px-2 py-1"
    >
      <span
        aria-hidden
        className="pl-1 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-surface-400"
      >
        Network
      </span>
      {REPRESENTATION_VIEWS.map((view) => {
        const status = availability[view] ?? "not-ready";
        const available = status !== "not-ready";
        const active = view === current;
        const buttonLabel = REPRESENTATION_BUTTON_LABELS[view];
        return (
          <button
            key={view}
            type="button"
            aria-pressed={active}
            disabled={!available}
            onClick={() => onChange(view)}
            title={
              available
                ? buttonLabel
                : `${networkViewLabel(view)} — not ready in this mode`
            }
            className={`rounded-md px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 ring-accent-rose ${
              active
                ? "bg-surface-800 text-surface-0"
                : available
                  ? "text-surface-400 hover:bg-surface-200 hover:text-surface-800"
                  : "cursor-not-allowed text-surface-600/50"
            }`}
          >
            {buttonLabel}
          </button>
        );
      })}
    </div>
  );
}