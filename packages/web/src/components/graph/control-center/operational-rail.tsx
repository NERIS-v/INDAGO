"use client";

// ============================================================================
// PR-2 Zone 2 — Left Operational Rail  (PR-3: context-aware; PR-4: command-driven)
//
// Answers "what can I actually do about it?" from the current investigative
// context. Three conceptual groups (Graph / Investigate / Act-Verify) render
// from the PR-4 action model (operational-actions.ts) — there is NO scattered
// `selectedEntityId` / `context.kind === ...` branching anywhere in this file.
//
// Every slot derives enabled/disabled/implemented/kind/reason from
// getOperationalRailStates(context, capabilities, mode), which is built on the
// PR-3 capability seam + a single IMPLEMENTED registry. Commands with no real
// frontend seam render DISABLED with an honest reason — never fake behavior.
//
// Wired commands reuse existing implementations:
//   - Focus        -> onFocus() (shell centers the deterministic graph target)
//   - Layers       -> graph legend surface (GraphPanel)
//   - Filter       -> PR-4 inline readability filter (min support / contradicted)
//   - Discover     -> DiscoveryPanel overlay (GraphPanel)
//   - Detect Gaps  -> investigative gaps overlay (GraphPanel)
//   - Cross-Case   -> provider-driven overlay picker (CrossCaseProvider)
//   - Add Evidence -> EvidenceIntake modal (GraphPanel)
//
// Command kinds drive presentation: only `surface-toggle` commands render
// aria-pressed; immediate actions (Focus) never remain toggled.
//
// Consumes only the shell-owned actions object, the capability mapping, and
// the wrapper presenter — never imports Demo/Live providers or fixtures.
// ============================================================================

import { useEffect, useMemo, useRef } from "react";
import { PanelToggle } from "./panel-toggle";
import type { GraphControlCenterActions } from "@/lib/layout/control-center";
import type { ControlCenterSurfaceKey } from "@/lib/layout/control-center";
import type { ForeignCaseOverlay } from "@/lib/providers/types";
import type { ContextualCapabilities } from "@/lib/context/investigative-context";
import type { InvestigativeContext } from "@/lib/context/investigative-context";
import {
  OPERATIONAL_ACTION_GROUPS,
  OPERATIONAL_ACTION_META,
  getOperationalRailStates,
} from "@/lib/context/operational-actions";
import type { OperationalAction, OperationalActionKind } from "@/lib/context/operational-actions";
import type { GraphFilterState } from "@/lib/graph/graph-filter";
import { MIN_SUPPORT_MAX, MIN_SUPPORT_STEP, graphFilterIsActive } from "@/lib/graph/graph-filter";

interface OperationalRailProps {
  open: boolean;
  onToggle: () => void;
  actions: GraphControlCenterActions;
  onActionToggle: (key: ControlCenterSurfaceKey) => void;
  onActionsChange: (patch: Partial<GraphControlCenterActions>) => void;
  foreignOverlays: ForeignCaseOverlay[];
  /** PR-3: centralized capability mapping for the current selection. */
  capabilities: ContextualCapabilities;
  /** PR-3: the canonical context (null = nothing selected). */
  context: InvestigativeContext | null;
  /** Effective (non-auto) data mode — for honest capability projection. */
  mode: "demo" | "live";
  /** PR-4: active graph readability filter. */
  filter: GraphFilterState;
  onFilterChange: (filter: GraphFilterState) => void;
  /** Invoked when Focus is enabled and clicked (selection already set). */
  onFocus: () => void;
  /** PR-8: invoked when Challenge is enabled and clicked (relation authority
   *  entry — the shell reveals the relation context + authority panel). */
  onChallenge?: () => void;
}

interface RailSlotProps {
  label: string;
  hint: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** Honest disabled explanation; enabled rows fall back to `hint`. */
  reason?: string;
  /** Conceptual action availability projected for tests/a11y. */
  dataCapability?: boolean;
  dataSlot?: string;
  /** Set ONLY for surface-toggle commands (immediate actions omit it). */
  ariaPressed?: boolean;
}

function RailSlot({
  label,
  hint,
  active = false,
  disabled = false,
  onClick,
  reason,
  dataCapability,
  dataSlot,
  ariaPressed,
}: RailSlotProps) {
  const base =
    "w-full rounded-md px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus";
  const color = disabled
    ? "opacity-50"
    : active
      ? "bg-semantic-surface-soft text-semantic-foreground"
      : "text-semantic-foreground-muted hover:bg-semantic-surface-elevated hover:text-semantic-foreground";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={ariaPressed === undefined ? undefined : ariaPressed}
      title={disabled ? (reason ?? hint) : hint}
      data-slot={dataSlot}
      data-capability={dataCapability === undefined ? undefined : String(dataCapability)}
      className={`${base} ${color}`}
    >
      <span className="flex items-center gap-1.5">
        <span className="block text-[11px] font-medium uppercase tracking-wider">{label}</span>
        {active && (
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-accent-blue shadow-[0_0_6px_var(--color-accent-blue)]"
          />
        )}
      </span>
      <span className="block truncate text-[10px] font-mono uppercase tracking-widest text-semantic-foreground-faint">
        {hint}
      </span>
    </button>
  );
}

function RailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section data-rail-group={title} aria-label={title} className="flex flex-col gap-1">
      <h3 className="mb-1 px-1 text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Which commands are surface toggles (render active state + aria-pressed). */
const TOGGLE_KIND: ReadonlySet<OperationalActionKind> = new Set<OperationalActionKind>([
  "surface-toggle",
]);

/** Surface open-state lookup — only toggle commands have one. */
function surfaceActiveFor(action: OperationalAction, actions: GraphControlCenterActions): boolean {
  switch (action) {
    case "layers":
      return actions.legendOpen;
    case "filter":
      return actions.filterOpen;
    case "discover":
      return actions.discoveryOpen;
    case "detect-gaps":
      return actions.gapsOpen;
    case "cross-case":
      return actions.crossCaseOpen || actions.activeForeignCaseId !== null;
    case "add-evidence":
      return actions.uploadOpen;
    default:
      return false;
  }
}

/**
 * Conceptual capability flag projected for a11y/tests — mirrors PR-3's slot
 * contract (data-capability reflects what the SELECTION supports, independent
 * of whether the command is wired). Global commands expose no capability flag.
 */
function dataCapabilityFor(
  action: OperationalAction,
  capabilities: ContextualCapabilities,
  hasContext: boolean,
): boolean | undefined {
  switch (action) {
    case "focus":
      return capabilities.canFocus;
    case "expand":
    case "find-connections":
      return hasContext && capabilities.canExpand;
    case "trace-evidence":
      return hasContext && capabilities.canTraceEvidence;
    case "review":
      return hasContext && capabilities.canReview;
    case "resolve":
      return hasContext && capabilities.canResolve;
    case "challenge":
      return hasContext && capabilities.canChallenge;
    default:
      return undefined;
  }
}

/** Dispatch an enabled command to its existing implementation seam. */
function dispatchAction(
  action: OperationalAction,
  onActionToggle: (key: ControlCenterSurfaceKey) => void,
  onFocus: () => void,
  onChallenge?: () => void,
): void {
  switch (action) {
    case "focus":
      onFocus();
      break;
    case "challenge":
      onChallenge?.();
      break;
    case "layers":
      onActionToggle("legendOpen");
      break;
    case "filter":
      onActionToggle("filterOpen");
      break;
    case "discover":
      onActionToggle("discoveryOpen");
      break;
    case "detect-gaps":
      onActionToggle("gapsOpen");
      break;
    case "cross-case":
      onActionToggle("crossCaseOpen");
      break;
    case "add-evidence":
      onActionToggle("uploadOpen");
      break;
    default:
      // Unimplemented commands never dispatch (their slots are disabled).
      break;
  }
}

export function OperationalRail({
  open,
  onToggle,
  actions,
  onActionToggle,
  onActionsChange,
  foreignOverlays,
  capabilities,
  context,
  mode,
  filter,
  onFilterChange,
  onFocus,
  onChallenge,
}: OperationalRailProps) {
  const states = useMemo(
    () => getOperationalRailStates(context, capabilities, { mode }),
    [context, capabilities, mode],
  );

  const filterActive = graphFilterIsActive(filter);
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (actions.filterOpen) filterInputRef.current?.focus();
  }, [actions.filterOpen]);

  const hasContext = context !== null;

  return (
    <aside
      id="operational-rail"
      aria-label="Graph operations"
      className="cc-panel flex h-full w-full min-h-0 flex-col overflow-hidden"
    >
      <header className="cc-panel-header flex shrink-0 items-center justify-between px-3 py-2.5">
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
          Operations
        </span>
        <PanelToggle
          open={open}
          onToggle={onToggle}
          label="Open left operational rail"
          expandedActionLabel="Collapse left operational rail"
          controlsId="operational-rail"
          side="left"
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-3">
        {OPERATIONAL_ACTION_GROUPS.map((group) => (
          <RailGroup key={group.title} title={group.title}>
            {group.actions.map((action) => {
              const state = states[action];
              const meta = OPERATIONAL_ACTION_META[action];
              const active = surfaceActiveFor(action, actions);
              const isToggle = TOGGLE_KIND.has(state.kind);
              const capability = dataCapabilityFor(action, capabilities, hasContext);
              return (
                <div key={action} className="flex flex-col">
                  <RailSlot
                    label={meta.label}
                    hint={meta.hint}
                    active={state.enabled && active}
                    disabled={!state.enabled}
                    reason={state.reason}
                    onClick={state.enabled ? () => dispatchAction(action, onActionToggle, onFocus, onChallenge) : undefined}
                    dataCapability={capability}
                    dataSlot={action}
                    ariaPressed={isToggle && state.enabled ? active : undefined}
                  />
                  {action === "filter" && actions.filterOpen && (
                    <div className="ml-2 mt-1 flex flex-col gap-2.5 border-l border-semantic-border-subtle p-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-semantic-foreground-faint">
                          Min support
                        </span>
                        <input
                          ref={filterInputRef}
                          type="range"
                          min={0}
                          max={MIN_SUPPORT_MAX}
                          step={MIN_SUPPORT_STEP}
                          value={filter.minSupport}
                          onChange={(e) =>
                            onFilterChange({ ...filter, minSupport: Number(e.target.value) })
                          }
                          aria-label="Minimum relation support threshold"
                          className="accent-accent-blue"
                        />
                        <span className="text-[10px] font-mono text-semantic-foreground-faint">
                          {filter.minSupport.toFixed(2)}
                          {filterActive ? "" : " — showing everything"}
                        </span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={filter.hideContradicted}
                          onChange={(e) =>
                            onFilterChange({ ...filter, hideContradicted: e.target.checked })
                          }
                          aria-label="Hide contradicted relations"
                          className="accent-accent-blue"
                        />
                        <span className="text-[10px] font-mono uppercase tracking-widest text-semantic-foreground-faint">
                          Hide contradicted
                        </span>
                      </label>
                      <p className="text-[10px] font-mono text-semantic-foreground-faint">
                        Filters relations rendered on the graph.
                      </p>
                    </div>
                  )}
                  {action === "cross-case" && actions.crossCaseOpen && (
                    <div className="ml-2 mt-1 flex flex-col gap-1 border-l border-semantic-border-subtle pl-2">
                      {foreignOverlays.length > 0 ? (
                        foreignOverlays.map((overlay) => {
                          const isActive = actions.activeForeignCaseId === overlay.ref;
                          return (
                            <button
                              key={overlay.ref}
                              type="button"
                              aria-pressed={isActive}
                              onClick={() =>
                                onActionsChange({
                                  activeForeignCaseId: isActive ? null : overlay.ref,
                                })
                              }
                              className={`w-full truncate rounded-md px-2.5 py-1 text-left text-[10px] font-mono uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus ${
                                isActive
                                  ? "bg-semantic-foreign/15 text-semantic-foreign"
                                  : "text-semantic-foreground-faint hover:bg-semantic-surface-elevated hover:text-semantic-foreground"
                              }`}
                            >
                              Match: {overlay.title}
                            </button>
                          );
                        })
                      ) : (
                        <p className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-semantic-foreground-faint">
                          No cross-case matches available.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </RailGroup>
        ))}
      </div>
    </aside>
  );
}