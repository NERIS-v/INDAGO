// ============================================================================
// PR-4 — Operational Action Model (pure, provider-agnostic)
//
// The left Operational Rail answers "what can I actually do about it?" from the
// current investigative context. PR-3's getContextualCapabilities owns CONCEPTUAL
// eligibility ("the object supports this operation"); this module owns the
// OPERATIONAL projection: whether each command is implemented, whose kind it is
// (immediate / surface-toggle / modal / navigation / mutation), and what state it
// should show in the rail.
//
// The rail NEVER writes scattered `selectedEntityId` / `context.kind === ...`
// checks. Every enabled/disabled/reason/kind decision flows through
// getOperationalActionState below, which is built on the PR-3 capability seam.
//
// Commands that have NO existing, safe frontend seam are explicitly projected as
// `implemented: false` with an HONEST reason — never faked into demo behavior.
// This module is PURE: it imports no providers, no Demo/Live seams, no fixtures,
// and no UI. It only depends on the PR-3 context model and the shared capability
// types.
// ============================================================================

import type { InvestigativeContext } from "./investigative-context";
import type { ContextualCapabilities } from "./investigative-context";
import { EMPTY_CAPABILITIES } from "./investigative-context";

/** The full command vocabulary of the operational rail (PR-4). */
export type OperationalAction =
  | "search"
  | "focus"
  | "expand"
  | "filter"
  | "layers"
  | "layout"
  | "discover"
  | "find-connections"
  | "detect-gaps"
  | "trace-evidence"
  | "cross-case"
  | "add-evidence"
  | "review"
  | "resolve"
  | "challenge";

/** How a command behaves — prevents every button from being a boolean toggle. */
export type OperationalActionKind =
  | "immediate" // executes once, has no open/closed state (Focus)
  | "surface-toggle" // opens/closes a graph surface (Layers, Discover, Gaps, Filter, Cross-Case)
  | "modal" // opens a modal workflow (Add Evidence)
  | "navigation" // routes somewhere
  | "mutation"; // mutates domain data (Review / Resolve / Challenge — future)

export interface OperationalActionState {
  /** Whether the command is shown in the rail at all. */
  visible: boolean;
  /** Whether it can be triggered right now. */
  enabled: boolean;
  /** Whether a real business implementation is bound (vs. a disabled stub). */
  implemented: boolean;
  /** Command type — drives active-state + aria-pressed semantics. */
  kind: OperationalActionKind;
  /** Honest explanation for disabled / unimplemented commands. */
  reason?: string;
}

/** Workspace facts the projection may depend on (mirrors PR-3's shape). */
export interface OperationalActionWorkspace {
  readonly mode: "demo" | "live";
}

// ----------------------------------------------------------------------------
// Command-type assignments (static — the kind never changes with context).
// ----------------------------------------------------------------------------

const COMMAND_KIND: Record<OperationalAction, OperationalActionKind> = {
  search: "immediate",
  focus: "immediate",
  expand: "immediate",
  filter: "surface-toggle",
  layers: "surface-toggle",
  layout: "immediate",
  discover: "surface-toggle",
  "find-connections": "immediate",
  "detect-gaps": "surface-toggle",
  "trace-evidence": "surface-toggle",
  "cross-case": "surface-toggle",
  "add-evidence": "modal",
  review: "mutation",
  resolve: "mutation",
  challenge: "mutation",
};

// ----------------------------------------------------------------------------
// Implementation availability — which commands have a real, safe frontend seam
// TODAY. Kept in ONE place so Live/Demo provider support and future PRs extend
// it without the rail learning new branching.
// ----------------------------------------------------------------------------

/**
 * Commands already bound to a real existing implementation (PR-3 + PR-4).
 * Everything else is an honest unimplemented stub — do NOT fake it.
 */
const IMPLEMENTED: ReadonlySet<OperationalAction> = new Set<OperationalAction>([
  "focus", // PR-3: controlsRef.focusNode (deterministic entity graph target)
  "layers", // PR-2: graph legend surface
  "discover", // PR-2: DiscoveryPanel (provider-driven)
  "detect-gaps", // PR-2: provider-driven gaps surface
  "cross-case", // PR-1/PR-2: CrossCaseProvider.listForeignOverlays overlay picker
  "add-evidence", // PR-2: EvidenceIntake modal + existing submission/realtime choreography
  "filter", // PR-4: real relation visibility filter over loaded graph edges
]);

// ----------------------------------------------------------------------------
// Presentational metadata (labels + default hints). The rail renders from here.
// ----------------------------------------------------------------------------

export interface OperationalActionMeta {
  id: OperationalAction;
  label: string;
  hint: string;
}

export const OPERATIONAL_ACTION_META: Record<OperationalAction, OperationalActionMeta> = {
  search: { id: "search", label: "Search", hint: "Search graph" },
  focus: { id: "focus", label: "Focus", hint: "Center selection on graph" },
  expand: { id: "expand", label: "Expand", hint: "Reveal neighborhood" },
  filter: { id: "filter", label: "Filter", hint: "Scrub relations" },
  layers: { id: "layers", label: "Layers", hint: "Graph legend" },
  layout: { id: "layout", label: "Layout", hint: "Arrange nodes" },
  discover: { id: "discover", label: "Discover", hint: "Open discovery" },
  "find-connections": { id: "find-connections", label: "Find Connections", hint: "Trace links" },
  "detect-gaps": { id: "detect-gaps", label: "Detect Gaps", hint: "Structural gaps" },
  "trace-evidence": { id: "trace-evidence", label: "Trace Evidence", hint: "Follow evidence" },
  "cross-case": { id: "cross-case", label: "Cross-Case", hint: "Foreign overlays" },
  "add-evidence": { id: "add-evidence", label: "Add Evidence", hint: "Upload evidence" },
  review: { id: "review", label: "Review", hint: "Review object" },
  resolve: { id: "resolve", label: "Resolve", hint: "Resolve object" },
  challenge: { id: "challenge", label: "Challenge", hint: "Revisit standing" },
};

/** Rail groups in their PR-2 visual order, driven by this single definition. */
export const OPERATIONAL_ACTION_GROUPS: { title: string; actions: OperationalAction[] }[] = [
  { title: "Graph", actions: ["search", "focus", "expand", "filter", "layers", "layout"] },
  {
    title: "Investigate",
    actions: ["discover", "find-connections", "detect-gaps", "trace-evidence", "cross-case"],
  },
  {
    title: "Act / Verify",
    actions: ["add-evidence", "review", "resolve", "challenge"],
  },
];

// ----------------------------------------------------------------------------
// Honest reason text (stable, testable).
// ----------------------------------------------------------------------------

export const OPERATIONAL_REASONS = {
  FOCUS_NEEDS_ENTITY: "Select an entity to focus it",
  NO_SELECTION: "Requires a selection",
  NO_GRAPH_TARGET: "This selection has no deterministic graph target",
  NO_SEARCH: "Search is not available yet",
  NO_EXPAND_SEAM: "Traversal backend exists, UI command is not yet wired",
  NO_LAYOUT_SEAM: "Only the force layout is implemented — no alternative layout switch",
  NO_CONNECTIONS_SEAM: "Connection traversal is not yet wired to a graph surface",
  NO_TRACE_SEAM: "Evidence trace is not yet wired for this context",
  NO_REVIEW: "No review workflow is wired for this object type",
  NO_RESOLVE: "There is no generic resolver — resolution follows the object's own domain API",
  NO_CHALLENGE: "Challenge requires a relation selection (relation-authority workflow)",
  NO_RELATION_AUTHORITY_LIVE: "Relation authority is not available in live mode (typed unsupported on this provider seam)",
} as const;

// ----------------------------------------------------------------------------
// Per-action projection logic. This is the ONLY place the rail learns what each
// command can do. Capability (PR-3) and implementation availability (above) are
// the two inputs that decide enabled/implemented/reason.
// ----------------------------------------------------------------------------

function project(
  kind: OperationalActionKind,
  featured: Pick<OperationalActionState, "enabled" | "implemented" | "reason">,
): OperationalActionState {
  return {
    visible: true,
    kind,
    enabled: featured.enabled,
    implemented: featured.implemented,
    ...(featured.reason ? { reason: featured.reason } : {}),
  };
}

export function getOperationalActionState(
  action: OperationalAction,
  context: InvestigativeContext | null,
  capabilities: ContextualCapabilities,
  workspace: OperationalActionWorkspace,
): OperationalActionState {
  const kind = COMMAND_KIND[action];
  const implemented = IMPLEMENTED.has(action);

  switch (action) {
    case "search":
      return project(kind, {
        enabled: false,
        implemented,
        reason: OPERATIONAL_REASONS.NO_SEARCH,
      });

    case "focus":
      return project(kind, {
        // PR-3: only a deterministic entity graph target can be centered.
        enabled: capabilities.canFocus && implemented,
        implemented,
        reason: capabilities.canFocus
          ? undefined
          : context
            ? OPERATIONAL_REASONS.NO_GRAPH_TARGET
            : OPERATIONAL_REASONS.FOCUS_NEEDS_ENTITY,
      });

    case "expand":
      return project(kind, {
        enabled: false,
        implemented,
        reason: OPERATIONAL_REASONS.NO_EXPAND_SEAM,
      });

    case "filter":
      // Filter is context-INDEPENDENT: it alters graph readability for the
      // whole canvas, so it needs no selection to be useful.
      return project(kind, { enabled: implemented, implemented });

    case "layers":
      return project(kind, { enabled: implemented, implemented });

    case "layout":
      return project(kind, {
        enabled: false,
        implemented,
        reason: OPERATIONAL_REASONS.NO_LAYOUT_SEAM,
      });

    case "discover":
      return project(kind, { enabled: implemented, implemented });

    case "find-connections":
      return project(kind, {
        enabled: false,
        implemented,
        reason: OPERATIONAL_REASONS.NO_CONNECTIONS_SEAM,
      });

    case "detect-gaps":
      return project(kind, { enabled: implemented, implemented });

    case "trace-evidence":
      return project(kind, {
        enabled: false,
        implemented,
        // Capable selections (entity/relation/...) conceptually support tracing,
        // but no dedicated rail surface is bound yet in this PR.
        reason: OPERATIONAL_REASONS.NO_TRACE_SEAM,
      });

    case "cross-case":
      return project(kind, { enabled: implemented, implemented });

    case "add-evidence":
      return project(kind, { enabled: implemented, implemented });

    case "review":
      return project(kind, {
        enabled: false,
        implemented,
        reason: OPERATIONAL_REASONS.NO_REVIEW,
      });

    case "resolve":
      return project(kind, {
        enabled: false,
        implemented,
        reason: OPERATIONAL_REASONS.NO_RESOLVE,
      });

    case "challenge":
      // PR-8: the reserved relation-authority command is now wired for RELATION
      // contexts in demo mode. The rail is the ENTRY surface — clicking it
      // reveals the relation context where the authority panel lives — while
      // per-action legality (Accept/Reject/Reverse) is decided by the authority
      // model + provider, not by the rail.
      if (context?.kind !== "relation") {
        return project(kind, {
          enabled: false,
          implemented: false,
          reason: OPERATIONAL_REASONS.NO_CHALLENGE,
        });
      }
      if (workspace.mode !== "demo") {
        return project(kind, {
          enabled: false,
          implemented: false,
          reason: OPERATIONAL_REASONS.NO_RELATION_AUTHORITY_LIVE,
        });
      }
      return project(kind, { enabled: true, implemented: true });
  }
}

/** Convenience: the full projection set across every rail action for an input. */
export function getOperationalRailStates(
  context: InvestigativeContext | null,
  capabilities: ContextualCapabilities,
  workspace: OperationalActionWorkspace,
): Record<OperationalAction, OperationalActionState> {
  const all: OperationalAction[] = [
    "search",
    "focus",
    "expand",
    "filter",
    "layers",
    "layout",
    "discover",
    "find-connections",
    "detect-gaps",
    "trace-evidence",
    "cross-case",
    "add-evidence",
    "review",
    "resolve",
    "challenge",
  ];
  return all.reduce((acc, a) => {
    acc[a] = getOperationalActionState(a, context, capabilities, workspace);
    return acc;
  }, {} as Record<OperationalAction, OperationalActionState>);
}

/** Re-exported empty capabilities so the rail can build a no-context baseline. */
export { EMPTY_CAPABILITIES };
