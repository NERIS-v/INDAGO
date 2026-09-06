import { describe, it, expect } from "vitest";
import type { GraphVersion } from "@indago/contracts";
import {
  activeVersion,
  CURRENT_VERSION_SELECTION,
  deriveVersionViewState,
  HISTORICAL_SURFACE_UNAVAILABLE,
  isHistoricalView,
  realtimeMayMutateVisibleGraph,
  sortVersionsByNumber,
  versionLabel,
} from "@/lib/context/temporal-workspace";

// PR-7 — Temporal + Activity + Version context, pure derivation rules. The
// honesty guarantees under test: a historical selection NEVER falls back to the
// current graph, and realtime NEVER mutates a historical view.

const INVESTIGATION_ID = "b1e0c9a6-0000-4000-8000-000000000002";

function version(id: string, number: number, status: GraphVersion["status"]): GraphVersion {
  return {
    id,
    investigationId: INVESTIGATION_ID,
    versionNumber: number,
    status,
    projectionStatus: "COMPLETE",
    nodeCount: number * 2,
    edgeCount: number,
    createdAt: { value: "2024-06-01T12:00:00.000Z", precision: "exact" },
    updatedAt: { value: "2024-06-15T12:00:00.000Z", precision: "exact" },
  };
}

const v1 = version("v-one", 1, "SUPERSEDED");
const v2 = version("v-two", 2, "SUPERSEDED");
const v3 = version("v-three", 3, "ACTIVE");

describe("PR-7 deriveVersionViewState", () => {
  it("surfaces an honest unsupported state when the seam exposes no historical surface", () => {
    const view = deriveVersionViewState({
      selection: CURRENT_VERSION_SELECTION,
      currentVersion: v3,
      selectedVersion: null,
      listingAvailable: false,
      pending: false,
    });
    expect(view.kind).toBe("unsupported");
    expect(view.kind === "unsupported" && view.reason).toMatch(/not available on this provider seam/);
  });

  it("lets unsupported win over a pending historical selection — never fabricates", () => {
    const view = deriveVersionViewState({
      selection: { mode: "historical", versionId: v1.id },
      currentVersion: v3,
      selectedVersion: v1,
      listingAvailable: false,
      pending: true,
    });
    expect(view.kind).toBe("unsupported");
  });

  it("is loading while pending with nothing resolved yet", () => {
    expect(
      deriveVersionViewState({
        selection: CURRENT_VERSION_SELECTION,
        currentVersion: null,
        selectedVersion: null,
        listingAvailable: true,
        pending: true,
      }).kind,
    ).toBe("loading");
  });

  it("stays loading while pending even if the current version resolved", () => {
    expect(
      deriveVersionViewState({
        selection: CURRENT_VERSION_SELECTION,
        currentVersion: v3,
        selectedVersion: null,
        listingAvailable: true,
        pending: true,
      }).kind,
    ).toBe("loading");
  });

  it("does not downgrade an already-resolved historical selection to loading", () => {
    const view = deriveVersionViewState({
      selection: { mode: "historical", versionId: v1.id },
      currentVersion: null,
      selectedVersion: v1,
      listingAvailable: true,
      pending: true,
    });
    expect(view.kind).toBe("historical");
    expect(view.kind === "historical" && view.version.id).toBe(v1.id);
  });

  it("resolves the current ACTIVE version in current mode", () => {
    const view = deriveVersionViewState({
      selection: CURRENT_VERSION_SELECTION,
      currentVersion: v3,
      selectedVersion: null,
      listingAvailable: true,
      pending: false,
    });
    expect(view.kind).toBe("current");
    expect(view.kind === "current" && view.version.id).toBe(v3.id);
  });

  it("resolves loading when current mode has no resolved version yet", () => {
    expect(
      deriveVersionViewState({
        selection: CURRENT_VERSION_SELECTION,
        currentVersion: null,
        selectedVersion: null,
        listingAvailable: true,
        pending: false,
      }).kind,
    ).toBe("loading");
  });

  it("NEVER falls back to the current graph for a historical selection", () => {
    const view = deriveVersionViewState({
      selection: { mode: "historical", versionId: v1.id },
      currentVersion: v3,
      selectedVersion: v1,
      listingAvailable: true,
      pending: false,
    });
    expect(view.kind).toBe("historical");
    expect(view.kind === "historical" && view.version.id).toBe(v1.id);
  });

  it("reports historical-unavailable (not the current graph) when the selected version has no surface", () => {
    const view = deriveVersionViewState({
      selection: { mode: "historical", versionId: "v-ghost" },
      currentVersion: v3,
      selectedVersion: null,
      listingAvailable: true,
      pending: false,
    });
    expect(view.kind).toBe("historical-unavailable");
    expect(view.kind === "historical-unavailable" && view.reason).toBe(HISTORICAL_SURFACE_UNAVAILABLE);
  });
});

describe("PR-7 historical integrity guards", () => {
  it("isHistoricalView distinguishes current from historical", () => {
    expect(isHistoricalView(CURRENT_VERSION_SELECTION)).toBe(false);
    expect(isHistoricalView({ mode: "historical", versionId: v1.id })).toBe(true);
  });

  it("realtimeMayMutateVisibleGraph is true in current mode", () => {
    expect(realtimeMayMutateVisibleGraph(CURRENT_VERSION_SELECTION)).toBe(true);
  });

  it("realtimeMayMutateVisibleGraph is false in historical mode — no silent historical mutation", () => {
    expect(realtimeMayMutateVisibleGraph({ mode: "historical", versionId: v1.id })).toBe(false);
  });
});

describe("PR-7 version list helpers", () => {
  it("sorts the series ascending by versionNumber", () => {
    const sorted = sortVersionsByNumber([v3, v1, v2]);
    expect(sorted.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
  });

  it("does not mutate the input array", () => {
    const input = [v3, v1];
    sortVersionsByNumber(input);
    expect(input.map((v) => v.versionNumber)).toEqual([3, 1]);
  });

  it("activeVersion prefers the ACTIVE projection even when not the newest number", () => {
    const olderActive = version("v-old-active", 1, "ACTIVE");
    const newestSuperseded = version("v-new-superseded", 5, "SUPERSEDED");
    expect(activeVersion([newestSuperseded, olderActive])?.id).toBe(olderActive.id);
  });

  it("activeVersion falls back to the newest version when nothing is ACTIVE", () => {
    expect(activeVersion([v1, v2])?.id).toBe(v2.id);
  });

  it("activeVersion is null for an empty series", () => {
    expect(activeVersion([])).toBeNull();
  });

  it("versionLabel formats a compact label", () => {
    expect(versionLabel(v3)).toBe("v3");
  });
});

describe("PR-7 selection defaults", () => {
  it("CURRENT_VERSION_SELECTION is current mode with no version id", () => {
    expect(CURRENT_VERSION_SELECTION).toEqual({ mode: "current", versionId: null });
  });
});