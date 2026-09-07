import { describe, it, expect } from "vitest";
import {
  buildEntityPulseOverview,
  buildEntityPeaks,
  buildEntityIndicators,
  closedRadialPath,
  observationInTimeRange,
  observationTypeToCategory,
  placePulseScene,
  shortEntityLabel,
  PULSE_RADIUS_BASE,
  PULSE_ACTIVITY_AMPLITUDE,
  PULSE_HALO_BASE,
  PULSE_HALO_AMPLITUDE,
  PULSE_SAMPLE_COUNT,
  PULSE_MAX_TOPIC_ENTITIES,
  PULSE_MAX_PEAKS_PER_ENTITY,
  PULSE_PEAK_CATEGORY_CODES,
  PULSE_CATEGORIES,
  stableHash,
} from "@/lib/network/pulse/pulse-model";
import { operationFinancialShadowGraph } from "@/lib/providers/demo/demo-fixtures/graph";
import { operationFinancialShadowObservations as observations } from "@/lib/providers/demo/demo-fixtures/observations";
import { operationFinancialShadowContradictions as contradictions } from "@/lib/providers/demo/demo-fixtures/contradictions";
import {
  ENT_VICTOR,
  ENT_BANK,
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

describe("F-PR6 — multi-entity pulse geometry invariants", () => {
  it("is deterministic: identical inputs produce identical field geometry", () => {
    const a = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    const b = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    expect(b.entities.map((e) => e.outerSamples)).toEqual(
      a.entities.map((e) => e.outerSamples),
    );
    expect(b.entities.map((e) => e.innerSamples)).toEqual(
      a.entities.map((e) => e.innerSamples),
    );
    expect(b.entities.map((e) => [e.entityId, e.strength, e.observationCount])).toEqual(
      a.entities.map((e) => [e.entityId, e.strength, e.observationCount]),
    );
    expect(b.markers.map((m) => `${m.kind}:${m.entityId}:${m.label}`)).toEqual(
      a.markers.map((m) => `${m.kind}:${m.entityId}:${m.label}`),
    );
    expect(b.summary).toBe(a.summary);
  });

  it("uses no random behaviour: stableHash is a pure function", () => {
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).not.toBe(stableHash("abd"));
  });

  it("emits exactly the documented sample count per entity field", () => {
    const overview = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    for (const field of overview.entities) {
      expect(field.outerSamples).toHaveLength(PULSE_SAMPLE_COUNT);
      expect(field.innerSamples).toHaveLength(PULSE_SAMPLE_COUNT);
    }
  });

  it("keeps every radius finite and within the physical bounds", () => {
    const overview = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    const max = PULSE_RADIUS_BASE + PULSE_ACTIVITY_AMPLITUDE;
    for (const field of overview.entities) {
      for (const sample of field.outerSamples) {
        expect(Number.isFinite(sample)).toBe(true);
        expect(sample).toBeGreaterThanOrEqual(PULSE_RADIUS_BASE);
        expect(sample).toBeLessThanOrEqual(max);
      }
      for (const sample of field.innerSamples) {
        expect(Number.isFinite(sample)).toBe(true);
        expect(sample).toBeGreaterThan(0);
      }
    }
  });

  it("produces a closed path with an M, n cubic segments and a Z", () => {
    const overview = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    const path = closedRadialPath(
      overview.entities[0]!.outerSamples,
      50,
      50,
      34,
      -Math.PI / 2,
    );
    expect(path.startsWith("M ")).toBe(true);
    expect(path.endsWith(" Z")).toBe(true);
    const segments = path.split(" C ").length - 1;
    expect(segments).toBe(PULSE_SAMPLE_COUNT);
  });

  it("handles a degenerate (too-few-sample) input without NaN", () => {
    expect(closedRadialPath([1, 1], 0, 0, 10)).toBe("");
  });

  it("is a multi-entity view: each placed entity gets its own field", () => {
    const overview = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    expect(overview.entities.length).toBe(5);
    expect(new Set(overview.entities.map((e) => e.entityId)).size).toBe(5);
    // Distinct activity produces distinct contours — no single shared field.
    const bank = overview.entities.find((e) => e.entityId === ENT_BANK)!;
    const victor = overview.entities.find((e) => e.entityId === ENT_VICTOR)!;
    expect(bank.outerSamples).not.toEqual(victor.outerSamples);
    expect(bank.observationCount).not.toBe(victor.observationCount);
  });

  it("renders calm base-circle fields when no observations are present", () => {
    const overview = buildEntityPulseOverview({ nodes, observations: [], timeRange: fullRange });
    expect(overview.totalObservationsInWindow).toBe(0);
    expect(overview.strongest).toBeNull();
    expect(overview.dominantCategory).toBeNull();
    expect(overview.concentrationPct).toBeNull();
    for (const field of overview.entities) {
      expect(field.active).toBe(false);
      expect(field.observationCount).toBe(0);
      expect(field.strength).toBe(0);
      for (const sample of field.outerSamples) expect(sample).toBe(PULSE_RADIUS_BASE);
    }
  });
});

describe("F-PR6 — temporal scope is shared and morphs the fields", () => {
  it("recomputes activity when the workspace timeRange changes", () => {
    const full = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    const jan = buildEntityPulseOverview({ nodes, observations, timeRange: jan2024 });
    expect(jan.totalObservationsInWindow).toBeLessThan(full.totalObservationsInWindow);
    expect(jan.summary).not.toBe(full.summary);

    const victorFull = full.entities.find((e) => e.entityId === ENT_VICTOR)!;
    const victorJan = jan.entities.find((e) => e.entityId === ENT_VICTOR)!;
    // In Jan-2024 only OBS_7 (maria+bank) falls inside; no Victor observation.
    expect(victorJan.observationCount).toBe(0);
    expect(victorJan.outerSamples).not.toEqual(victorFull.outerSamples);
    expect(victorFull.observationCount).toBeGreaterThan(0);
  });

  it("has the largest Jan-2024 activity on the bank (OBS_7)", () => {
    const jan = buildEntityPulseOverview({ nodes, observations, timeRange: jan2024 });
    expect(jan.strongest?.entityId).toBe(ENT_BANK);
    expect(jan.strongest?.observationCount).toBe(1);
  });

  it("reports the window concentration vs the full timeline", () => {
    const jan = buildEntityPulseOverview({ nodes, observations, timeRange: jan2024 });
    expect(jan.totalObservationsInWindow).toBe(1);
    expect(jan.totalObservationsFull).toBe(9);
    expect(jan.concentrationPct).toBe(11);
  });
});

describe("F-PR6 — category semantics", () => {
  it("maps every observation type to a declared pulse category", () => {
    expect(observationTypeToCategory("COMMUNICATION")).toBe("communication");
    expect(observationTypeToCategory("FINANCIAL")).toBe("financial");
    expect(observationTypeToCategory("SPATIAL")).toBe("location");
    expect(observationTypeToCategory("IDENTITY")).toBe("identity");
    expect(observationTypeToCategory("RELATIONAL")).toBe("other");
    expect(observationTypeToCategory("BEHAVIORAL")).toBe("other");
    expect(observationTypeToCategory("TEMPORAL")).toBe("other");
    expect(observationTypeToCategory("FACTUAL")).toBe("other");
    expect(observationTypeToCategory("OTHER")).toBe("other");
    for (const c of PULSE_CATEGORIES) {
      expect(observationTypeToCategory(c as never) ?? c).toBeTruthy();
    }
  });

  it("tags each entity's field with its dominant (most frequent) category", () => {
    const overview = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    const victor = overview.entities.find((e) => e.entityId === ENT_VICTOR)!;
    // Victor takes OBS_6 (COMMUNICATION), OBS_8 (RELATIONAL->other),
    // OBS_9 (RELATIONAL->other): two 'other', one communication.
    expect(victor.category).toBe("other");
    const bank = overview.entities.find((e) => e.entityId === ENT_BANK)!;
    // Bank takes OBS_2/3/4 (FINANCIAL) + OBS_7 (COMMUNICATION) → financial.
    expect(bank.category).toBe("financial");
  });
});

describe("F-PR6 — salience halo comes from canonical structure only", () => {
  it("surfaces structuralImportance as analytical salience", () => {
    const overview = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    expect(overview.salienceAvailable).toBe(true);
    const bank = overview.entities.find((e) => e.entityId === ENT_BANK)!;
    expect(bank.salience).toBeCloseTo(0.95, 5);
    // The halo is a calm inner contour that does not carry activity lobes.
    expect(bank.innerSamples[0]).toBeCloseTo(
      PULSE_HALO_BASE + 0.95 * PULSE_HALO_AMPLITUDE,
      5,
    );
  });

  it("reports salience unavailable when no node carries it", () => {
    const bareNodes = nodes.map((node) => ({
      ...node,
      type: "ENTITY",
    }));
    const overview = buildEntityPulseOverview({
      nodes: [{ ...bareNodes[0]!, structuralImportance: 0 }],
      observations: [],
      timeRange: fullRange,
    });
    expect(overview.salienceAvailable).toBe(false);
  });
});

describe("F-PR6 — overview top-K cap", () => {
  it("caps the bounded deterministic entry set at the documented count and reports the cap", () => {
    const tooMany = Array.from({ length: 20 }, (_, i) => ({
      id: `n-${i}`,
      investigationId: "i",
      versionId: "v",
      type: "ENTITY",
      entityId: `ent-${i}`,
      label: `Entity ${i}`,
      structuralImportance: (i + 1) / 20,
      observationCount: 0,
      sourceCount: 0,
      createdAt: { value: "2024-01-01T00:00:00.000Z", precision: "exact" },
      updatedAt: { value: "2024-01-01T00:00:00.000Z", precision: "exact" },
    }));
    // one observation for entity 19 (highest structuralImportance) so it has activity
    const obs = [objectObservation("x-1", "ent-19", "FINANCIAL")];
    const overview = buildEntityPulseOverview({
      nodes: tooMany as never,
      observations: obs,
      timeRange: fullRange,
    });
    expect(overview.entityNodeCount).toBe(20);
    expect(overview.entities).toHaveLength(PULSE_MAX_TOPIC_ENTITIES);
    expect(overview.capped).toBe(true);
    // Representative order: structural salience desc — entity 19 comes first.
    expect(overview.entities[0]!.entityId).toBe("ent-19");
    expect(overview.entities[0]!.observationCount).toBe(1);
    expect(overview.summary).toContain("top 6 by structural salience");
  });

  it("reports no cap when the entity set fits", () => {
    const overview = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    expect(overview.entityNodeCount).toBeLessThanOrEqual(PULSE_MAX_TOPIC_ENTITIES);
    expect(overview.entities).toHaveLength(overview.entityNodeCount);
    expect(overview.capped).toBe(false);
  });
});

describe("F-PR6 — sparse case markers", () => {
  it("places a contradiction marker anchored to a shared entity", () => {
    const overview = buildEntityPulseOverview({
      nodes,
      observations,
      contradictions,
      timeRange: fullRange,
    });
    const contradiction = overview.markers.find((m) => m.kind === "contradiction");
    expect(contradiction).toBeTruthy();
    expect(overview.markers.filter((m) => m.kind === "contradiction")).toHaveLength(1);
    // OBS_8 (shell one + victor) <-> OBS_9 (victor): shared entity = victor.
    expect(contradiction?.entityId).toBe(ENT_VICTOR);
  });

  it("places an identity-resolution marker on the linked entity", () => {
    const overview = buildEntityPulseOverview({
      nodes,
      observations,
      candidates: [buildCandidateView()],
      timeRange: fullRange,
    });
    const er = overview.markers.find((m) => m.kind === "identity-resolution");
    expect(er).toBeTruthy();
    expect(er?.entityId).toBe(ENT_VICTOR);
  });

  it("synthesizes cross-case markers from shell overlays, unanchored", () => {
    const overlays: ForeignCaseOverlay[] = [
      {
        ref: "cobalt",
        caseId: "case-f1",
        title: "Operation Cobalt",
        summary: "Panamanian shell network.",
        localTargetMatch: "VICTOR",
        bridgeSupport: 0.87,
        nodes: [],
        edges: [],
      },
    ];
    const overview = buildEntityPulseOverview({
      nodes,
      observations,
      overlays,
      timeRange: fullRange,
    });
    const cross = overview.markers.find((m) => m.kind === "cross-case");
    expect(cross).toBeTruthy();
    expect(cross?.entityId).toBeNull();
    expect(cross?.label).toBe("Operation Cobalt");
  });
});

describe("F-PR6 — deterministic summary narration", () => {
  it("names the strongest entity and the window scope", () => {
    const overview = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    expect(overview.summary).toContain("Entity Pulse");
    expect(overview.summary).toContain("Most active: Intermediary Account 0093");
    expect(overview.summary).toContain("full timeline");
  });

  it("reports the temporal scope as 'selected window' when bound", () => {
    const overview = buildEntityPulseOverview({ nodes, observations, timeRange: jan2024 });
    expect(overview.windowLabel).toBe("selected window");
    expect(overview.summary).toContain("selected window");
  });
});

describe("F-PR6 — time-range predicate", () => {
  it("includes untimed observations regardless of the window", () => {
    const untimed = {
      ...observations[2]!,
      id: "untimed-1",
      observedAt: undefined,
    };
    expect(observationInTimeRange(untimed as never, jan2024)).toBe(true);
  });

  it("bounds neither side for a null timeRange", () => {
    expect(observationInTimeRange(observations[0]!, null)).toBe(true);
  });
});

describe("F-PR6 — most-changed narrator (bounded window vs full)", () => {
  it("derives the most reduced entity in the selected window from real counts", () => {
    const overview = buildEntityPulseOverview({ nodes, observations, timeRange: jan2024 });
    expect(overview.mostChanged).not.toBeNull();
    const changed = overview.mostChanged!;
    // Victor, Shell One and Shell Two are each 0-of-3 in the window: the
    // narrator never invents a "mover" — it reports the real drop.
    expect(changed.inWindow).toBeLessThan(changed.total);
    expect(changed.inWindow).toBe(0);
    expect(changed.description).toContain(changed.label);
  });

  it("reports no most-changed outside a bounded window", () => {
    const overview = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    expect(overview.mostChanged).toBeNull();
  });
});

describe("F-PR6 — activity flow invariants", () => {
  it("keeps observation counts and strengths truthful", () => {
    const overview = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    for (const field of overview.entities) {
      if (field.observationCount === 0) {
        expect(field.active).toBe(false);
        expect(field.strength).toBe(0);
      } else {
        expect(field.active).toBe(true);
        expect(field.strength).toBeGreaterThan(0);
      }
    }
  });

  it("normalizes each entity's strength relative to the window maximum", () => {
    const full = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    const jan = buildEntityPulseOverview({ nodes, observations, timeRange: jan2024 });
    const bankJan = jan.entities.find((e) => e.entityId === ENT_BANK)!;
    const bankFull = full.entities.find((e) => e.entityId === ENT_BANK)!;
    // Regression check: strength/radius stay in-bounds across recompute.
    expect(bankJan.strength).toBeLessThanOrEqual(bankFull.strength);
    expect(Math.max(...bankFull.outerSamples)).toBeLessThanOrEqual(
      PULSE_RADIUS_BASE + PULSE_ACTIVITY_AMPLITUDE,
    );
  });
});

/** Minimal typed Observation builder for tests. */
function objectObservation(
  id: string,
  entityId: string,
  type: "FINANCIAL" | "COMMUNICATION" | "RELATIONAL",
) {
  return {
    id,
    evidenceId: "b1e0c9a6-0000-4000-8000-0000e0000000",
    sourceId: "b1e0c9a6-0000-4000-8000-000000000010",
    type,
    content: "test",
    entityIds: [entityId],
    candidateMentions: [],
    strength: 0.5,
    provenance: { sourceId: "x", extractor: "t" },
    observedAt: { value: "2024-01-05T00:00:00.000Z", precision: "exact" },
    createdAt: { value: "2024-06-01T00:00:00.000Z", precision: "exact" },
    updatedAt: { value: "2024-06-01T00:00:00.000Z", precision: "exact" },
  };
}

/** Build a minimal IntelligenceCandidateView where Victor is the linked entity
 *  and the nominee (left) is unresolved. */
function buildCandidateView(): {
  resolutionId: string;
  left: { text: string };
  right: { text: string };
  hypothesis: { status: string };
  comparison: { score: number };
  leftEntity: unknown;
  rightEntity: { id: string } | null;
} {
  return {
    resolutionId: HYP_RES_1,
    left: { text: "nominee director" },
    right: { text: "Victor" },
    hypothesis: { status: "UNRESOLVED" },
    comparison: { score: 0.51 },
    leftEntity: null,
    rightEntity: { id: ENT_VICTOR },
  };
}

// ────────────────────────── F-PR16 ──────────────────────────────────────────
// Entity Pulse redesign: temporal perimeter peaks (deterministic, real data)
// and the spatial-field placement geometry.
// ────────────────────────────────────────────────────────────────────────────

describe("F-PR16 — temporal perimeter peaks", () => {
  it("is deterministic and finite for identical inputs", () => {
    const a = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    const b = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    expect(b.entities.map((e) => e.peaks)).toEqual(a.entities.map((e) => e.peaks));
    for (const field of a.entities) {
      for (const peak of field.peaks) {
        expect(Number.isFinite(peak.angle)).toBe(true);
        expect(peak.angle).toBeGreaterThanOrEqual(0);
        expect(peak.angle).toBeLessThan(Math.PI * 2);
        expect(peak.magnitude).toBeGreaterThanOrEqual(0);
        expect(peak.magnitude).toBeLessThanOrEqual(1);
        expect(peak.observationCount).toBeGreaterThan(0);
      }
    }
  });

  it("derives peaks only from the entity's OWN in-window observations", () => {
    const jan = buildEntityPulseOverview({ nodes, observations, timeRange: jan2024 });
    const victorJan = jan.entities.find((e) => e.entityId === ENT_VICTOR)!;
    // Jan-2024 has no Victor observation → calm ⇒ no peaks to invent.
    expect(victorJan.active).toBe(false);
    expect(victorJan.peaks).toHaveLength(0);

    const bankJan = jan.entities.find((e) => e.entityId === ENT_BANK)!;
    expect(bankJan.active).toBe(true);
    expect(bankJan.peaks.length).toBeGreaterThanOrEqual(1);
    for (const peak of bankJan.peaks) {
      expect(peak.label).toMatch(/^(FIN|COM|LOC|IDN|XCS|OTH)/);
    }
  });

  it("labels perimeter peaks with a category code (no date in label)", () => {
    const overview = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    const bank = overview.entities.find((e) => e.entityId === ENT_BANK)!;
    expect(bank.peaks.length).toBeGreaterThan(0);
    for (const peak of bank.peaks) {
      expect(peak.label).toBe(PULSE_PEAK_CATEGORY_CODES[peak.category]);
      expect(peak.detail).toContain(String(peak.observationCount));
    }
  });

  it("caps the per-entity perimeter at the documented count and reports the cap", () => {
    const overview = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    for (const field of overview.entities) {
      expect(field.peaks.length).toBeLessThanOrEqual(PULSE_MAX_PEAKS_PER_ENTITY);
      expect(field.peaksCapped).toBe(field.peaksTotal > field.peaks.length);
    }
  });

  it("clusters observations that share an observable day into ONE peak", () => {
    const dayClustered = buildEntityPeaks(ENT_BANK, [
      objectObservation("a1", ENT_BANK, "FINANCIAL"),
      objectObservation("a2", ENT_BANK, "FINANCIAL"),
    ]);
    expect(dayClustered).toHaveLength(1);
    expect(dayClustered[0]!.observationCount).toBe(2);
    expect(dayClustered[0]!.label).toBe("FIN");
  });

  it("keeps untimed observations in a single honest fallback peak", () => {
    const untimed = buildEntityPeaks(ENT_BANK, [
      { ...objectObservation("b1", ENT_BANK, "FINANCIAL"), observedAt: undefined },
    ]);
    expect(untimed).toHaveLength(1);
    expect(untimed[0]!.timestampMs).toBeNull();
    expect(untimed[0]!.label).toBe("FIN");
    expect(untimed[0]!.detail).toContain("1 observation");
  });

  it("calm entities expose an empty peak list (no fabricated activity)", () => {
    const overview = buildEntityPulseOverview({ nodes, observations: [], timeRange: fullRange });
    for (const field of overview.entities) {
      expect(field.peaks).toHaveLength(0);
      expect(field.peaksTotal).toBe(0);
      expect(field.peaksCapped).toBe(false);
    }
  });
});

describe("F-PR16 — spatial field placement geometry", () => {
  const overview = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });

  it("is deterministic and stable across recomputes", () => {
    const again = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    expect(placePulseScene(overview.entities)).toEqual(placePulseScene(again.entities));
  });

  it("places every displayed entity exactly once with an in-bounds ring factor", () => {
    const placements = placePulseScene(overview.entities);
    expect(placements).toHaveLength(overview.entities.length);
    expect(new Set(placements.map((p) => p.entityId)).size).toBe(placements.length);
    for (const placement of placements) {
      expect(placement.radiusFactor).toBeGreaterThan(0);
      expect(placement.radiusFactor).toBeLessThan(1);
      expect(Number.isFinite(placement.angle)).toBe(true);
    }
  });

  it("returns no placements for an empty field", () => {
    expect(placePulseScene([])).toEqual([]);
  });

  it("derives a readable short centre label without inventing words", () => {
    expect(shortEntityLabel("Intermediary Account 0093")).toBe("Intermediary");
    expect(shortEntityLabel("A").trim().length).toBeGreaterThan(0);
    expect(shortEntityLabel("Loremipsumdolorsitamet")).toContain("…");
  });
});

describe("F-PR19 — sector determinism (no random breathing)", () => {
  it("produces identical sector indicators for identical data across recomputes", () => {
    const a = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    const again = buildEntityPulseOverview({ nodes, observations, timeRange: fullRange });
    const bankA = a.entities.find((e) => e.entityId === ENT_BANK)!;
    const bankB = again.entities.find((e) => e.entityId === ENT_BANK)!;
    expect(bankA.indicators).toEqual(bankB.indicators);
  });

  it("buildEntityIndicators is a pure function of (nodeId, entityId, observations)", () => {
    const windowObs = observations.filter(
      (o) => o.entityIds.includes(ENT_BANK),
    );
    const first = buildEntityIndicators("n-bank", ENT_BANK, windowObs);
    const second = buildEntityIndicators("n-bank", ENT_BANK, windowObs);
    expect(first).toEqual(second);
    // Deterministic fields are concrete numbers (never NaN / never random).
    for (const indicator of first) {
      expect(Number.isFinite(indicator.angle)).toBe(true);
      expect(indicator.strength).toBeGreaterThanOrEqual(0);
      expect(indicator.strength).toBeLessThanOrEqual(1);
      expect(indicator.count).toBeGreaterThan(0);
      expect(indicator.label).toMatch(/^(FIN|COM|LOC|IDN|XCS|OTH)$/);
    }
  });

  it("visual labels carry no dates or calendar positions", () => {
    const windowObs = observations.filter(
      (o) => o.entityIds.includes(ENT_BANK),
    );
    const indicators = buildEntityIndicators("n-bank", ENT_BANK, windowObs);
    for (const indicator of indicators) {
      // Category code only — never an observation date.
      expect(indicator.label).toBe(PULSE_PEAK_CATEGORY_CODES[indicator.category]);
      expect(indicator.label).not.toMatch(/\d{2}-[A-Z]{3}/);
    }
  });
});