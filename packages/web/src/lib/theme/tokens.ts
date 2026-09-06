// ============================================================================
// PR-9 · Cinematic Theme Token Contract
//
// The semantic layer is CENTRALIZED here. Each entry carries:
//   - the Tailwind utility tail   ("semantic-selection" → stroke/fill/text/ring-…)
//   - the CSS custom property      ("--color-semantic-selection")
//   - the data-* hook that carries the state on the live graph (if any)
//   - the honest MEANING of the state in the domain
//
// A state's meaning is fixed: PR-9 may change how a state FEELS, never what it
// MEANS. These contracts let tests lock that down without a single pixel
// assertion — two semantic states resolving to the same token, or a muted text
// tier falling below WCAG AA on the semantic background, are failures.
//
// Pure module: no React, no Demo/Live providers, no fixtures, no domain engines.
// ============================================================================

/** Prefixed CSS custom property reference for a semantic name. */
export function semanticCssVar(name: string): string {
  return `--color-semantic-${name}`;
}

/** Tailwind utility tail derived from a semantic name ("semantic-…"). */
export function semanticUtility(name: string): string {
  return `semantic-${name}`;
}

export interface SemanticTokenBase {
  readonly name: string;
  readonly meaning: string;
}

export interface GraphSemanticState {
  readonly name: string;
  readonly meaning: string;
  /** The live data-* hook that carries this state ("" when none). */
  readonly hook: string;
}

/** The graph's fixed semantic states. Order matters for distinctness checks. */
export const GRAPH_SEMANTIC_STATES: readonly GraphSemanticState[] = [
  { name: "supported",   meaning: "evidence backs this hypothesis/relation — slightly brighter, clearer", hook: "data-graph-node-posture=\"supported\"" },
  { name: "contradiction", meaning: "evidence actively contradicts — the ONLY saturated rose-red in the graph", hook: "data-graph-node-posture=\"contradicted\"" },
  { name: "unresolved",  meaning: "evidence uncertain / broken — smoky, soft broken treatment, never 'suspicious'", hook: "data-graph-node-posture=\"unresolved\"" },
  { name: "foreign",     meaning: "cross-case member outside this boundary — dusty blue-silver tone", hook: "data-graph-case-scope=\"foreign\"" },
  { name: "attention",   meaning: "ordinal focus field (0–3), an atmospheric contour — never a numeric score", hook: "data-graph-attention-level" },
  { name: "selection",   meaning: "the investigator locked onto this object — warm-white spotlight", hook: "data-graph-selected=\"true\"" },
  { name: "focus",       meaning: "keyboard focus — the visible lens, warm-white ring", hook: "data-graph-focused=\"true\"" },
] as const;

/** Canonical graph-state token map (name → utility/CSS). */
export const GRAPH_SEMANTIC_TOKENS: Readonly<Record<string, SemanticTokenBase>> =
  Object.fromEntries(
    GRAPH_SEMANTIC_STATES.map((s) => [s.name, {
      name: s.name,
      meaning: s.meaning,
    }]),
  ) as Record<string, SemanticTokenBase>;

/** Panel material semantics — the dossier/paper layer shared by the shell. */
export const PANEL_SEMANTIC_NAMES: readonly string[] = [
  "background",
  "surface",
  "surface-elevated",
  "surface-soft",
  "foreground",
  "foreground-muted",
  "foreground-faint",
  "border",
  "border-subtle",
] as const;

/** Every property that must exist in globals.css @theme. */
export const ALL_SEMANTIC_NAMES: readonly string[] = [
  ...PANEL_SEMANTIC_NAMES,
  ...GRAPH_SEMANTIC_STATES.map((s) => s.name),
  "selection-subtle",
  "contradiction-subtle",
  "attention-subtle",
] as const;

/**
 * The background every controlled text tier is measured against (WCAG AA).
 * Muted + faint metadata must still clear 4.5:1 — style may be soft, never
 * unreadable.
 */
export const CONTRAST_BACKGROUND_CSS_VAR = semanticCssVar("background");

// ─── Motion ─────────────────────────────────────────────────────────────────

export const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

export const MOTION_TOKENS = {
  durationFast: "var(--transition-duration-fast)",
  durationNormal: "var(--transition-duration-normal)",
  durationSlow: "var(--transition-duration-slow)",
  /** Under reduced motion every transition/animation collapses to ~0. */
  reducedMotionEduration: "0.01ms",
} as const;

// ─── Contrast helpers (pure, testable) ──────────────────────────────────────

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Relative luminance of a hex color (0–1). */
export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length !== 6) return 0;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG contrast ratio between two hex colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}