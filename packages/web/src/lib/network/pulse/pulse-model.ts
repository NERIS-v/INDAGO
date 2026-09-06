// ============================================================================
// F-PR6 — Entity Pulse (corrective pass): pure, deterministic geometry model.
//
// The pulse is a MULTI-ENTITY view: every placed entity gets its own enclosed,
// continuous, deformable radial field derived strictly from that entity's own
// provider-backed observations inside the currently selected workspace
// timeRange. Nothing here invents activity, salience, categories or labels.
//
// Semantic channels (never severity — no red=bad):
//   OUTER continuous field      observed / evidence activity (in-window)
//   INNER subtle halo           analytical salience (structuralImportance)
//   accent colour / fill        activity/evidence category
//
// Determinism contract: identical (entity, observation set, timeRange,
// filters) ⇒ identical geometry. No Math.random, Date.now, unseeded noise,
// or random layout. Reproducible for demo day.
//
// PURE module: no React, no provider imports (source-guard safe).
// ============================================================================

import type { GraphNode, Observation } from "@indago/contracts";
import type { NetworkTimeRange } from "@/lib/network/network-workspace";
import type {
  ForeignCaseOverlay,
  IntelligenceCandidateView,
  ObservationContradiction,
} from "@/lib/providers/types";

// ---------------------------------------------------------------------------
// Category semantics (category, not severity)
// ---------------------------------------------------------------------------

export type PulseCategory =
  | "communication"
  | "financial"
  | "location"
  | "identity"
  | "cross-case"
  | "other";

export const PULSE_CATEGORIES: readonly PulseCategory[] = [
  "communication",
  "financial",
  "location",
  "identity",
  "cross-case",
  "other",
] as const;

export const PULSE_CATEGORY_LABELS: Record<PulseCategory, string> = {
  communication: "Communication",
  financial: "Financial",
  location: "Location",
  identity: "Identity",
  "cross-case": "Cross-case",
  other: "Other",
};

export const PULSE_CATEGORY_COLORS: Record<PulseCategory, string> = {
  communication: "var(--color-accent-blue)",
  financial: "var(--color-accent-amber)",
  location: "var(--color-success)",
  identity: "var(--color-info)",
  "cross-case": "var(--color-warning)",
  other: "var(--color-surface-500)",
};

/**
 * Maps a canonical observation type onto a pulse category. RELATIONAL is an
 * entity→entity relationship rather than a location or identity signal, so it
 * is grouped under "other" — never conflated with a semantic it is not.
 */
export function observationTypeToCategory(
  type: Observation["type"],
): PulseCategory {
  switch (type) {
    case "COMMUNICATION":
      return "communication";
    case "FINANCIAL":
      return "financial";
    case "SPATIAL":
      return "location";
    case "IDENTITY":
      return "identity";
    default:
      return "other";
  }
}

// ---------------------------------------------------------------------------
// Geometry constants
// ---------------------------------------------------------------------------

/** Radial samples per entity field (continuous contour resolution). */
export const PULSE_SAMPLE_COUNT = 96;

/** Overview cap — a bounded, deterministic set of relevant entities. */
export const PULSE_MAX_TOPIC_ENTITIES = 6;

/** Calm (no in-window activity) outer radius, relative [0..1]. */
export const PULSE_RADIUS_BASE = 0.22;

/** Maximum extra radius contributed by in-window activity. */
export const PULSE_ACTIVITY_AMPLITUDE = 0.78;

/** Salience halo baseline radius (analytical, always present). */
export const PULSE_HALO_BASE = 0.14;

/** Salience halo radius growth across structuralImportance 0..1. */
export const PULSE_HALO_AMPLITUDE = 0.22;

/** Raised-cosine lobe half-width in radians (smooth local expansion). */
export const PULSE_KERNEL_WIDTH = 1.05;

/** First sample angle (12 o'clock). Angles grow clockwise in SVG space. */
export const PULSE_PHASE = -Math.PI / 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PulseMarkerKind =
  | "observation-cluster"
  | "contradiction"
  | "identity-resolution"
  | "cross-case";

export interface PulseMarker {
  readonly kind: PulseMarkerKind;
  /** Short readable label, e.g. "3 observations in window". */
  readonly label: string;
  /** Hover/focus explanatory text. */
  readonly detail: string;
  /** Unresolved/synthetic markers may carry no anchor entity. */
  readonly entityId: string | null;
  readonly entityLabel: string | null;
}

/** One placed entity's own pulse field — visually and analytically distinct. */
export interface EntityPulseField {
  readonly nodeId: string;
  readonly entityId: string;
  readonly label: string;
  /** Dominant in-window category (or "other" when no in-window activity). */
  readonly category: PulseCategory;
  readonly categoryLabel: string;
  /** Clamped structuralImportance (0..1) — analytical salience. */
  readonly salience: number;
  readonly salienceAvailable: boolean;
  /** True when the entity has ≥1 observation inside the window. */
  readonly active: boolean;
  readonly observationCount: number;
  /** Full-timeline observation count (change/isolation narration). */
  readonly totalObservationCount: number;
  /** Normalized in-window strength (0 = calm). */
  readonly strength: number;
  /** 96 relative radii of the outer continuous activity field. */
  readonly outerSamples: readonly number[];
  /** 96 relative radii of the salience halo. */
  readonly innerSamples: readonly number[];
}

/** Data-backed "change" note (selected window vs full timeline). */
export interface EntityPulseChange {
  readonly entityId: string;
  readonly label: string;
  readonly inWindow: number;
  readonly total: number;
  readonly description: string;
}

export interface EntityPulseOverview {
  /** Deterministic, capped, ordered entity fields (display order). */
  readonly entities: readonly EntityPulseField[];
  readonly entityNodeCount: number;
  readonly cap: number;
  readonly capped: boolean;
  readonly totalObservationsInWindow: number;
  readonly totalObservationsFull: number;
  /** window/full percentage, or null when the full timeline is empty. */
  readonly concentrationPct: number | null;
  /** Across all placed entities' in-window observations, by category. */
  readonly dominantCategory: PulseCategory | null;
  readonly dominantCategoryLabel: string | null;
  /** Most active entity in the window, or null when the field is calm. */
  readonly strongest: EntityPulseField | null;
  /** Most reduced entity vs full timeline, or null outside a bounded window. */
  readonly mostChanged: EntityPulseChange | null;
  readonly markers: readonly PulseMarker[];
  readonly salienceAvailable: boolean;
  readonly windowLabel: "selected window" | "full timeline";
  readonly summary: string;
}

export interface EntityPulseInput {
  readonly nodes: readonly GraphNode[];
  readonly observations: readonly Observation[];
  readonly contradictions?: readonly ObservationContradiction[];
  readonly candidates?: readonly IntelligenceCandidateView[];
  readonly overlays?: readonly ForeignCaseOverlay[];
  readonly timeRange: NetworkTimeRange;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Wrapped angle difference to [-π, π]. */
function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Raised-cosine lobe: peak 1 at centre, smooth falloff, zero beyond width. */
function kernel(delta: number): number {
  const d = Math.abs(delta);
  if (d >= PULSE_KERNEL_WIDTH) return 0;
  return 0.5 * (1 + Math.cos((d / PULSE_KERNEL_WIDTH) * Math.PI));
}

/** FNV-1a 32-bit — pure, collision-safe enough for deterministic layout. */
export function stableHash(input: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function observationMs(observation: Observation): number {
  const raw = observation.observedAt?.value;
  const ms = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

/**
 * Time relevance: untimed observations are included regardless of the window
 * (conservative — a missing timestamp is not evidence of absence), and a null
 * window (full timeline) never filters.
 */
export function observationInTimeRange(
  observation: Observation,
  timeRange: [number, number] | null,
): boolean {
  if (timeRange === null) return true;
  const ms = observationMs(observation);
  if (!Number.isFinite(ms)) return true;
  return ms >= timeRange[0] && ms <= timeRange[1];
}

/**
 * Closed Catmull-Rom spline over N polar samples → smooth SVG path.
 * `phase` aligns the first sample to the model's own PULSE_PHASE convention.
 * Returns "" for fewer than 3 samples (honest degenerate output, no NaN).
 */
export function closedRadialPath(
  samples: readonly number[],
  centerX: number,
  centerY: number,
  scale: number,
  phase = 0,
): string {
  const n = samples.length;
  if (n < 3) return "";
  const points = samples.map((radius, index) => {
    const angle = phase + (index / n) * Math.PI * 2;
    return {
      x: centerX + Math.cos(angle) * radius * scale,
      y: centerY + Math.sin(angle) * radius * scale,
    };
  });
  const at = (index: number) => points[((index % n) + n) % n]!;

  let d = `M ${points[0]!.x.toFixed(3)} ${points[0]!.y.toFixed(3)}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(3)} ${c1y.toFixed(3)}, ${c2x.toFixed(3)} ${c2y
      .toFixed(3)}, ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}`;
  }
  return `${d} Z`;
}

function indexByEntity(
  nodes: readonly GraphNode[],
  observations: readonly Observation[],
): Map<string, Observation[]> {
  const map = new Map<string, Observation[]>();
  for (const node of nodes) {
    map.set(node.entityId ?? "", []);
  }
  for (const observation of observations) {
    for (const entityId of observation.entityIds) {
      const list = map.get(entityId) ?? [];
      list.push(observation);
      map.set(entityId, list);
    }
  }
  return map;
}

function sumStrength(observations: readonly Observation[]): number {
  let total = 0;
  for (const observation of observations) {
    if (Number.isFinite(observation.strength)) total += observation.strength;
  }
  return total;
}

/** Dominant (most frequent, first-by-category on tie) category in a list. */
function dominantCategory(
  observations: readonly Observation[],
): PulseCategory | null {
  if (observations.length === 0) return null;
  const counts = new Map<PulseCategory, number>();
  for (const observation of observations) {
    const category = observationTypeToCategory(observation.type);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  let best: PulseCategory = PULSE_CATEGORIES[0]!;
  let bestCount = -1;
  for (const category of PULSE_CATEGORIES) {
    const count = counts.get(category) ?? 0;
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }
  return best;
}

/**
 * One entity's continuous field: base calm circle plus one raised-cosine lobe
 * per in-window observation, centred at a deterministic per-observation angle
 * and scaled by that observation's relative strength. Removing/adding
 * observations (window change) therefore morphs the contour genuinely.
 */
function sampleOuterField(
  node: GraphNode,
  inWindow: readonly Observation[],
  maxWindowStrength: number,
): number[] {
  const sample = Array.from(
    { length: PULSE_SAMPLE_COUNT },
    (_, index) => {
      let radius = PULSE_RADIUS_BASE;
      if (maxWindowStrength > 0) {
        for (const observation of inWindow) {
          const strength = Number.isFinite(observation.strength)
            ? observation.strength
            : 0;
          const phase = PULSE_PHASE + (
            (stableHash(`${node.id}|${observation.id}`) % 2000) / 2000
          ) * Math.PI * 2;
          const angle = PULSE_PHASE + (index / PULSE_SAMPLE_COUNT) * Math.PI * 2;
          const contribution =
            (strength / maxWindowStrength) *
            kernel(angleDelta(angle, phase)) *
            PULSE_ACTIVITY_AMPLITUDE;
          radius += contribution;
        }
      }
      return clamp(
        radius,
        PULSE_RADIUS_BASE,
        PULSE_RADIUS_BASE + PULSE_ACTIVITY_AMPLITUDE,
      );
    },
  );
  return sample;
}

/**
 * Analytical salience halo: a calm inner contour whose radius is purely the
 * canonical structuralImportance. Distinct channel from activity, never red.
 */
function sampleInnerHalo(node: GraphNode): number[] {
  const radius = clamp01(node.structuralImportance);
  const halo = PULSE_HALO_BASE + radius * PULSE_HALO_AMPLITUDE;
  return Array.from({ length: PULSE_SAMPLE_COUNT }, () => halo);
}

// ---------------------------------------------------------------------------
// Overview builder
// ---------------------------------------------------------------------------

export function buildEntityPulseOverview(
  input: EntityPulseInput,
): EntityPulseOverview {
  const { nodes, observations, timeRange } = input;

  // Placed entities: canonical ENTITY nodes with an entityId, stable order.
  const placed = nodes
    .filter((node) => node.type === "ENTITY" && node.entityId)
    .slice()
    .sort(
      (a, b) =>
        b.structuralImportance - a.structuralImportance ||
        (a.entityId ?? "").localeCompare(b.entityId ?? ""),
    );

  const entityNodeCount = placed.length;
  const cap = PULSE_MAX_TOPIC_ENTITIES;
  const capped = entityNodeCount > cap;
  const picked = placed.slice(0, cap);

  const inWindow = observations.filter((observation) =>
    observationInTimeRange(observation, timeRange),
  );
  const byEntityWindow = indexByEntity(picked, inWindow);
  const byEntityFull = indexByEntity(picked, observations);

  const maxWindowStrength = Math.max(
    ...picked.map((node) => sumStrength(byEntityWindow.get(node.entityId ?? "") ?? [])),
    0,
  );

  const fields: EntityPulseField[] = picked.map((node) => {
    const entityId = node.entityId ?? "";
    const windowObs = byEntityWindow.get(entityId) ?? [];
    const fullObs = byEntityFull.get(entityId) ?? [];
    const salience = clamp01(node.structuralImportance);
    const category = dominantCategory(windowObs) ?? "other";
    const strength = sumStrength(windowObs);
    return {
      nodeId: node.id,
      entityId,
      label: node.label,
      category,
      categoryLabel: PULSE_CATEGORY_LABELS[category],
      salience,
      salienceAvailable: salience > 0,
      active: windowObs.length > 0,
      observationCount: windowObs.length,
      totalObservationCount: fullObs.length,
      strength,
      outerSamples: sampleOuterField(node, windowObs, maxWindowStrength),
      innerSamples: sampleInnerHalo(node),
    };
  });

  const totalObservationsInWindow = inWindow.length;
  const totalObservationsFull = observations.length;
  const salienceAvailable = picked.some(
    (node) => clamp01(node.structuralImportance) > 0,
  );

  const windowLabel = timeRange ? "selected window" : "full timeline";
  const concentrationPct =
    totalObservationsFull > 0
      ? Math.round((totalObservationsInWindow / totalObservationsFull) * 100)
      : null;

  // Dominant activity category across all in-window observations.
  const categoryCounts = new Map<PulseCategory, number>();
  for (const observation of inWindow) {
    const category = observationTypeToCategory(observation.type);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }
  let dominantCategoryResult: PulseCategory | null = null;
  let dominantCount = 0;
  for (const category of PULSE_CATEGORIES) {
    const count = categoryCounts.get(category) ?? 0;
    if (count > dominantCount) {
      dominantCategoryResult = category;
      dominantCount = count;
    }
  }

  // Strongest: most in-window strength; ties → count → salience → id.
  const activeFields = fields.filter((field) => field.active);
  let strongest: EntityPulseField | null = null;
  for (const field of activeFields) {
    if (!strongest) {
      strongest = field;
      continue;
    }
    const better =
      field.strength > strongest.strength ||
      (field.strength === strongest.strength &&
        field.observationCount > strongest.observationCount) ||
      (field.strength === strongest.strength &&
        field.observationCount === strongest.observationCount &&
        field.salience > strongest.salience) ||
      (field.strength === strongest.strength &&
        field.observationCount === strongest.observationCount &&
        field.salience === strongest.salience &&
        field.entityId < strongest.entityId);
    if (better) strongest = field;
  }

  // Most changed vs full timeline (only meaningful inside a bounded window).
  let mostChanged: EntityPulseChange | null = null;
  if (timeRange) {
    for (const field of fields) {
      const delta = field.totalObservationCount - field.observationCount;
      if (delta <= 0) continue;
      if (
        !mostChanged ||
        delta > mostChanged.total - mostChanged.inWindow ||
        (delta === mostChanged.total - mostChanged.inWindow &&
          field.entityId < mostChanged.entityId)
      ) {
        mostChanged = {
          entityId: field.entityId,
          label: field.label,
          inWindow: field.observationCount,
          total: field.totalObservationCount,
          description: `${field.label}: ${field.observationCount} of ${field.totalObservationCount} observations in the selected window.`,
        };
      }
    }
  }

  const markers = buildMarkers(
    fields,
    observations,
    input.contradictions ?? [],
    input.candidates ?? [],
    input.overlays ?? [],
  );

  let summary = `Entity Pulse: ${fields.length} ${fields.length === 1 ? "entity" : "entities"}, ${totalObservationsInWindow} ${totalObservationsInWindow === 1 ? "observation" : "observations"} in ${windowLabel}.`;
  if (strongest) {
    summary += ` Most active: ${strongest.label} (${strongest.observationCount} observations, ${strongest.categoryLabel.toLowerCase()}).`;
  } else {
    summary += " No dominant activity in this window.";
  }
  if (timeRange && concentrationPct !== null) {
    summary += ` Window holds ${concentrationPct}% of ${totalObservationsFull} total observations.`;
  }
  if (capped) {
    summary += ` Overview shows the top ${cap} by structural salience.`;
  }

  return {
    entities: fields,
    entityNodeCount,
    cap,
    capped,
    totalObservationsInWindow,
    totalObservationsFull,
    concentrationPct,
    dominantCategory: dominantCategoryResult,
    dominantCategoryLabel: dominantCategoryResult
      ? PULSE_CATEGORY_LABELS[dominantCategoryResult]
      : null,
    strongest,
    mostChanged,
    markers,
    salienceAvailable,
    windowLabel,
    summary,
  };
}

function buildMarkers(
  fields: readonly EntityPulseField[],
  observations: readonly Observation[],
  contradictions: readonly ObservationContradiction[],
  candidates: readonly IntelligenceCandidateView[],
  overlays: readonly ForeignCaseOverlay[],
): PulseMarker[] {
  const placedById = new Map(fields.map((field) => [field.entityId, field]));
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation]),
  );
  const markers: PulseMarker[] = [];

  const anchorEntity = (entityIds: readonly string[]): string | null => {
    for (const entityId of entityIds) {
      if (placedById.has(entityId)) return entityId;
    }
    return null;
  };

  for (const contradiction of contradictions
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))) {
    const left = observationById.get(contradiction.leftObservationId);
    const right = observationById.get(contradiction.rightObservationId);
    if (!left || !right) continue;
    const entityId =
      anchorEntity(
        left.entityIds.filter((id) => right.entityIds.includes(id)),
      ) ??
      anchorEntity(left.entityIds) ??
      anchorEntity(right.entityIds);
    if (!entityId) continue;
    const entity = placedById.get(entityId);
    markers.push({
      kind: "contradiction",
      label: "Contradiction",
      detail: `${left.id} ↔ ${right.id}: ${contradiction.description}`,
      entityId,
      entityLabel: entity?.label ?? null,
    });
  }

  for (const candidate of candidates
    .slice()
    .sort((a, b) => a.resolutionId.localeCompare(b.resolutionId))) {
    const linkedId = candidate.leftEntity
      ? candidate.leftEntity.id
      : candidate.rightEntity?.id ?? null;
    if (!linkedId || !placedById.has(linkedId)) continue;
    markers.push({
      kind: "identity-resolution",
      label: "Identity resolution",
      detail: `${candidate.left.text} ↔ ${candidate.right.text} — status ${candidate.hypothesis.status} (score ${Number.isFinite(candidate.comparison.score) ? candidate.comparison.score.toFixed(2) : "--"}).`,
      entityId: linkedId,
      entityLabel: placedById.get(linkedId)?.label ?? null,
    });
  }

  for (const overlay of overlays
    .slice()
    .sort((a, b) => a.ref.localeCompare(b.ref))) {
    markers.push({
      kind: "cross-case",
      label: overlay.title,
      detail: overlay.summary,
      entityId: null,
      entityLabel: null,
    });
  }

  return markers.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label),
  );
}