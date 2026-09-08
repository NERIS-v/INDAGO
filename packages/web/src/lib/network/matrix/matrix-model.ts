// ============================================================================
// F-PR7 — Cross-Case Matrix: pure, deterministic relationship/cross-case model.
//
// ONE reusable matrix with two modes (within-case, cross-case) — never two
// engines. Every non-empty cell must trace to a provider-backed signal:
//   - within-case cells derive from observations (shared entityIds), relation
//     hypotheses (source/target pair + evidence basis) and the contradiction /
//     identity-resolution seams.
//   - cross-case cells derive from CrossCaseMatch target cases/entities and
//     foreign-case overlays. bridgeSupport / overlay presence is NOT promoted
//     into cell values (it is an unanchored overlay fact, not a pair signal).
//
// HONESTY RULES (locked for F-PR7):
//   - No fabricated signal classes, scores, "risk" or probabilities are ever
//     computed. A cell is empty unless a provider object justifies a signal.
//   - A bright cell means "evidence suggests a candidate relationship worth
//     investigating" — NEVER "confirmed connected".
//   - Cross-case candidate cells are authorization-gated: until the boundary
//     is authorized, cells render empty and only a count of hidden candidates
//     is exposed (matching the existing cross-case authorization fiction).
//   - The shared workspace timeRange IS the temporal controller: within-case
//     signals filter by in-window observations; a cell whose qualifying
//     observations vanish from the window becomes empty. Cross-case matches are
//     comparison records (not event-timed), so they are windows-invariant and
//     that is stated, not hidden.
//
// Determinism contract: identical inputs ⇒ identical ordering/cells/geometry.
// No Math.random, no Date.now, no unseeded noise.
//
// PURE module: no React, no provider imports (source-guard safe).
// ============================================================================

import type {
  CrossCaseMatch,
  GraphNode,
  Observation,
  RelationHypothesis,
} from "@indago/contracts";
import type { NetworkTimeRange } from "@/lib/network/network-workspace";
import type {
  ForeignCaseOverlay,
  IntelligenceCandidateView,
  ObservationContradiction,
} from "@/lib/providers/types";
import { observationInTimeRange } from "@/lib/network/pulse/pulse-model";
import type { InvestigativeContext } from "@/lib/context/investigative-context";

// ---------------------------------------------------------------------------
// Modes and cell states
// ---------------------------------------------------------------------------

export type MatrixMode = "within-case" | "cross-case";

/**
 * Cross-case authorization step for a comparison boundary. This is a PURE
 * frontend review fiction (idle → confirming → authorized) mirroring the
 * existing cross-case signals seam — there is no provider authorization
 * method. Until a boundary is authorized its candidate cells render empty and
 * only a count of hidden candidates is exposed.
 */
export type MatrixAuthStep = "idle" | "confirming" | "authorized";

/**
 * Cell semantics — investigative signal states, NEVER guilt or probability.
 *  - empty        no relevant relationship signal (or gated by authorization)
 *  - candidate    ≥1 signal exists; relationship unresolved
 *  - multi-signal ≥2 distinct signal classes (independent lines of signal)
 *  - conflict     a supporting observation is contradicted by another one
 */
export type MatrixCellState = "empty" | "candidate" | "multi-signal" | "conflict";

export const MATRIX_CELL_STATE_LABELS: Record<MatrixCellState, string> = {
  empty: "No signal",
  candidate: "Candidate",
  "multi-signal": "Multiple signals",
  conflict: "Conflict / review",
};

export const MATRIX_MODES: readonly MatrixMode[] = ["within-case", "cross-case"] as const;

export const MATRIX_MODE_LABELS: Record<MatrixMode, string> = {
  "within-case": "Within case",
  "cross-case": "Cross case",
};

// ---------------------------------------------------------------------------
// Signal classes (independent relationship/evidence lines)
// ---------------------------------------------------------------------------

export type MatrixSignalClass =
  | "COMMUNICATION"
  | "FINANCIAL"
  | "LOCATION"
  | "IDENTITY"
  | "ORGANIZATION"
  | "TEMPORAL"
  | "VEHICLE"
  | "RELATIONAL"
  | "OTHER";

export const MATRIX_SIGNAL_CLASS_LABELS: Record<MatrixSignalClass, string> = {
  COMMUNICATION: "Communication",
  FINANCIAL: "Financial",
  LOCATION: "Location",
  IDENTITY: "Identity",
  ORGANIZATION: "Organization",
  TEMPORAL: "Temporal",
  VEHICLE: "Vehicle",
  RELATIONAL: "Relational",
  OTHER: "Other",
};

export type MatrixSignalSourceKind = "observation" | "relation" | "match";

export function observationToSignalClass(
  type: Observation["type"],
): MatrixSignalClass {
  switch (type) {
    case "COMMUNICATION":
      return "COMMUNICATION";
    case "FINANCIAL":
      return "FINANCIAL";
    case "SPATIAL":
      return "LOCATION";
    case "TEMPORAL":
      return "TEMPORAL";
    case "IDENTITY":
      return "IDENTITY";
    case "RELATIONAL":
      return "ORGANIZATION";
    default:
      return "OTHER";
  }
}

export function relationToSignalClass(
  type: RelationHypothesis["relationType"],
): MatrixSignalClass {
  switch (type) {
    case "communication":
      return "COMMUNICATION";
    case "financial":
      return "FINANCIAL";
    case "co-location":
      return "LOCATION";
    case "transport":
    case "vehicle":
      return "VEHICLE";
    case "ownership":
    case "organizational":
      return "ORGANIZATION";
    case "case-link":
    case "association":
      return "RELATIONAL";
    default:
      return "OTHER";
  }
}

/** Match a cross-case sharedEvidenceTypes string onto a signal class. */
export function matchEvidenceToSignalClass(
  raw: string,
): MatrixSignalClass {
  const upper = raw.toUpperCase();
  if (upper in MATRIX_SIGNAL_CLASS_LABELS) return upper as MatrixSignalClass;
  return "OTHER";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatrixSignal {
  readonly class: MatrixSignalClass;
  readonly classLabel: string;
  /** Provider observation ids backing this signal (empty for pure overlays). */
  readonly observationIds: readonly string[];
  readonly count: number;
  readonly sourceKind: MatrixSignalSourceKind;
  /** Short honest provenance, e.g. "Relation REL_1 · evidence OBS_8". */
  readonly provenance: string;
}

export interface MatrixEntityColumn {
  readonly entityId: string;
  readonly label: string;
  readonly caseId: string;
  /** Row/column boundary display label (e.g. "Case A", overlay title). */
  readonly caseLabel: string;
  readonly structuralImportance: number;
}

export interface MatrixCell {
  readonly rowEntityId: string;
  readonly colEntityId: string;
  /** Diagonal identity cells are never relationship candidates. */
  readonly self: boolean;
  readonly state: MatrixCellState;
  readonly stateLabel: string;
  readonly signals: readonly MatrixSignal[];
  readonly observationIds: readonly string[];
  readonly contradictionPresent: boolean;
  readonly contradictionNote: string | null;
  /** Identity comparison unresolved for a participating entity. */
  readonly unresolved: boolean;
  readonly unresolvedNote: string | null;
  /** Observed signal window [minMs, maxMs], or null when not event-timed. */
  readonly window: readonly [number, number] | null;
  /** Accessible description of the cell ("why/what", never a verdict). */
  readonly ariaDescription: string;
  /** Cross-case candidate provenance note (match-backed only). */
  readonly candidateNote: string | null;
  /** Vague (non-direct) reading of why a cross-case cell lights up: the row
   *  entity is the suspected hidden link between the two files. Never a
   *  finding — only an investigative lead. Null outside match-lit cross-case
   *  cells. */
  readonly hiddenLinkTheory: string | null;
}

export interface MatrixMeta {
  readonly mode: MatrixMode;
  /** Case-A entity rows (and within-case columns). Deterministic order. */
  readonly rows: readonly MatrixEntityColumn[];
  /** Cross-case columns: the comparison boundary's foreign entities. */
  readonly columns: readonly MatrixEntityColumn[];
  readonly cells: readonly MatrixCell[];
  readonly boundaryCaseId: string | null;
  readonly boundaryLabel: string | null;
  /** True when the selected boundary is in the authorized set. */
  readonly authorized: boolean;
  /** Cross-case candidate cells gated behind authorization (0 when n/a). */
  readonly hiddenCandidateCount: number;
  /** Distinct signal classes across non-empty cells (cross-case summary). */
  readonly distinctSignalClasses: number;
  readonly inRangeObservationCount: number;
  readonly totalObservationCount: number;
  readonly windowLabel: "selected window" | "full timeline";
  readonly summary: string;
}

export interface MatrixBuildInput {
  readonly nodes: readonly GraphNode[];
  readonly observations: readonly Observation[];
  readonly relations: readonly RelationHypothesis[];
  readonly contradictions: readonly ObservationContradiction[];
  readonly candidates: readonly IntelligenceCandidateView[];
  readonly matches: readonly CrossCaseMatch[];
  readonly overlays: readonly ForeignCaseOverlay[];
  readonly caseId: string;
  readonly investigationId: string;
  readonly timeRange: NetworkTimeRange;
  readonly mode: MatrixMode;
  readonly boundaryCaseId: string | null;
  readonly authorizedBoundaries: readonly string[];
}

// ---------------------------------------------------------------------------
// Cell identity helpers (context bridge integration)
// ---------------------------------------------------------------------------

const CELL_ID_SEPARATOR = "::";

/** Deterministic selection id for a cell: `${rowEntityId}::${colEntityId}`. */
export function matrixCellId(
  mode: MatrixMode,
  rowEntityId: string,
  colEntityId: string,
): string {
  return `${mode === "within-case" ? "w" : "x"}${CELL_ID_SEPARATOR}${rowEntityId}${CELL_ID_SEPARATOR}${colEntityId}`;
}

export function parseMatrixCellId(
  id: string,
): { row: string; col: string } | null {
  const parts = id.split(CELL_ID_SEPARATOR);
  if (parts.length !== 3) return null;
  const [, row, col] = parts;
  if (!row || !col) return null;
  return { row, col };
}

/** The InvestigativeContext a cell selection rematerializes. */
export function matrixContextForCell(
  mode: MatrixMode,
  rowEntityId: string,
  colEntityId: string,
): InvestigativeContext {
  return {
    kind: mode === "within-case" ? "relation" : "cross-case",
    id: matrixCellId(mode, rowEntityId, colEntityId),
    source: "matrix",
  };
}

/** Resolve a selection back to a cell of this meta (or null). */
export function matrixCellFromContext(
  meta: MatrixMeta,
  context: InvestigativeContext | null | undefined,
): MatrixCell | null {
  if (!context) return null;
  if (context.source !== "matrix") return null;
  const expectedKind = meta.mode === "within-case" ? "relation" : "cross-case";
  if (context.kind !== expectedKind) return null;
  const parsed = parseMatrixCellId(context.id);
  if (!parsed) return null;
  return cellFor(meta, parsed.row, parsed.col);
}

export function cellFor(
  meta: MatrixMeta,
  rowEntityId: string,
  colEntityId: string,
): MatrixCell | null {
  return (
    meta.cells.find(
      (cell) =>
        cell.rowEntityId === rowEntityId && cell.colEntityId === colEntityId,
    ) ?? null
  );
}

export interface MatrixCellCounts {
  readonly active: number;
  readonly candidate: number;
  readonly multiSignal: number;
  readonly conflict: number;
}

export function matrixCellCounts(
  meta: Pick<MatrixMeta, "mode" | "cells">,
): MatrixCellCounts {
  let candidate = 0;
  let multiSignal = 0;
  let conflict = 0;
  for (const cell of meta.cells) {
    if (cell.self || cell.state === "empty") continue;
    if (cell.state === "conflict") conflict += 1;
    else if (cell.state === "multi-signal") multiSignal += 1;
    else if (cell.state === "candidate") candidate += 1;
  }
  return {
    active: candidate + multiSignal + conflict,
    candidate,
    multiSignal,
    conflict,
  };
}

// ---------------------------------------------------------------------------
// Boundary options (deterministic selectors for the comparison control)
// ---------------------------------------------------------------------------

export interface MatrixBoundaryOption {
  readonly caseId: string;
  readonly label: string;
  readonly hasMatch: boolean;
}

/**
 * The candidate comparison boundaries: cross-case match targets plus overlay
 * origination cases. Label prefers the overlay title (readable); a bare match
 * target falls back to a short case id — mirroring the existing cross-case UI.
 */
export function matrixBoundaryOptions(
  overlays: readonly ForeignCaseOverlay[],
  matches: readonly CrossCaseMatch[],
): MatrixBoundaryOption[] {
  const byCase = new Map<
    string,
    { label: string; hasMatch: boolean }
  >();
  for (const overlay of [...overlays].sort((a, b) => a.ref.localeCompare(b.ref))) {
    byCase.set(overlay.caseId, {
      label: overlay.title,
      hasMatch: byCase.get(overlay.caseId)?.hasMatch ?? false,
    });
  }
  for (const match of [...matches].sort((a, b) =>
    a.targetCaseId.localeCompare(b.targetCaseId))) {
    const existing = byCase.get(match.targetCaseId);
    byCase.set(match.targetCaseId, {
      label: existing?.label ?? `Case ${match.targetCaseId.slice(0, 8)}`,
      hasMatch: true,
    });
  }
  return [...byCase.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([caseId, option]) => ({ caseId, ...option }));
}

/** Deterministic default boundary: first match target, else first overlay case. */
export function defaultBoundaryCaseId(
  overlays: readonly ForeignCaseOverlay[],
  matches: readonly CrossCaseMatch[],
): string | null {
  if (matches.length > 0) {
    const target = minBy(matches, (match) => match.targetCaseId).targetCaseId;
    return target;
  }
  if (overlays.length > 0) return minBy(overlays, (o) => o.ref).caseId;
  return null;
}

// ---------------------------------------------------------------------------
// Window helpers
// ---------------------------------------------------------------------------

/** Compact, locale-independent date label (YYYY-MM-DD) for a ms timestamp. */
export function matrixDateLabel(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function matrixWindowLabel(
  window: readonly [number, number] | null,
): string | null {
  if (!window) return null;
  return `${matrixDateLabel(window[0])} — ${matrixDateLabel(window[1])}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function minBy<T>(items: readonly T[], key: (item: T) => string): T {
  let best: T = items[0]!;
  for (const item of items) {
    if (key(item) < key(best)) best = item;
  }
  return best;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function observationMs(observation: Observation): number {
  const raw = observation.observedAt?.value;
  const ms = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function linkedCandidateEntity(
  candidate: IntelligenceCandidateView,
): string | null {
  return candidate.leftEntity?.id ?? candidate.rightEntity?.id ?? null;
}

/** A relation participates in a window when any evidence observation is in it
 *  (conservative for evidence ids with no timestamp — absence is not proof of
 *  absence). Rejected/reversed relations are excluded (lifecycle). */
function relationInTimeRange(
  relation: RelationHypothesis,
  observationById: ReadonlyMap<string, Observation>,
  timeRange: NetworkTimeRange,
): boolean {
  if (relation.status === "REJECTED" || relation.status === "REVERSED") {
    return false;
  }
  if (timeRange === null) return true;
  if (relation.evidenceBasis.length === 0) return true;
  return relation.evidenceBasis.some((id) => {
    const observation = observationById.get(id);
    return observation
      ? observationInTimeRange(observation, timeRange)
      : true;
  });
}

function buildEntityCatalog(
  nodes: readonly GraphNode[],
  caseId: string,
): MatrixEntityColumn[] {
  return nodes
    .filter((node) => node.type === "ENTITY" && node.entityId)
    .map((node) => ({
      entityId: node.entityId ?? "",
      label: node.label,
      caseId,
      caseLabel: "Case A",
      structuralImportance: clamp01(node.structuralImportance),
    }))
    .sort(
      (a, b) =>
        b.structuralImportance - a.structuralImportance ||
        a.label.localeCompare(b.label) ||
        a.entityId.localeCompare(b.entityId),
    );
}

function obsWindowOf(
  observations: readonly Observation[],
): readonly [number, number] | null {
  if (observations.length === 0) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const observation of observations) {
    const ms = observationMs(observation);
    if (!Number.isFinite(ms)) continue;
    if (ms < min) min = ms;
    if (ms > max) max = ms;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return [min, max];
}

/** Unresolved-identity notes for a participating entity set. */
function unresolvedCaveatFor(
  candidates: readonly IntelligenceCandidateView[],
  entityIds: readonly string[],
): { unresolved: boolean; note: string | null } {
  const involved = candidates.filter((candidate) => {
    const linked = linkedCandidateEntity(candidate);
    if (!linked) return false;
    if (!entityIds.includes(linked)) return false;
    const lifecycleUnresolved =
      candidate.hypothesis.status === "UNRESOLVED" ||
      candidate.hypothesis.status === "PARTIALLY_RESOLVED";
    const comparisonUnresolved =
      candidate.comparison.comparisonStatus === "COMPARED_AND_UNRESOLVED" ||
      candidate.comparison.status === "UNRESOLVED";
    return lifecycleUnresolved || comparisonUnresolved;
  });
  if (involved.length === 0) return { unresolved: false, note: null };
  const labels = involved
    .map((candidate) => {
      const linked = linkedCandidateEntity(candidate);
      return linked ?? "";
    })
    .filter((id, index, all) => all.indexOf(id) === index)
    .slice(0, 2);
  return {
    unresolved: true,
    note: `Identity comparison unresolved for ${labels.length} entity${labels.length === 1 ? "" : "s"} in this relationship — not identity-confirmed.`,
  };
}

// ---------------------------------------------------------------------------
// Within-case builder
// ---------------------------------------------------------------------------

function buildWithinCaseCells(
  rows: readonly MatrixEntityColumn[],
  observations: readonly Observation[],
  relations: readonly RelationHypothesis[],
  contradictions: readonly ObservationContradiction[],
  candidates: readonly IntelligenceCandidateView[],
  timeRange: NetworkTimeRange,
): MatrixCell[] {
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation]),
  );
  const inRangeObservations = observations.filter((observation) =>
    observationInTimeRange(observation, timeRange),
  );

  const cells: MatrixCell[] = [];

  for (const row of rows) {
    for (const col of rows) {
      const self = row.entityId === col.entityId;
      if (self) {
        cells.push({
          rowEntityId: row.entityId,
          colEntityId: col.entityId,
          self: true,
          state: "empty",
          stateLabel: MATRIX_CELL_STATE_LABELS.empty,
          signals: [],
          observationIds: [],
          contradictionPresent: false,
          contradictionNote: null,
          unresolved: false,
          unresolvedNote: null,
          window: null,
          ariaDescription: `${row.label}: self comparison, not a relationship signal.`,
          candidateNote: null,
          hiddenLinkTheory: null,
        });
        continue;
      }

      const sharedObservations = inRangeObservations.filter(
        (observation) =>
          observation.entityIds.includes(row.entityId) &&
          observation.entityIds.includes(col.entityId),
      );
      const sharedObservationIds = sharedObservations.map((o) => o.id);

      const pairRelations = relations.filter(
        (relation) =>
          (relation.sourceEntityId === row.entityId &&
            relation.targetEntityId === col.entityId) ||
          (relation.sourceEntityId === col.entityId &&
            relation.targetEntityId === row.entityId),
      );

      // Signal grouping: observations by class, merged with relation classes.
      const signalMap = new Map<MatrixSignalClass, MatrixSignal>();
      for (const observation of sharedObservations) {
        const signalClass = observationToSignalClass(observation.type);
        const existing = signalMap.get(signalClass);
        signalMap.set(signalClass, {
          class: signalClass,
          classLabel: MATRIX_SIGNAL_CLASS_LABELS[signalClass],
          observationIds: [
            ...(existing?.observationIds ?? []),
            observation.id,
          ],
          count: (existing?.count ?? 0) + 1,
          sourceKind: "observation",
          provenance: existing?.provenance ?? "Observations shared by both entities",
        });
      }
      for (const relation of pairRelations) {
        if (
          !relationInTimeRange(relation, observationById, timeRange)
        ) {
          continue;
        }
        const signalClass = relationToSignalClass(relation.relationType);
        const evidenceInRange = relation.evidenceBasis.filter((id) => {
          const observation = observationById.get(id);
          return observation
            ? observationInTimeRange(observation, timeRange)
            : true;
        });
        const existing = signalMap.get(signalClass);
        signalMap.set(signalClass, {
          class: signalClass,
          classLabel: MATRIX_SIGNAL_CLASS_LABELS[signalClass],
          observationIds: [
            ...new Set([
              ...(existing?.observationIds ?? []),
              ...evidenceInRange,
            ]),
          ],
          count:
            (existing?.count ?? 0) +
            (existing?.sourceKind === "observation" ? 0 : 1),
          sourceKind: existing?.sourceKind === "observation"
            ? "observation"
            : "relation",
          provenance: existing?.provenance
            ? `${existing.provenance}; relation ${relation.id}`
            : `Relation ${relation.id} (${relation.relationType}, ${relation.status.toLowerCase()})`,
        });
      }
      const signals = [...signalMap.values()].sort((a, b) =>
        a.class.localeCompare(b.class));

      // Contradiction: a contradiction referencing a supporting observation.
      const contradiction = contradictions.find(
        (c) =>
          sharedObservationIds.includes(c.leftObservationId) ||
          sharedObservationIds.includes(c.rightObservationId),
      );

      // Unresolved identity comparison on either participant.
      const caveat = unresolvedCaveatFor(candidates, [
        row.entityId,
        col.entityId,
      ]);

      const window = obsWindowOf(sharedObservations);

      const observationIds = [
        ...new Set(signals.flatMap((signal) => signal.observationIds)),
      ];

      let state: MatrixCellState;
      if (signals.length === 0) {
        state = "empty";
      } else if (contradiction) {
        state = "conflict";
      } else if (signals.length >= 2) {
        state = "multi-signal";
      } else {
        state = "candidate";
      }

      const cell: MatrixCell = {
        rowEntityId: row.entityId,
        colEntityId: col.entityId,
        self: false,
        state,
        stateLabel: MATRIX_CELL_STATE_LABELS[state],
        signals,
        observationIds,
        contradictionPresent: contradiction !== undefined,
        contradictionNote: contradiction
          ? `${contradiction.leftObservationId} ↕ ${contradiction.rightObservationId}: ${contradiction.description}`
          : null,
        unresolved:
          state === "empty" ? false : caveat.unresolved,
        unresolvedNote:
          state === "empty" ? null : caveat.note,
        window,
        ariaDescription: describeCell(row, col, state, contradiction, caveat),
        candidateNote: null,
        hiddenLinkTheory: null,
      };
      cells.push(cell);
    }
  }
  return cells;
}

function describeCell(
  row: MatrixEntityColumn,
  col: MatrixEntityColumn,
  state: MatrixCellState,
  contradiction: ObservationContradiction | undefined,
  caveat: { unresolved: boolean; note: string | null },
): string {
  const parts: string[] = [
    `${row.label} to ${col.label}`,
    MATRIX_CELL_STATE_LABELS[state].toLowerCase(),
  ];
  if (state !== "empty") {
    if (contradiction) {
      parts.push("supporting and contradicting observations present");
    }
    if (caveat.unresolved) {
      parts.push("identity comparison unresolved");
    }
  }
  return parts.join("; ");
}

// ---------------------------------------------------------------------------
// Cross-case builder
// ---------------------------------------------------------------------------

function buildCrossCaseColumns(
  boundaryCaseId: string | null,
  boundaryLabel: string | null,
  matches: readonly CrossCaseMatch[],
  overlays: readonly ForeignCaseOverlay[],
): MatrixEntityColumn[] {
  if (!boundaryCaseId) return [];
  const overlay = overlays.find((o) => o.caseId === boundaryCaseId) ?? null;
  const label = boundaryLabel ?? overlay?.title ?? `Case ${boundaryCaseId.slice(0, 8)}`;

  const columns = new Map<string, MatrixEntityColumn>();
  const boundaryMatches = matches
    .filter((match) => match.targetCaseId === boundaryCaseId)
    .sort((a, b) => a.targetEntityId.localeCompare(b.targetEntityId));
  for (const match of boundaryMatches) {
    columns.set(match.targetEntityId, {
      entityId: match.targetEntityId,
      label: `Entity ${match.targetEntityId.slice(0, 8)}`,
      caseId: boundaryCaseId,
      caseLabel: label,
      structuralImportance: 0.5,
    });
  }
  if (overlay) {
    for (const node of [...overlay.nodes].sort(
      (a, b) =>
        b.structuralImportance - a.structuralImportance ||
        a.label.localeCompare(b.label) ||
        a.id.localeCompare(b.id),
    )) {
      columns.set(node.id, {
        entityId: node.id,
        label: node.label,
        caseId: boundaryCaseId,
        caseLabel: label,
        structuralImportance: clamp01(node.structuralImportance),
      });
    }
  }
  return [...columns.values()].sort(
    (a, b) =>
      b.structuralImportance - a.structuralImportance ||
      a.label.localeCompare(b.label) ||
      a.entityId.localeCompare(b.entityId),
  );
}

/**
 * Vague, non-direct explanation of why a cross-case cell lights up: the row
 * entity is the suspected hidden link between the two files. The language
 * deliberately stops short of a finding — it states the comparison routes its
 * reads through the row, and that nothing recorded proves the row directed,
 * sourced, or shielded anyone.
 */
function buildHiddenLinkTheory(
  row: MatrixEntityColumn,
  column: MatrixEntityColumn,
): string {
  return (
    `Why this cell lights up: ${row.label} is the figure the cross-case comparison keeps routing its reads ` +
    `through — ${row.label} appears on both sides of the record, and this cell is where one of those ` +
    `appearances lands on the ${column.label} column. That places ${row.label} on the comparison's short-list ` +
    `as the suspected hidden link between the two files. It is a lead the comparison is tracking, not a ` +
    `finding: nothing recorded in this cell proves ${row.label} directed, sourced, or shielded anyone.`
  );
}

function buildCrossCaseCells(
  rows: readonly MatrixEntityColumn[],
  columns: readonly MatrixEntityColumn[],
  matches: readonly CrossCaseMatch[],
  boundaryCaseId: string | null,
  candidates: readonly IntelligenceCandidateView[],
  authorized: boolean,
): { cells: MatrixCell[]; gated: number } {
  if (!authorized) {
    // Authorization gate: cells render empty; only the count of hidden
    // candidate cells is exposed (never which cells they are).
    let gated = 0;
    for (const match of matches) {
      if (match.targetCaseId !== boundaryCaseId) continue;
      if (!rows.some((row) => row.entityId === match.sourceEntityId)) continue;
      if (!columns.some((column) => column.entityId === match.targetEntityId)) {
        continue;
      }
      gated += 1;
    }
    const cells: MatrixCell[] = [];
    for (const row of rows) {
      for (const column of columns) {
        cells.push(crossCaseCell(row, column, [], [], candidates));
      }
    }
    return { cells, gated };
  }

  const cells: MatrixCell[] = [];
  let gated = 0;
  for (const row of rows) {
    for (const column of columns) {
      const cellMatches = matches
        .filter(
          (match) =>
            match.targetCaseId === boundaryCaseId &&
            match.sourceEntityId === row.entityId &&
            match.targetEntityId === column.entityId,
        )
        .sort((a, b) => a.sourceEntityId.localeCompare(b.sourceEntityId));

      if (cellMatches.length === 0) {
        cells.push(crossCaseCell(row, column, [], [], candidates));
        continue;
      }
      const primaryMatch = cellMatches[0]!;

      // Signals derive ONLY from provider-backed matches (shared evidence
      // types). bridgeSupport/overlay presence is never promoted to pair SIGNAL.
      const signalMap = new Map<MatrixSignalClass, MatrixSignal>();
      for (const match of cellMatches) {
        for (const rawType of match.sharedEvidenceTypes) {
          const signalClass = matchEvidenceToSignalClass(rawType);
          const existing = signalMap.get(signalClass);
          const classCount = (existing?.count ?? 0) + 1;
          signalMap.set(signalClass, {
            class: signalClass,
            classLabel: MATRIX_SIGNAL_CLASS_LABELS[signalClass],
            observationIds: [],
            count: classCount,
            sourceKind: "match",
            provenance: existing?.provenance
              ? `${existing.provenance}; match ${match.sourceCaseId.slice(0, 8)}→${match.targetCaseId.slice(0, 8)}`
              : `Cross-case comparison match (shared evidence types)`,
          });
        }
      }
      const signals = [...signalMap.values()].sort((a, b) =>
        a.class.localeCompare(b.class));

      const caveat = unresolvedCaveatFor(candidates, [row.entityId]);
      const state: MatrixCellState = signals.length >= 2 ? "multi-signal" : "candidate";

      const aria = [
        `${row.label}, Case A, to ${column.label}, ${column.caseLabel}`,
        "cross-case candidate. Signals:",
        signals.map((s) => s.classLabel.toLowerCase()).join(", "),
        caveat.unresolved ? " Identity comparison unresolved." : "",
      ]
        .filter(Boolean)
        .join(" ");

      const cell: MatrixCell = {
        rowEntityId: row.entityId,
        colEntityId: column.entityId,
        self: false,
        state,
        stateLabel: MATRIX_CELL_STATE_LABELS[state],
        signals,
        observationIds: [],
        contradictionPresent: false,
        contradictionNote: null,
        unresolved: caveat.unresolved,
        unresolvedNote: caveat.note,
        window: null,
        ariaDescription: aria,
        candidateNote: `Provider-backed cross-case comparison candidate (match score ${primaryMatch.matchScore.toFixed(2)}, confidence ${primaryMatch.confidence.toFixed(2)}, shared evidence types only).`,
        hiddenLinkTheory: buildHiddenLinkTheory(row, column),
      };
      cells.push(cell);
    }
  }
  return { cells, gated };
}

function crossCaseCell(
  row: MatrixEntityColumn,
  column: MatrixEntityColumn,
  signals: readonly MatrixSignal[],
  observationIds: readonly string[],
  candidates: readonly IntelligenceCandidateView[],
): MatrixCell {
  const caveat = unresolvedCaveatFor(candidates, [row.entityId]);
  const active = signals.length > 0;
  const state: MatrixCellState = !active
    ? "empty"
    : signals.length >= 2
      ? "multi-signal"
      : "candidate";
  return {
    rowEntityId: row.entityId,
    colEntityId: column.entityId,
    self: false,
    state,
    stateLabel: MATRIX_CELL_STATE_LABELS[state],
    signals,
    observationIds,
    contradictionPresent: false,
    contradictionNote: null,
    unresolved: active && caveat.unresolved,
    unresolvedNote: active ? caveat.note : null,
    window: null,
    ariaDescription: `${row.label}, Case A, to ${column.label}, ${column.caseLabel}. ${active ? "Candidate relationship." : "No relationship signal."}`,
    candidateNote: null,
    hiddenLinkTheory: null,
  };
}

// ---------------------------------------------------------------------------
// Summary builders
// ---------------------------------------------------------------------------

function withinCaseSummary(
  meta: Pick<MatrixMeta, "rows" | "cells" | "inRangeObservationCount" | "totalObservationCount" | "windowLabel">,
): string {
  const counts = matrixCellCounts({ mode: "within-case", cells: meta.cells });
  const parts = [
    `Relationship matrix: ${meta.rows.length} entities, ${counts.active} active relationship cell${counts.active === 1 ? "" : "s"}`,
  ];
  if (counts.candidate > 0) parts.push(`${counts.candidate} candidate`);
  if (counts.multiSignal > 0) parts.push(`${counts.multiSignal} multi-signal`);
  if (counts.conflict > 0) parts.push(`${counts.conflict} conflict/review`);
  parts.push(`${meta.inRangeObservationCount} of ${meta.totalObservationCount} observations in ${meta.windowLabel}`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildMatrix(input: MatrixBuildInput): MatrixMeta {
  const {
    nodes,
    observations,
    relations,
    contradictions,
    candidates,
    matches,
    overlays,
    caseId,
    timeRange,
    mode,
    authorizedBoundaries,
  } = input;

  const rows = buildEntityCatalog(nodes, caseId);
  const boundaryCaseId = mode === "within-case"
    ? null
    : (input.boundaryCaseId ?? defaultBoundaryCaseId(overlays, matches));
  const authorized = mode === "cross-case" &&
    boundaryCaseId !== null &&
    authorizedBoundaries.includes(boundaryCaseId);

  let cellsForMode: MatrixCell[];
  let columns: MatrixEntityColumn[] = [];
  let gated = 0;
  let boundaryLabel: string | null = null;

  if (mode === "within-case") {
    columns = rows;
    cellsForMode = buildWithinCaseCells(
      rows,
      observations,
      relations,
      contradictions,
      candidates,
      timeRange,
    );
  } else {
    boundaryLabel = matrixBoundaryOptions(overlays, matches).find(
      (option) => option.caseId === boundaryCaseId,
    )?.label ?? null;
    if (boundaryCaseId) {
      columns = buildCrossCaseColumns(
        boundaryCaseId,
        boundaryLabel,
        matches,
        overlays,
      );
      const built = buildCrossCaseCells(
        rows,
        columns,
        matches,
        boundaryCaseId,
        candidates,
        authorized,
      );
      cellsForMode = built.cells;
      gated = built.gated;
    } else {
      cellsForMode = [];
    }
  }

  const inRangeObservationCount = observations.filter((observation) =>
    observationInTimeRange(observation, timeRange),
  ).length;

  const distinctClasses = new Set(
    cellsForMode.flatMap((cell) => cell.signals.map((signal) => signal.class)),
  ).size;

  let summary: string;
  if (mode === "within-case") {
    summary = withinCaseSummary({
      rows,
      cells: cellsForMode,
      inRangeObservationCount,
      totalObservationCount: observations.length,
      windowLabel: timeRange ? "selected window" : "full timeline",
    });
  } else if (!boundaryCaseId) {
    summary = "No authorized cross-case boundary is available for comparison. Each case maintains its own entity space.";
  } else if (!authorized && gated > 0) {
    summary = `${boundaryLabel ?? "Boundary"} holds ${gated} provider-backed cross-case candidate${gated === 1 ? "" : "s"}. Request boundary expansion to reveal cell signals — nothing is shown before authorization.`;
  } else {
    const counts = matrixCellCounts({
      mode: "cross-case",
      cells: cellsForMode,
    });
    const candidateParts = ["candidate", counts.multiSignal > 0 ? "multi-signal" : ""]
      .filter(Boolean);
    summary = `Cross-case comparison against ${boundaryLabel ?? "the foreign boundary"}: ${counts.active} candidate cell${counts.active === 1 ? "" : "s"} (${candidateParts.join(", ")}), ${distinctClasses} distinct signal ${distinctClasses === 1 ? "class" : "classes"}. Matches are comparison records, not event-timed signals.`;
  }

  return {
    mode,
    rows,
    columns,
    cells: cellsForMode,
    boundaryCaseId,
    boundaryLabel,
    authorized,
    hiddenCandidateCount: mode === "cross-case" && !authorized ? gated : 0,
    distinctSignalClasses: distinctClasses,
    inRangeObservationCount,
    totalObservationCount: observations.length,
    windowLabel: timeRange ? "selected window" : "full timeline",
    summary,
  };
}