// ============================================================================
// F-PR8 — Adaptive Flow: pure, deterministic directed-flow model.
//
// A flow segment exists ONLY when a provider-backed RelationHypothesis names a
// direction between two entities (directed=true) with a relation type that
// resolves to a flow domain (financial / communication / movement) and whose
// lifecycle status still makes it actionable (PROPOSED or ACCEPTED).
// REJECTED and REVERSED relations are excluded — a reversed hypothesis never
// re-appears as an active flow.
//
// Honesty contract (locked):
//   - Amounts are read ONLY from observation metadata customFields
//     (flowAmount + flowCurrency) attached to the relation's evidenceBasis.
//     No amount is ever invented, extrapolated, or inferred from prose.
//   - Mixed-currency segments are NEVER summed. Each currency is reported and
//     labelled separately; only per-currency totals exist.
//   - Width scales with the dominant-currency total via a bounded log curve.
//     Qualitative (amountless) segments get a uniform baseline width.
//   - A unilateral outflow with an unobserved destination becomes a "gap"
//     (dashed edge to an unresolved "?" endpoint) — never a suspicious label,
//     and only when an observation explicitly marks flowGap: "destination".
//   - NO FLOW DATA (no flow relations at all), NO FLOW IN SELECTED WINDOW
//     (mode exists but nothing survived the temporal filter) and FLOW DATA
//     UNAVAILABLE (provider not ready) are distinct, honest states.
//   - Adaptivity: available modes derive from which domains actually hold
//     segments. Default priority: FINANCIAL > MOVEMENT > COMMUNICATION.
//   - Determinism: identical input ⇒ identical geometry. No Math.random,
//     Date.now, or unseeded noise. Layered longest-path + barycenter + stable
//     label tie-breaks.
//
// PURE module: no React, no provider imports (source-guard safe).
// ============================================================================

import type {
  ConnectingPathCandidateDTO,
  GraphNode,
  Observation,
  RelationHypothesis,
  RelationType,
} from "@indago/contracts";
import { observationInTimeRange } from "@/lib/network/pulse/pulse-model";

// ---------------------------------------------------------------------------
// Flow domains (semantic category of directed movement, not severity)
// ---------------------------------------------------------------------------

export type FlowDomain = "FINANCIAL" | "COMMUNICATION" | "MOVEMENT";

export const FLOW_DOMAINS: readonly FlowDomain[] = [
  "FINANCIAL",
  "MOVEMENT",
  "COMMUNICATION",
] as const;

export const FLOW_DOMAIN_LABELS: Record<FlowDomain, string> = {
  FINANCIAL: "Financial",
  MOVEMENT: "Movement",
  COMMUNICATION: "Communication",
};

export const FLOW_DOMAIN_COLORS: Record<FlowDomain, string> = {
  FINANCIAL: "var(--color-accent-amber)",
  MOVEMENT: "var(--color-success)",
  COMMUNICATION: "var(--color-accent-blue)",
};

export type FlowRoleFilter =
  | "all"
  | "sources"
  | "intermediaries"
  | "destinations";

export const FLOW_ROLE_FILTERS: readonly FlowRoleFilter[] = [
  "all",
  "sources",
  "intermediaries",
  "destinations",
] as const;

export const FLOW_ROLE_LABELS: Record<FlowRoleFilter, string> = {
  all: "All entities",
  sources: "Sources",
  intermediaries: "Intermediaries",
  destinations: "Destinations",
};

export type FlowEntityRole = Exclude<FlowRoleFilter, "all">;

// ---------------------------------------------------------------------------
// Progress state
// ---------------------------------------------------------------------------

/** provider-backed flow compute failed or is not applicable */
export type FlowStatus =
  | "idle"
  | "loading"
  | "ready"
  | "no-flow-data"
  | "no-flow-in-window"
  | "error";

// ---------------------------------------------------------------------------
// Amount facets (from observation metadata, never invented)
// ---------------------------------------------------------------------------

export interface FlowAmount {
  readonly currency: string;
  readonly total: number;
  readonly count: number;
}

/**
 * Reads the structured amount facet attached to an observation's metadata.
 * Missing, malformed or non-numeric facets are ignored (no fabrication).
 */
function observationFlowAmount(observation: Observation): FlowAmount | null {
  const custom = observation.metadata?.customFields;
  if (!custom) return null;
  const amount = custom["flowAmount"];
  const currency = custom["flowCurrency"];
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    return null;
  }
  if (typeof currency !== "string" || currency.trim() === "") return null;
  return { currency: currency.trim(), total: amount, count: 1 };
}

function observationFlowGap(observation: Observation): boolean {
  return (
    observation.metadata?.customFields?.["flowGap"] === "destination"
  );
}

// ---------------------------------------------------------------------------
// Domain mapping (relation type / observation type → flow domain)
// ---------------------------------------------------------------------------

export function relationTypeToFlowDomain(type: RelationType): FlowDomain | null {
  switch (type) {
    case "financial":
      return "FINANCIAL";
    case "communication":
      return "COMMUNICATION";
    case "transport":
    case "vehicle":
      return "MOVEMENT";
    default:
      return null;
  }
}

function observationTypeToFlowDomain(
  type: Observation["type"],
): FlowDomain | null {
  switch (type) {
    case "FINANCIAL":
      return "FINANCIAL";
    case "COMMUNICATION":
      return "COMMUNICATION";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Segments and gaps
// ---------------------------------------------------------------------------

export interface FlowSegment {
  /** `seg:<relationId>` — unique across the whole model */
  readonly id: string;
  readonly relationId: string;
  readonly domain: FlowDomain;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  /** lifecycle status; REJECTED/REVERSED never produce a segment */
  readonly status: RelationHypothesis["status"];
  readonly evidenceObservationIds: readonly string[];
  readonly contradictionIds: readonly string[];
  /** per-currency aggregates across evidence observations; never summed */
  readonly amounts: readonly FlowAmount[];
  readonly mixedCurrencies: boolean;
  readonly hasAmount: boolean;
  readonly observationCount: number;
  readonly conflict: boolean;
  /** dominant amount total (largest single currency), for width scaling */
  readonly dominantTotal: number;
  /** scoped interval from the relation's temporalInterval, if fully timelined */
  readonly temporalInterval: { readonly startMs: number; readonly endMs: number } | null;
}

export interface FlowGap {
  /** `gap:<observationId>` */
  readonly id: string;
  readonly observationId: string;
  readonly sourceEntityId: string;
  readonly domain: FlowDomain;
  readonly amount: FlowAmount | null;
  readonly observedMs: number | null;
  readonly note: string;
}

// ---------------------------------------------------------------------------
// Entity roles (within the filtered segment set)
// ---------------------------------------------------------------------------

export interface FlowEntity {
  readonly entityId: string;
  readonly label: string;
  readonly role: FlowEntityRole;
  readonly inCount: number;
  readonly outCount: number;
  readonly observationCount: number;
  /** flows deliver/take-away amounts per currency (never mixed-summed) */
  readonly inFlow: readonly FlowAmount[];
  readonly outFlow: readonly FlowAmount[];
  /** present in cross-case match records (count-only at Zone 5) */
  readonly crossCase: boolean;
}

// ---------------------------------------------------------------------------
// Deterministic layered layout
// ---------------------------------------------------------------------------

export interface FlowLayoutNode {
  /** layout node id: `ent:<entityId>` or `gap:<id>` */
  readonly id: string;
  readonly kind: "entity" | "gap";
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly layer: number;
  readonly role: FlowEntityRole;
}

export interface FlowLayoutEdge {
  readonly id: string;
  readonly segmentId: string | null;
  readonly gapId: string | null;
  readonly sourceId: string;
  readonly targetId: string;
  /** cubic-bezier path in layout coordinates */
  readonly d: string;
  readonly width: number;
  readonly color: string;
  readonly dashed: boolean;
  readonly domain: FlowDomain;
}

export interface FlowLayout {
  readonly nodes: readonly FlowLayoutNode[];
  readonly edges: readonly FlowLayoutEdge[];
  readonly width: number;
  readonly height: number;
}

// ---------------------------------------------------------------------------
// Top-level model
// ---------------------------------------------------------------------------

export interface FlowMeta {
  readonly status: FlowStatus;
  readonly error: Error | null;
  /** modes with at least one segment anywhere in the case */
  readonly availableModes: readonly FlowDomain[];
  /** effective mode (selection honored only when available) */
  readonly mode: FlowDomain | null;
  readonly roleFilter: FlowRoleFilter;
  readonly segments: readonly FlowSegment[];
  readonly gaps: readonly FlowGap[];
  readonly entities: readonly FlowEntity[];
  readonly layout: FlowLayout | null;
  readonly observedAmounts: readonly FlowAmount[];
  readonly segmentCount: number;
  readonly gapCount: number;
  readonly conflictCount: number;
  readonly entityCount: number;
  readonly pathCount: number;
  readonly crossCaseCount: number;
  /** Live backend path corroboration (PR-23): number of connecting paths the
   *  backend itself confirmed between flow segment endpoint pairs, or null when
   *  NO live backend path seam was available (clean integration, never treated
   *  as a verdict — a null count is "not queried", NOT "zero paths"). */
  readonly backendPathCount: number | null;
  /** Distinct canonical entity ids appearing across backend-confirmed paths,
   *  sorted deterministically. Empty when the backend corroboration is absent. */
  readonly backendPathEntityIds: readonly string[];
  readonly summary: string;
  readonly emptyMessage: string | null;
}

export interface FlowModelInput {
  readonly nodes: readonly GraphNode[];
  readonly observations: readonly Observation[];
  readonly relations: readonly RelationHypothesis[];
  readonly timeRange: [number, number] | null;
  readonly selectedMode: FlowDomain | null;
  readonly roleFilter: FlowRoleFilter;
  readonly crossCaseEntityIds: ReadonlySet<string>;
  /** PR-23 live backend path corroboration. null = no live path seam (demo,
   *  unavailable). Empty array = backend responded but confirmed zero paths. */
  readonly backendPaths?: readonly ConnectingPathCandidateDTO[] | null;
}

const NODE_W = 132;
const NODE_H = 44;
const LAYER_GAP = 220;
const ROW_GAP = 28;
const PADDING = 36;
const BASE_QUALITATIVE_WIDTH = 4;
const MIN_WIDTH = 2;
const MAX_WIDTH = 16;
const MAX_PATHS = 2048;

function observationMs(observation: Observation): number {
  const raw = observation.observedAt?.value;
  const ms = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function intervalMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Temporal relevance for a segment. Conservative: an untimed evidence
 * observation is never treated as absence; an unscoped segment (no evidence
 * observations and no interval) is only included when no window is active,
 * because its presence inside a specific window cannot be confirmed.
 */
function segmentInTimeRange(
  segment: FlowSegment,
  observationsById: ReadonlyMap<string, Observation>,
  timeRange: [number, number] | null,
): boolean {
  if (timeRange === null) return true;
  const evidence = segment.evidenceObservationIds;
  if (evidence.length > 0) {
    return evidence.some((id) => {
      const observation = observationsById.get(id);
      return observation !== undefined && observationInTimeRange(observation, timeRange);
    });
  }
  const interval = segment.temporalInterval;
  if (interval !== null) {
    return interval.startMs <= timeRange[1] && interval.endMs >= timeRange[0];
  }
  return false;
}

function groupAmounts(
  amountFacets: readonly FlowAmount[],
): { amounts: readonly FlowAmount[]; mixedCurrencies: boolean } {
  const byCurrency = new Map<string, number>();
  const countByCurrency = new Map<string, number>();
  for (const facet of amountFacets) {
    byCurrency.set(
      facet.currency,
      (byCurrency.get(facet.currency) ?? 0) + facet.total,
    );
    countByCurrency.set(
      facet.currency,
      (countByCurrency.get(facet.currency) ?? 0) + facet.count,
    );
  }
  const amounts = [...byCurrency.entries()]
    .map(([currency, total]) => ({
      currency,
      total,
      count: countByCurrency.get(currency) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.total - a.total || a.currency.localeCompare(b.currency),
    );
  return { amounts, mixedCurrencies: amounts.length > 1 };
}

function buildGaps(
  mode: FlowDomain,
  observations: readonly Observation[],
  timeRange: [number, number] | null,
): FlowGap[] {
  const gaps: FlowGap[] = [];
  for (const observation of observations) {
    const domain = observationTypeToFlowDomain(observation.type);
    if (domain !== mode) continue;
    if (!observationFlowGap(observation)) continue;
    if (observation.entityIds.length < 1) continue;
    if (timeRange !== null) {
      const ms = observationMs(observation);
      if (!Number.isFinite(ms)) continue;
      if (ms < timeRange[0] || ms > timeRange[1]) continue;
    }
    const amount = observationFlowAmount(observation);
    if (amount === null) continue;
    gaps.push({
      id: `gap:${observation.id}`,
      observationId: observation.id,
      sourceEntityId: observation.entityIds[0]!,
      domain,
      amount,
      observedMs: Number.isFinite(observationMs(observation))
        ? observationMs(observation)
        : null,
      note: "Flew out to an unobserved destination",
    });
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// Layered longest-path + barycenter layout (deterministic)
// ---------------------------------------------------------------------------

function computeLayers(
  nodes: readonly string[],
  edges: readonly { source: string; target: string }[],
): Map<string, number> {
  const nodeSet = new Set(nodes);
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const node of nodes) {
    outgoing.set(node, []);
    incoming.set(node, []);
  }
  for (const edge of edges) {
    if (!nodeSet.has(edge.source) || !nodeSet.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    outgoing.get(edge.source)!.push(edge.target);
    incoming.get(edge.target)!.push(edge.source);
  }

  const layer = new Map<string, number>();
  for (const node of nodes) layer.set(node, 0);

  // Longest-path relaxation with a bounded iteration cap so cycles terminate
  // deterministically (financial chains in the demo are a DAG).
  const cap = nodes.length + 1;
  for (let pass = 0; pass < cap; pass += 1) {
    let changed = false;
    for (const node of nodes) {
      let next = layer.get(node)!;
      for (const pred of incoming.get(node)!) {
        const candidate = layer.get(pred)! + 1;
        if (candidate > next) next = candidate;
      }
      if (next !== layer.get(node)) {
        layer.set(node, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return layer;
}

function stableCompare(a: string, b: string): number {
  return a.length === b.length
    ? a < b
      ? -1
      : a > b
        ? 1
        : 0
    : a.length - b.length;
}

/**
 * Sorts nodes within each layer by barycenter over neighbours then label.
 * Two forward passes are enough for the demo-scale DAGs; the result is a
 * pure function of the input ordering, so it stays reproducible.
 */
function orderByBarycenter(
  nodes: readonly string[],
  edges: readonly { source: string; target: string }[],
  layer: ReadonlyMap<string, number>,
): Map<string, number> {
  const order = new Map<string, number>();
  const byLayer = new Map<number, string[]>();
  for (const node of nodes) {
    const l = layer.get(node) ?? 0;
    const bucket = byLayer.get(l) ?? [];
    bucket.push(node);
    byLayer.set(l, bucket);
  }

  const neighbourIndex = (a: string, b: string) => {
    for (const edge of edges) {
      if (edge.source === a && edge.target === b) return true;
      if (edge.source === b && edge.target === a) return true;
    }
    return false;
  };

  for (let pass = 0; pass < 2; pass += 1) {
    const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b);
    for (const l of sortedLayers) {
      const bucket = byLayer.get(l)!;
      bucket.sort((a, b) => {
        const baryA = barycenter(a, l, byLayer, order, neighbourIndex);
        const baryB = barycenter(b, l, byLayer, order, neighbourIndex);
        return baryA === baryB ? stableCompare(a, b) : baryA - baryB;
      });
    }
  }

  for (const bucket of byLayer.values()) {
    bucket.sort((a, b) => stableCompare(a, b));
  }

  let index = 0;
  const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b);
  for (const l of sortedLayers) {
    for (const node of byLayer.get(l)!) {
      order.set(node, index);
      index += 1;
    }
  }
  return order;
}

function barycenter(
  node: string,
  layer: number,
  byLayer: ReadonlyMap<number, string[]>,
  order: ReadonlyMap<string, number>,
  linked: (a: string, b: string) => boolean,
): number {
  const neighbours: number[] = [];
  const prevLayer = byLayer.get(layer - 1) ?? [];
  const nextLayer = byLayer.get(layer + 1) ?? [];
  for (const candidate of prevLayer) {
    if (linked(node, candidate) && order.has(candidate)) {
      neighbours.push(order.get(candidate)!);
    }
  }
  for (const candidate of nextLayer) {
    if (linked(node, candidate) && order.has(candidate)) {
      neighbours.push(order.get(candidate)!);
    }
  }
  if (neighbours.length === 0) return Number.MAX_SAFE_INTEGER;
  const sum = neighbours.reduce((acc, v) => acc + v, 0);
  return sum / neighbours.length;
}

function bezierD(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  bend: number,
): string {
  const c1x = sx + bend;
  const c2x = tx - bend;
  return (
    `M ${sx.toFixed(2)} ${sy.toFixed(2)} ` +
    `C ${c1x.toFixed(2)} ${sy.toFixed(2)}, ${c2x.toFixed(2)} ${ty.toFixed(2)}, ` +
    `${tx.toFixed(2)} ${ty.toFixed(2)}`
  );
}

function buildLayout(
  segments: readonly FlowSegment[],
  gaps: readonly FlowGap[],
  entityLabels: ReadonlyMap<string, string>,
  roleByEntity: ReadonlyMap<string, FlowEntityRole>,
): FlowLayout | null {
  const entityIds = new Set<string>();
  for (const segment of segments) {
    entityIds.add(segment.sourceEntityId);
    entityIds.add(segment.targetEntityId);
  }
  for (const gap of gaps) entityIds.add(gap.sourceEntityId);

  if (entityIds.size === 0) return null;

  const roleFor = (entityId: string): FlowEntityRole =>
    roleByEntity.get(entityId) ?? "destinations";

  // Edges from segments, plus dashed gap edges.
  const baseEdges: { source: string; target: string }[] = [];
  for (const segment of segments) {
    baseEdges.push({ source: segment.sourceEntityId, target: segment.targetEntityId });
  }
  for (const gap of gaps) {
    baseEdges.push({ source: gap.sourceEntityId, target: gap.id });
  }

  const allNodeIds = [...entityIds, ...gaps.map((g) => g.id)];
  const layers = computeLayers(allNodeIds, baseEdges);

  for (const gap of gaps) {
    const originLayer = layers.get(gap.sourceEntityId) ?? 0;
    layers.set(gap.id, originLayer + 1);
  }

  const order = orderByBarycenter(allNodeIds, baseEdges, layers);

  // Layout nodes: entities plus gap pseudo-destinations.
  const layoutNodes: FlowLayoutNode[] = [];
  for (const id of [...entityIds].sort(stableCompare)) {
    const layer = layers.get(id) ?? 0;
    const row = order.get(id) ?? 0;
    layoutNodes.push({
      id: `ent:${id}`,
      kind: "entity",
      label: entityLabels.get(id) ?? id,
      x: PADDING + layer * (NODE_W + LAYER_GAP),
      y: PADDING + row * (NODE_H + ROW_GAP),
      w: NODE_W,
      h: NODE_H,
      layer,
      role: roleFor(id),
    });
  }

  // Gap pseudo-nodes.
  for (const gap of gaps) {
    const layer = layers.get(gap.id) ?? 0;
    const row = order.get(gap.id) ?? 0;
    layoutNodes.push({
      id: gap.id,
      kind: "gap",
      label: "Unknown destination",
      x: PADDING + layer * (NODE_W + LAYER_GAP),
      y: PADDING + row * (NODE_H + ROW_GAP),
      w: NODE_W,
      h: NODE_H,
      layer,
      role: "destinations",
    });
  }

  const nodeById = new Map(layoutNodes.map((node) => [node.id, node]));

  // Width: bounded log scaling on dominant-currency totals.
  let maxTotal = 0;
  for (const segment of segments) {
    if (segment.dominantTotal > maxTotal) maxTotal = segment.dominantTotal;
  }
  const scaleWidth = (total: number): number => {
    if (maxTotal <= 0 || total <= 0) return BASE_QUALITATIVE_WIDTH;
    const ratio = Math.log1p(total) / Math.log1p(maxTotal);
    return MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * ratio;
  };

  const layoutEdges: FlowLayoutEdge[] = [];
  for (const segment of segments) {
    const source = nodeById.get(`ent:${segment.sourceEntityId}`);
    const target = nodeById.get(`ent:${segment.targetEntityId}`);
    if (!source || !target || source === target) continue;
    const sx = source.x + source.w;
    const sy = source.y + source.h / 2;
    const tx = target.x;
    const ty = target.y + target.h / 2;
    const bend = Math.max(30, (tx - sx) * 0.5);
    const width = Number(scaleWidth(segment.dominantTotal).toFixed(2));
    layoutEdges.push({
      id: `edge:${segment.id}`,
      segmentId: segment.id,
      gapId: null,
      sourceId: source.id,
      targetId: target.id,
      d: bezierD(sx, sy, tx, ty, bend),
      width,
      color: FLOW_DOMAIN_COLORS[segment.domain],
      dashed: segment.status === "PROPOSED",
      domain: segment.domain,
    });
  }
  for (const gap of gaps) {
    const source = nodeById.get(`ent:${gap.sourceEntityId}`);
    const target = nodeById.get(gap.id);
    if (!source || !target) continue;
    const sx = source.x + source.w;
    const sy = source.y + source.h / 2;
    const tx = target.x;
    const ty = target.y + target.h / 2;
    const bend = Math.max(30, (tx - sx) * 0.5);
    layoutEdges.push({
      id: `edge:${gap.id}`,
      segmentId: null,
      gapId: gap.id,
      sourceId: source.id,
      targetId: target.id,
      d: bezierD(sx, sy, tx, ty, bend),
      width: BASE_QUALITATIVE_WIDTH,
      color: "var(--color-surface-400)",
      dashed: true,
      domain: gap.domain,
    });
  }

  let maxX = 0;
  let maxY = 0;
  for (const node of layoutNodes) {
    maxX = Math.max(maxX, node.x + node.w);
    maxY = Math.max(maxY, node.y + node.h);
  }

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    width: maxX + PADDING,
    height: maxY + PADDING,
  };
}

// ---------------------------------------------------------------------------
// Path counting (distinct source → terminal chains, capped, deterministic)
// ---------------------------------------------------------------------------

function countPaths(
  segments: readonly FlowSegment[],
  gaps: readonly FlowGap[],
  timeRange: [number, number] | null,
): number {
  if (timeRange === null && gaps.length === 0 && segments.length === 0) return 0;

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const addNode = (id: string) => {
    if (!outgoing.has(id)) outgoing.set(id, []);
    if (!incoming.has(id)) incoming.set(id, []);
  };
  for (const segment of segments) {
    addNode(segment.sourceEntityId);
    addNode(segment.targetEntityId);
    outgoing.get(segment.sourceEntityId)!.push(segment.targetEntityId);
    incoming.get(segment.targetEntityId)!.push(segment.sourceEntityId);
  }
  for (const gap of gaps) {
    addNode(gap.sourceEntityId);
    addNode(gap.id);
    outgoing.get(gap.sourceEntityId)!.push(gap.id);
    incoming.get(gap.id)!.push(gap.sourceEntityId);
  }

  const sources = [...outgoing.keys()]
    .filter((id) => (incoming.get(id)?.length ?? 0) === 0)
    .sort(stableCompare);

  const memo = new Map<string, number>();
  const visit = (id: string, active: ReadonlySet<string>): number => {
    if (memo.has(id) && (incoming.get(id)?.length ?? 0) <= 1) {
      return memo.get(id)!;
    }
    const next = outgoing.get(id) ?? [];
    if (next.length === 0) return 1;
    if (active.has(id)) return 0;
    const nextActive = new Set(active);
    nextActive.add(id);
    let total = 0;
    for (const target of [...next].sort(stableCompare)) {
      total += visit(target, nextActive);
      if (total > MAX_PATHS) return MAX_PATHS;
    }
    memo.set(id, total);
    return total;
  };

  let total = 0;
  for (const source of sources) {
    total += visit(source, new Set());
    if (total > MAX_PATHS) return MAX_PATHS;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Amount aggregation and display helpers
// ---------------------------------------------------------------------------

export function sumAmounts(amounts: readonly FlowAmount[]): readonly FlowAmount[] {
  const byCurrency = new Map<string, number>();
  const countByCurrency = new Map<string, number>();
  for (const amount of amounts) {
    byCurrency.set(
      amount.currency,
      (byCurrency.get(amount.currency) ?? 0) + amount.total,
    );
    countByCurrency.set(
      amount.currency,
      (countByCurrency.get(amount.currency) ?? 0) + amount.count,
    );
  }
  return [...byCurrency.entries()]
    .map(([currency, total]) => ({
      currency,
      total,
      count: countByCurrency.get(currency) ?? 0,
    }))
    .sort(
      (a, b) => b.total - a.total || a.currency.localeCompare(b.currency),
    );
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "\u20B9",
  USD: "$",
  EUR: "\u20AC",
  GBP: "\u00A3",
};

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `;
}

function groupDigits(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** "₹250,000" — full precision, read-only formatting. */
export function formatFlowAmount(value: number, currency: string): string {
  const symbol = currencySymbol(currency);
  return `${symbol}${groupDigits(Math.round(value))}`;
}

/** "₹250K" — compact for tight UI rails. */
export function formatFlowAmountCompact(value: number, currency: string): string {
  const symbol = currencySymbol(currency);
  if (value >= 1_000_000_000) {
    return `${symbol}${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (value >= 1_000_000) {
    return `${symbol}${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) {
    return `${symbol}${(value / 1_000).toFixed(0)}K`;
  }
  return `${symbol}${Math.round(value)}`;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildFlowModel(input: FlowModelInput): FlowMeta {
  const observationsById = new Map(
    input.observations.map((observation) => [observation.id, observation]),
  );
  const nodeLabels = new Map(
    input.nodes.map((node) => [node.entityId ?? node.id, node.label]),
  );

  // ---- segments from directed, actionable relation hypotheses -------------
  const segmentsByDomain = new Map<FlowDomain, FlowSegment[]>();
  for (const relation of input.relations) {
    if (!relation.directed) continue;
    if (relation.status !== "PROPOSED" && relation.status !== "ACCEPTED") continue;
    const domain = relationTypeToFlowDomain(relation.relationType);
    if (domain === null) continue;
    const amountFacets = relation.evidenceBasis
      .map((id) => observationsById.get(id))
      .filter((observation): observation is Observation => observation !== undefined)
      .map(observationFlowAmount)
      .filter((amount): amount is FlowAmount => amount !== null);
    const { amounts, mixedCurrencies } = groupAmounts(amountFacets);
    const observationCount = relation.evidenceBasis.length;
    const conflict = (relation.contradictions?.length ?? 0) > 0;
    const intervalStart = intervalMs(relation.temporalInterval?.validFrom?.value);
    const intervalEnd = intervalMs(relation.temporalInterval?.validTo?.value);
    const temporalInterval =
      intervalStart !== null && intervalEnd !== null
        ? { startMs: intervalStart, endMs: intervalEnd }
        : null;

    const segments = segmentsByDomain.get(domain) ?? [];
    segments.push({
      id: `seg:${relation.id}`,
      relationId: relation.id,
      domain,
      sourceEntityId: relation.sourceEntityId,
      targetEntityId: relation.targetEntityId,
      status: relation.status,
      evidenceObservationIds: relation.evidenceBasis,
      contradictionIds: relation.contradictions ?? [],
      amounts,
      mixedCurrencies,
      hasAmount: amounts.length > 0,
      observationCount,
      conflict,
      dominantTotal: amounts.length > 0 ? amounts[0]!.total : 0,
      temporalInterval,
    });
    segmentsByDomain.set(domain, segments);
  }

  const availableModes = FLOW_DOMAINS.filter(
    (domain) => (segmentsByDomain.get(domain)?.length ?? 0) > 0,
  );

  if (availableModes.length === 0) {
    return {
      status: "no-flow-data",
      error: null,
      availableModes: [],
      mode: null,
      roleFilter: input.roleFilter,
      segments: [],
      gaps: [],
      entities: [],
      layout: null,
      observedAmounts: [],
      segmentCount: 0,
      gapCount: 0,
      conflictCount: 0,
      entityCount: 0,
      pathCount: 0,
      crossCaseCount: 0,
      backendPathCount: null,
      backendPathEntityIds: [],
      summary: "No directional flow evidence was found for this case.",
      emptyMessage: "No flow data",
    };
  }

  const mode =
    input.selectedMode !== null && availableModes.includes(input.selectedMode)
      ? input.selectedMode
      : availableModes[0]!;

  // ---- window filtering ---------------------------------------------------
  const allSegments = segmentsByDomain.get(mode) ?? [];
  const windowSegments = allSegments.filter((segment) =>
    segmentInTimeRange(segment, observationsById, input.timeRange),
  );
  const gaps = buildGaps(mode, input.observations, input.timeRange);

  if (windowSegments.length === 0 && gaps.length === 0) {
    return {
      status: "no-flow-in-window",
      error: null,
      availableModes,
      mode,
      roleFilter: input.roleFilter,
      segments: [],
      gaps: [],
      entities: [],
      layout: null,
      observedAmounts: [],
      segmentCount: 0,
      gapCount: 0,
      conflictCount: 0,
      entityCount: 0,
      pathCount: 0,
      crossCaseCount: 0,
      backendPathCount: null,
      backendPathEntityIds: [],
      summary: `No ${FLOW_DOMAIN_LABELS[mode].toLowerCase()} flow sits inside the selected window.`,
      emptyMessage: "No flow in selected window",
    };
  }

  // ---- roles within the window/mode segment set ---------------------------
  const inCount = new Map<string, number>();
  const outCount = new Map<string, number>();
  const addEndpoint = (map: Map<string, number>, id: string) => {
    map.set(id, (map.get(id) ?? 0) + 1);
  };
  for (const segment of windowSegments) {
    addEndpoint(outCount, segment.sourceEntityId);
    addEndpoint(inCount, segment.targetEntityId);
  }
  for (const gap of gaps) addEndpoint(outCount, gap.sourceEntityId);

  const entityIds = new Set([
    ...inCount.keys(),
    ...outCount.keys(),
  ]);
  const roleByEntity = new Map<string, FlowEntityRole>();
  for (const id of [...entityIds].sort(stableCompare)) {
    const hasIn = (inCount.get(id) ?? 0) > 0;
    const hasOut = (outCount.get(id) ?? 0) > 0;
    roleByEntity.set(
      id,
      hasIn && hasOut ? "intermediaries" : hasIn ? "destinations" : "sources",
    );
  }
  const roleFor = (role: FlowEntityRole): FlowRoleFilter =>
    role === "sources" ? "sources" : role === "destinations" ? "destinations" : "intermediaries";

  // ---- role filter --------------------------------------------------------
  const filterSegments = (): FlowSegment[] => {
    if (input.roleFilter === "all") return windowSegments;
    return windowSegments.filter((segment) => {
      const sourceRole = roleFor(roleByEntity.get(segment.sourceEntityId) ?? "sources");
      const targetRole = roleFor(roleByEntity.get(segment.targetEntityId) ?? "destinations");
      return sourceRole === input.roleFilter || targetRole === input.roleFilter;
    });
  };
  const filterGaps = (): FlowGap[] => {
    if (input.roleFilter === "all") return gaps;
    return gaps.filter((gap) => {
      const originRole = roleFor(roleByEntity.get(gap.sourceEntityId) ?? "sources");
      return originRole === input.roleFilter || input.roleFilter === "destinations";
    });
  };

  const filteredSegments = filterSegments();
  const filteredGaps = filterGaps();

  // ---- entity rows --------------------------------------------------------
  const segmentsByEntityOut = new Map<string, FlowSegment[]>();
  const segmentsByEntityIn = new Map<string, FlowSegment[]>();
  for (const segment of windowSegments) {
    const out = segmentsByEntityOut.get(segment.sourceEntityId) ?? [];
    out.push(segment);
    segmentsByEntityOut.set(segment.sourceEntityId, out);
    const inn = segmentsByEntityIn.get(segment.targetEntityId) ?? [];
    inn.push(segment);
    segmentsByEntityIn.set(segment.targetEntityId, inn);
  }

  const entities: FlowEntity[] = [...entityIds]
    .sort(stableCompare)
    .map((id) => {
      const role = roleByEntity.get(id)!;
      const outSegments = segmentsByEntityOut.get(id) ?? [];
      const inSegments = segmentsByEntityIn.get(id) ?? [];
      const observationCount = new Set([
        ...inSegments.flatMap((s) => s.evidenceObservationIds),
        ...outSegments.flatMap((s) => s.evidenceObservationIds),
      ]).size;
      return {
        entityId: id,
        label: nodeLabels.get(id) ?? id,
        role,
        inCount: inSegments.length,
        outCount: outSegments.length,
        observationCount,
        inFlow: sumAmounts(inSegments.flatMap((s) => s.amounts)),
        outFlow: sumAmounts(outSegments.flatMap((s) => s.amounts)),
        crossCase: input.crossCaseEntityIds.has(id),
      };
    });

  // ---- observed amounts (all currencies, separately) ----------------------
  const observedAmounts = sumAmounts(
    windowSegments.flatMap((s) => s.amounts),
  );

  // ---- layout + paths ------------------------------------------------------
  const layout = buildLayout(
    filteredSegments,
    filteredGaps,
    nodeLabels,
    roleByEntity,
  );
  const pathCount = countPaths(windowSegments, gaps, input.timeRange);

  const segmentCount = filteredSegments.length;
  const gapCount = filteredGaps.length;
  const conflictCount = filteredSegments.filter((s) => s.conflict).length;
  const entityCount = entityIds.size;
  const crossCaseCount = [...entityIds].filter((id) =>
    input.crossCaseEntityIds.has(id),
  ).length;

  const amountsLabel =
    observedAmounts.length > 0
      ? ` \u00B7 ${observedAmounts
          .map((a) => formatFlowAmount(a.total, a.currency))
          .join(" + ")} observed`
      : "";

  // ---- PR-23 live backend path corroboration (narration only) --------------
  // backendPaths is null when the live path seam was absent/unavailable; an
  // empty array is an authoritative "no connecting path" answer and IS counted.
  const backendPaths = input.backendPaths === null || input.backendPaths === undefined
    ? null
    : input.backendPaths;
  const backendPathCount = backendPaths === null ? null : backendPaths.length;
  const backendPathEntityIds = backendPaths === null
    ? []
    : [...new Set(backendPaths.flatMap((path) =>
        [path.startNodeId, path.targetNodeId, ...path.nodes.map((n) => n.nodeId)]
      ))].sort((a, b) => a.localeCompare(b));

  const backendLabel =
    backendPathCount === null
      ? ""
      : ` \u00B7 ${backendPathCount} backend-confirmed path${backendPathCount === 1 ? "" : "s"}`;

  const summary =
    `${FLOW_DOMAIN_LABELS[mode]} \u00B7 ${segmentCount} flow segment` +
    `${segmentCount === 1 ? "" : "s"} \u00B7 ${pathCount} active path` +
    `${pathCount === 1 ? "" : "s"}${amountsLabel}${backendLabel}`;

  return {
    status: "ready",
    error: null,
    availableModes,
    mode,
    roleFilter: input.roleFilter,
    segments: filteredSegments,
    gaps: filteredGaps,
    entities,
    layout,
    observedAmounts,
    segmentCount,
    gapCount,
    conflictCount,
    entityCount,
    pathCount,
    crossCaseCount,
    backendPathCount,
    backendPathEntityIds,
    summary,
    emptyMessage: null,
  };
}

// ---------------------------------------------------------------------------
// Context bridge — flow selections reuse the canonical InvestigativeContext.
// Selecting is NOT focusing: a picked segment resolves to its relation id and
// the shell owns rematerializing focus/reveal via the context actions.
// ---------------------------------------------------------------------------

import type { InvestigativeContext } from "@/lib/context/investigative-context";

export function flowContextForRelation(relationId: string): InvestigativeContext {
  return { kind: "relation", id: relationId, source: "flow" };
}

export function flowContextForEntity(entityId: string): InvestigativeContext {
  return { kind: "entity", id: entityId, source: "flow" };
}

export function flowContextForGap(gap: FlowGap): InvestigativeContext {
  return { kind: "observation", id: gap.observationId, source: "flow" };
}

/** Reverse mapping: an active flow selection → segment, or null. */
export function flowSegmentFromContext(
  segments: readonly FlowSegment[],
  context: InvestigativeContext | null,
): FlowSegment | null {
  if (!context || context.source !== "flow" || context.kind !== "relation") {
    return null;
  }
  return segments.find((segment) => segment.relationId === context.id) ?? null;
}

/** Reverse mapping: an active flow selection → entity, or null. */
export function flowEntityFromContext(
  entities: readonly FlowEntity[],
  context: InvestigativeContext | null,
): FlowEntity | null {
  if (!context || context.source !== "flow" || context.kind !== "entity") {
    return null;
  }
  return entities.find((entity) => entity.entityId === context.id) ?? null;
}