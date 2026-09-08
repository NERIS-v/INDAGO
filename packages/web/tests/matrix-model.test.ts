import { describe, it, expect } from "vitest";
import {
  buildMatrix,
  cellFor,
  defaultBoundaryCaseId,
  matrixBoundaryOptions,
  matrixCellCounts,
  matrixCellFromContext,
  matrixCellId,
  matrixContextForCell,
  matrixDateLabel,
  matrixWindowLabel,
  parseMatrixCellId,
} from "@/lib/network/matrix/matrix-model";
import type { MatrixMode } from "@/lib/network/matrix/matrix-model";
import { operationFinancialShadowGraph } from "@/lib/providers/demo/demo-fixtures/graph";
import { operationFinancialShadowObservations as observations } from "@/lib/providers/demo/demo-fixtures/observations";
import { operationFinancialShadowRelations as relations } from "@/lib/providers/demo/demo-fixtures/relations";
import { operationFinancialShadowContradictions as contradictions } from "@/lib/providers/demo/demo-fixtures/contradictions";
import { operationFinancialShadowCrossCase as matches, MOCK_FOREIGN_CASES } from "@/lib/providers/demo/demo-fixtures/cross-case";
import {
  CASE_ID,
  INVESTIGATION_ID,
  CROSS_CASE_ID,
  CROSS_ENTITY_ID,
  ENT_VICTOR,
  ENT_MARIA,
  ENT_SHELL_ONE,
  ENT_SHELL_TWO,
  ENT_BANK,
  OBS_6,
  OBS_8,
  OBS_9,
  HYP_RES_1,
} from "@/lib/providers/demo/demo-fixtures/lookup";
import type { ForeignCaseOverlay } from "@/lib/providers/types";

const nodes = operationFinancialShadowGraph.nodes;
const fullRange = null as [number, number] | null;

/** ISO epoch ms. */
function epochMs(iso: string): number {
  return new Date(iso).getTime();
}

const jan2024: [number, number] = [
  epochMs("2024-01-01T00:00:00.000Z"),
  epochMs("2024-01-31T23:59:59.999Z"),
];

/** Shell overlays derived from the deterministic cross-case graph mocks. */
const overlays: ForeignCaseOverlay[] = Object.values(MOCK_FOREIGN_CASES).map(
  (mock) => ({
    ref: mock.id,
    caseId: mock.id,
    title: mock.title,
    summary: mock.summary,
    localTargetMatch: mock.localTargetMatch,
    bridgeSupport: mock.bridgeSupport,
    nodes: mock.nodes,
    edges: mock.edges,
  }),
);

const withinInput = {
  nodes,
  observations,
  relations,
  contradictions,
  candidates: [] as never[],
  matches,
  overlays,
  caseId: CASE_ID,
  investigationId: INVESTIGATION_ID,
  timeRange: fullRange,
  mode: "within-case" as MatrixMode,
  boundaryCaseId: null,
  authorizedBoundaries: [] as readonly string[],
};

describe("F-PR7 — within-case relationship matrix (canonical demo)", () => {
  it("catalogs exactly the ENTITY nodes in structuralImportance-desc order (WITNESS excluded)", () => {
    const meta = buildMatrix(withinInput);
    expect(meta.rows.map((row) => row.entityId)).toEqual([
      ENT_BANK,
      ENT_VICTOR,
      ENT_SHELL_ONE,
      ENT_SHELL_TWO,
      ENT_MARIA,
    ]);
    expect(meta.rows.map((row) => row.caseLabel)).toEqual([
      "Case A",
      "Case A",
      "Case A",
      "Case A",
      "Case A",
    ]);
    expect(meta.columns).toEqual(meta.rows);
  });

  it("is deterministic: identical inputs produce identical cells and summary", () => {
    const a = buildMatrix(withinInput);
    const b = buildMatrix(withinInput);
    expect(b.cells).toEqual(a.cells);
    expect(b.summary).toBe(a.summary);
  });

  it("builds a symmetric 5×5 grid with self cells and the documented active pairs", () => {
    const meta = buildMatrix(withinInput);
    expect(meta.cells).toHaveLength(25);
    expect(meta.rows).toHaveLength(5);
    // 7 relationship pairs (both directions) + 5 self cells + 6 empty cells.
    const counts = matrixCellCounts(meta);
    expect(counts.conflict).toBe(2);
    expect(counts.multiSignal).toBe(2);
    expect(counts.candidate).toBe(10);
    expect(counts.active).toBe(14);
    const self = meta.cells.filter((cell) => cell.self);
    expect(self).toHaveLength(5);
    const empty = meta.cells.filter(
      (cell) => !cell.self && cell.state === "empty",
    );
    expect(empty).toHaveLength(6);
  });

  it("flags the Victor↔Shell One cell as a contradiction (OBS_8 ↕ OBS_9)", () => {
    const meta = buildMatrix(withinInput);
    const cell = cellFor(meta, ENT_VICTOR, ENT_SHELL_ONE)!;
    expect(cell.state).toBe("conflict");
    expect(cell.contradictionPresent).toBe(true);
    expect(cell.contradictionNote).toContain(`${OBS_8} ↕ ${OBS_9}`);
    // The signal is grounded in the shared observation, never fabricated.
    expect(cell.observationIds).toContain(OBS_8);
    expect(cell.observationIds).not.toContain(OBS_9);
  });

  it("distinguishes the Maria↔Bank multi-signal cell (obs + relation) from single candidates", () => {
    const meta = buildMatrix(withinInput);
    const mariaBank = cellFor(meta, ENT_MARIA, ENT_BANK)!;
    expect(mariaBank.state).toBe("multi-signal");
    expect(mariaBank.signals.length).toBeGreaterThanOrEqual(2);

    const shellPair = cellFor(meta, ENT_SHELL_ONE, ENT_SHELL_TWO)!;
    // OBS_1 + REL_5 share the financial class → a single merged candidate.
    expect(shellPair.state).toBe("candidate");

    const victorMaria = cellFor(meta, ENT_VICTOR, ENT_MARIA)!;
    expect(victorMaria.state).toBe("candidate");
  });

  it("grounds signals only in provider data (observation ids + relation provenance)", () => {
    const meta = buildMatrix(withinInput);
    const victorShellTwo = cellFor(meta, ENT_VICTOR, ENT_SHELL_TWO)!;
    // No shared observation — the REL_6 relationship is the only signal, and
    // its evidence observation (OBS_6) is the honest provenance for that signal.
    expect(victorShellTwo.state).toBe("candidate");
    expect(victorShellTwo.signals[0]!.provenance).toContain("ownership");
    expect(victorShellTwo.observationIds).toEqual([OBS_6]);
    expect(victorShellTwo.observationIds).not.toContain(OBS_8);
  });

  it("marks Victor-participating cells with the unresolved identity caveat", () => {
    const meta = buildMatrix({ ...withinInput, candidates: [buildCandidateView()] });
    const conflict = cellFor(meta, ENT_VICTOR, ENT_SHELL_ONE)!;
    expect(conflict.unresolved).toBe(true);
    expect(conflict.unresolvedNote).toContain("not identity-confirmed");
    const empty = cellFor(meta, ENT_VICTOR, ENT_BANK)!;
    expect(empty.unresolved).toBe(false);
    // Maria is not the unresolved participant.
    const mariaBank = cellFor(meta, ENT_MARIA, ENT_BANK)!;
    expect(mariaBank.unresolved).toBe(false);
  });

  it("reports the observation window of a selected cell", () => {
    const meta = buildMatrix(withinInput);
    const shellPair = cellFor(meta, ENT_SHELL_ONE, ENT_SHELL_TWO)!;
    // OBS_1 and REL_5 evidence → observed window spans OBS_1..OBS_6.
    expect(shellPair.window).not.toBeNull();
    expect(matrixWindowLabel(shellPair.window)).toContain(
      matrixDateLabel(epochMs("2024-02-15T00:00:00.000Z")),
    );
  });
});

describe("F-PR7 — the shared timeRange is the only temporal controller", () => {
  it("recomputes within-case activity for a bounded window (Jan-2024 leaves Maria↔Bank only)", () => {
    const jan = buildMatrix({ ...withinInput, timeRange: jan2024 });
    expect(jan.windowLabel).toBe("selected window");
    expect(jan.inRangeObservationCount).toBe(1);
    expect(jan.totalObservationCount).toBe(9);

    const counts = matrixCellCounts(jan);
    expect(counts.conflict).toBe(0);
    expect(counts.candidate).toBe(0);
    expect(counts.multiSignal).toBe(2);

    // OBS_8 / relation evidence fall outside the window → no Victor activity.
    expect(cellFor(jan, ENT_VICTOR, ENT_SHELL_ONE)!.state).toBe("empty");
    expect(cellFor(jan, ENT_MARIA, ENT_BANK)!.state).toBe("multi-signal");
    expect(jan.summary).toContain("selected window");
  });

  it("binds cross-case comparison records only to boundary columns, never to the window", () => {
    const jan = buildMatrix({
      ...withinInput,
      mode: "cross-case",
      timeRange: jan2024,
      authorizedBoundaries: [CROSS_CASE_ID],
    });
    // The hero match is a comparison record, not an event-timed signal.
    expect(jan.hiddenCandidateCount).toBe(0);
    const hero = cellFor(jan, ENT_VICTOR, CROSS_ENTITY_ID)!;
    expect(hero.state).toBe("multi-signal");
    expect(hero.window).toBeNull();
  });
});

describe("F-PR7 — cross-case comparison, boundary options and authorization gating", () => {
  it("derives deterministic boundary options and the match-bearing default boundary", () => {
    const options = matrixBoundaryOptions(overlays, matches);
    const cobalt = options.find((o) => o.caseId === CROSS_CASE_ID)!;
    expect(cobalt.label).toBe("Operation Cobalt");
    expect(cobalt.hasMatch).toBe(true);
    const crimson = options.find((o) => o.caseId === "case-f4a910b2")!;
    expect(crimson.label).toBe("Operation Crimson");
    expect(crimson.hasMatch).toBe(false);
    expect(defaultBoundaryCaseId(overlays, matches)).toBe(CROSS_CASE_ID);
  });

  it("gates pre-authorization: homogeneously empty cells plus ONLY a hidden count", () => {
    const meta = buildMatrix({
      ...withinInput,
      mode: "cross-case",
      boundaryCaseId: CROSS_CASE_ID,
      authorizedBoundaries: [],
    });
    expect(meta.authorized).toBe(false);
    expect(meta.hiddenCandidateCount).toBe(1);
    expect(meta.boundaryCaseId).toBe(CROSS_CASE_ID);
    expect(meta.boundaryLabel).toBe("Operation Cobalt");
    expect(meta.columns).toHaveLength(4);
    expect(meta.columns.map((c) => c.caseId)).toEqual(
      Array(4).fill(CROSS_CASE_ID),
    );
    for (const cell of meta.cells) {
      if (!cell.self) {
        expect(cell.state).toBe("empty");
        expect(cell.signals).toEqual([]);
      }
    }
    expect(meta.summary).toContain("holds 1 provider-backed cross-case candidate");
  });

  it("reveals the provider-backed hero cell after authorization (Victor ↔ cross entity)", () => {
    const meta = buildMatrix({
      ...withinInput,
      mode: "cross-case",
      boundaryCaseId: CROSS_CASE_ID,
      authorizedBoundaries: [CROSS_CASE_ID],
      candidates: [buildCandidateView()],
    });
    expect(meta.authorized).toBe(true);
    expect(meta.hiddenCandidateCount).toBe(0);
    const counts = matrixCellCounts(meta);
    expect(counts.active).toBe(1);
    expect(counts.multiSignal).toBe(1);
    expect(counts.candidate).toBe(0);

    const hero = cellFor(meta, ENT_VICTOR, CROSS_ENTITY_ID)!;
    expect(hero.state).toBe("multi-signal");
    expect(hero.signals.map((s) => s.class)).toEqual(
      ["COMMUNICATION", "FINANCIAL"],
    );
    expect(hero.unresolved).toBe(true);
    expect(hero.candidateNote).toContain("0.87");
    expect(hero.candidateNote).toContain("0.84");
    // Other rows hold no match against this boundary.
    expect(cellFor(meta, ENT_BANK, CROSS_ENTITY_ID)!.state).toBe("empty");
  });

  it("carries a vague (non-direct) hidden-link theory on match-lit cells only", () => {
    const meta = buildMatrix({
      ...withinInput,
      mode: "cross-case",
      boundaryCaseId: CROSS_CASE_ID,
      authorizedBoundaries: [CROSS_CASE_ID],
      candidates: [buildCandidateView()],
    });
    const hero = cellFor(meta, ENT_VICTOR, CROSS_ENTITY_ID)!;
    expect(hero.hiddenLinkTheory).not.toBeNull();
    expect(hero.hiddenLinkTheory).toContain(meta.rows.find((r) => r.entityId === ENT_VICTOR)!.label);
    // Vague and honest: it reads as the comparison's suspected link, never a verdict.
    expect(hero.hiddenLinkTheory).toContain("suspected hidden link");
    expect(hero.hiddenLinkTheory).toContain("not a finding");
    expect(hero.hiddenLinkTheory.toLowerCase()).not.toContain("guilty");
    // Non-match cells carry no theory at all.
    expect(cellFor(meta, ENT_BANK, CROSS_ENTITY_ID)!.hiddenLinkTheory).toBeNull();
  });

  it("never exposes the hidden-link theory before authorization (empty cells only)", () => {
    const meta = buildMatrix({
      ...withinInput,
      mode: "cross-case",
      boundaryCaseId: CROSS_CASE_ID,
      authorizedBoundaries: [],
    });
    expect(meta.hiddenCandidateCount).toBe(1);
    for (const cell of meta.cells) {
      expect(cell.hiddenLinkTheory).toBeNull();
    }
  });

  it("keeps a matchless overlay boundary quiet (no fabricated matches)", () => {
    const crimsonId = "case-f4a910b2";
    const meta = buildMatrix({
      ...withinInput,
      mode: "cross-case",
      boundaryCaseId: crimsonId,
      authorizedBoundaries: [crimsonId],
    });
    expect(meta.authorized).toBe(true);
    expect(meta.hiddenCandidateCount).toBe(0);
    expect(meta.boundaryLabel).toBe("Operation Crimson");
    expect(meta.columns.map((c) => c.entityId)).toEqual([
      "foreign-crimson-1",
      "foreign-crimson-2",
      "foreign-crimson-3",
    ]);
    for (const cell of meta.cells) {
      if (!cell.self) expect(cell.state).toBe("empty");
    }
  });
});

describe("F-PR7 — cell identity + InvestigativeContext bridge", () => {
  it("round-trips the deterministic cell id (mode-prefixed :: row :: col)", () => {
    const id = matrixCellId("within-case", ENT_VICTOR, ENT_SHELL_ONE);
    expect(id).toBe(`w::${ENT_VICTOR}::${ENT_SHELL_ONE}`);
    expect(parseMatrixCellId(id)).toEqual({
      row: ENT_VICTOR,
      col: ENT_SHELL_ONE,
    });
    expect(matrixCellId("cross-case", ENT_VICTOR, CROSS_ENTITY_ID)).toBe(
      `x::${ENT_VICTOR}::${CROSS_ENTITY_ID}`,
    );
    expect(parseMatrixCellId("not-a-cell")).toBeNull();
  });

  it("maps a cell to a typed InvestigativeContext and resolves it back", () => {
    const within = buildMatrix(withinInput);
    const relationContext = matrixContextForCell(
      "within-case",
      ENT_VICTOR,
      ENT_SHELL_ONE,
    );
    expect(relationContext).toEqual({
      kind: "relation",
      id: `w::${ENT_VICTOR}::${ENT_SHELL_ONE}`,
      source: "matrix",
    });
    expect(matrixCellFromContext(within, relationContext)).toEqual(
      cellFor(within, ENT_VICTOR, ENT_SHELL_ONE),
    );

    const cross = buildMatrix({
      ...withinInput,
      mode: "cross-case",
      boundaryCaseId: CROSS_CASE_ID,
      authorizedBoundaries: [CROSS_CASE_ID],
    });
    const crossContext = matrixContextForCell(
      "cross-case",
      ENT_VICTOR,
      CROSS_ENTITY_ID,
    );
    expect(crossContext.kind).toBe("cross-case");
    expect(matrixCellFromContext(cross, crossContext)).not.toBeNull();
    // A within-case context never resolves against a cross-case meta.
    expect(matrixCellFromContext(cross, relationContext)).toBeNull();
    expect(matrixCellFromContext(within, null)).toBeNull();
  });
});

/** Minimal unresolved IntelligenceCandidateView anchored to Victor — mirrors
 *  the canonical entity-resolution fixture (nominee ↔ Victor, UNRESOLVED). */
function buildCandidateView(): {
  resolutionId: string;
  left: { text: string };
  right: { text: string };
  hypothesis: { status: string };
  comparison: { score: number; comparisonStatus: string };
  leftEntity: null;
  rightEntity: { id: string };
} {
  return {
    resolutionId: HYP_RES_1,
    left: { text: "nominee director" },
    right: { text: "Victor" },
    hypothesis: { status: "UNRESOLVED" },
    comparison: { score: 0.51, comparisonStatus: "COMPARED_AND_UNRESOLVED" },
    leftEntity: null,
    rightEntity: { id: ENT_VICTOR },
  };
}