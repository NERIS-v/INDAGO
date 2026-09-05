// ============================================================================
// PR-3 — Unified Investigative Context (canonical selection contract)
//
// ONE canonical selection contract shared by every surface of the Graph
// Control Center. The shell (GraphControlCenter) is the SINGLE OWNER of the
// selected InvestigativeContext. Panels SPEAK intents (graph clicks, timeline
// activations, rail picks, deep links, drawer closes); the shell rematerializes
// them as ContextSource-tagged InvestigativeContext values. Context state never
// lives inside per-panel selectors.
//
// Invariants:
//   - CANONICAL IDENTITY = kind + id. Mutable domain data is NEVER stuffed
//     into selection state — consumers resolve current provider data at render
//     time through the ContextResolver (context-resolver.ts).
//   - SELECTION ≠ RESOLUTION. Selecting an object does not load its data.
//   - SELECT ≠ FOCUS. Selecting opens the contextual/intelligence surfaces;
//     focusing centers the object on the graph (only when a deterministic
//     graph target exists).
//   - source is interaction metadata ONLY; it never changes identity.
//   - This module is PURE. It imports NO providers, NO Demo/Live seams, no
//     fixtures, and no UI. Every source-guard test assumes this file stays
//     importable by anything in components/* without creating a provider
//     dependency.
// ============================================================================

export type ContextKind =
  | "entity"
  | "relation"
  | "evidence"
  | "observation"
  | "lead"
  | "hypothesis"
  | "gap"
  | "anomaly"
  | "cross-case";

export type ContextSource =
  | "graph"
  | "timeline"
  | "context-panel"
  | "intelligence"
  | "rail"
  | "deep-link"
  | "drawer"
  | "external";

/** The canonical investigative selection. `null` = nothing selected. */
export interface InvestigativeContext {
  /** Domain kind of the selected object. */
  readonly kind: ContextKind;
  /** Provider-owned object id (entityId, gapId, overlay ref, ...). */
  readonly id: string;
  /** Interaction metadata only — where this selection came from. */
  readonly source: ContextSource;
}

/** A selection that can be empty. */
export type InvestigativeSelection = InvestigativeContext | null;

export const CONTEXT_KINDS: readonly ContextKind[] = [
  "entity",
  "relation",
  "evidence",
  "observation",
  "lead",
  "hypothesis",
  "gap",
  "anomaly",
  "cross-case",
];

export const CONTEXT_SOURCES: readonly ContextSource[] = [
  "graph",
  "timeline",
  "context-panel",
  "intelligence",
  "rail",
  "deep-link",
  "drawer",
  "external",
];

/** Stable selection identity: `${kind}:${id}`. */
export function contextKey(context: InvestigativeContext): string {
  return `${context.kind}:${context.id}`;
}

export function sameContextIdentity(
  a: InvestigativeContext | null | undefined,
  b: InvestigativeContext | null | undefined,
): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  return a.kind === b.kind && a.id === b.id;
}

const KIND_LABELS: Record<ContextKind, string> = {
  entity: "Entity",
  relation: "Relation",
  evidence: "Evidence",
  observation: "Observation",
  lead: "Lead",
  hypothesis: "Hypothesis",
  gap: "Gap",
  anomaly: "Anomaly",
  "cross-case": "Cross-case",
};

export function contextKindLabel(kind: ContextKind): string {
  return KIND_LABELS[kind];
}

/** Human-readable identity line, e.g. "Entity — Victor Aldridge (id)". */
export function contextDisplayLabel(context: InvestigativeContext, title?: string | null): string {
  const name = title && title.trim().length > 0 ? title : context.id;
  return `${contextKindLabel(context.kind)} — ${name}`;
}

// ============================================================================
// Contextual Capabilities — ONE centralized mapping from (context, workspace)
// to the actions a selection supports. Consumers (operational rail, future
// menu surfaces) derive EVERY enabled/disabled decision from this function —
// there is NO scattered `selectedEntityId` branching anywhere.
//
// Capability ≠ implementation. A capability describes what the selection
// CONCEPTUALLY supports; the actual command may still be un-wired in a later
// PR (PR-4). Surfaces must render un-wired commands as disabled-with-hint,
// never as fake-enabled buttons.
// ============================================================================

export interface ContextualCapabilities {
  /** Object has a deterministic graph target that can be centered (focus). */
  readonly canFocus: boolean;
  /** Object has a deterministic adjacency surface (neighbors/boundary). */
  readonly canExpand: boolean;
  /** Object participates in deterministic evidence chains. */
  readonly canTraceEvidence: boolean;
  /** The analyst review workflow applies to this object. */
  readonly canReview: boolean;
  /** The analyst can resolve/close this object through a real workflow. */
  readonly canResolve: boolean;
  /** The object's standing can be challenged (contradicted/reversed). */
  readonly canChallenge: boolean;
}

export const EMPTY_CAPABILITIES: ContextualCapabilities = {
  canFocus: false,
  canExpand: false,
  canTraceEvidence: false,
  canReview: false,
  canResolve: false,
  canChallenge: false,
};

/** Workspace facts the capability mapping may depend on. */
export interface WorkspaceCapabilities {
  /** Effective (non-auto) data mode of the active workspace. */
  readonly mode: "demo" | "live";
}

const EXPANDABLE: readonly ContextKind[] = [
  "entity",
  "relation",
  "evidence",
  "observation",
  "lead",
  "hypothesis",
  "gap",
  "anomaly",
  "cross-case",
];

const EVIDENCE_TRACEABLE: readonly ContextKind[] = [
  "entity",
  "relation",
  "evidence",
  "observation",
  "lead",
  "hypothesis",
  "gap",
  "anomaly",
];

const RESOLVABLE: readonly ContextKind[] = ["entity", "lead", "hypothesis", "gap", "anomaly"];

const CHALLENGEABLE: readonly ContextKind[] = ["relation", "hypothesis", "anomaly"];

export function getContextualCapabilities(
  context: InvestigativeContext | null,
  workspace: WorkspaceCapabilities,
): ContextualCapabilities {
  if (!context) return EMPTY_CAPABILITIES;

  const { kind } = context;

  const canExpand = EXPANDABLE.includes(kind);
  const canTraceEvidence = EVIDENCE_TRACEABLE.includes(kind);
  const canResolve = RESOLVABLE.includes(kind);
  const canChallenge = CHALLENGEABLE.includes(kind);

  // Only an entity maps to a deterministic graph node in the current PR.
  const canFocus = kind === "entity";

  // Cross-case review requires a foreign-case overlay seam to render; the
  // live platform has no such route yet, so only demo can review it.
  const canReview = kind === "cross-case" ? workspace.mode === "demo" : true;

  return {
    canFocus,
    canExpand,
    canTraceEvidence,
    canReview,
    canResolve,
    canChallenge,
  };
}

// ============================================================================
// Controller contract — the shell returns these actions to consumers.
// `select` is the minimum; `focus` / `reveal` / `clear` extend it for the
// deep-link, graph-focus and drawer-close flows without a global event bus.
// ============================================================================

export interface InvestigativeContextActions {
  /** Set the selection to `context` (or `null` to clear). */
  select: (context: InvestigativeContext | null) => void;
  /** Select AND request the object be centered on the graph. */
  focus: (context: InvestigativeContext) => void;
  /** Select AND surface the object in the right contextual panel. */
  reveal: (context: InvestigativeContext) => void;
  /** Clear the selection entirely. */
  clear: () => void;
}