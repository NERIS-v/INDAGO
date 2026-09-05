import { describe, it, expect } from "vitest";
import {
  DEFAULT_NETWORK_VIEW,
  NETWORK_VIEWS,
  isNetworkView,
  parseNetworkView,
  networkViewLabel,
  isNetworkTimeRange,
  createDefaultNetworkWorkspaceState,
} from "@/lib/network/network-workspace";

describe("F-PR5 — network-workspace model (pure)", () => {
  it("declares graph as the default and ONLY implemented representation", () => {
    expect(DEFAULT_NETWORK_VIEW).toBe("graph");
    expect(NETWORK_VIEWS).toEqual(["graph", "pulse", "matrix", "flow"]);
    expect(isNetworkView("graph")).toBe(true);
    expect(isNetworkView("pulse")).toBe(true);
    expect(isNetworkView("anything-else")).toBe(false);
    expect(isNetworkView(null)).toBe(false);
    expect(isNetworkView(undefined)).toBe(false);
  });

  it("parses a wire ?view= value strictly", () => {
    expect(parseNetworkView("flow")).toBe("flow");
    expect(parseNetworkView("graph")).toBe("graph");
    expect(parseNetworkView("timeline")).toBeNull();
    expect(parseNetworkView("")).toBeNull();
    expect(parseNetworkView(null)).toBeNull();
    expect(parseNetworkView(undefined)).toBeNull();
  });

  it("labels every declared representation without inventing UI", () => {
    expect(networkViewLabel("graph")).toBe("Network");
    expect(networkViewLabel("pulse")).toBe("Entity Pulse");
    expect(networkViewLabel("matrix")).toBe("Matrix");
    expect(networkViewLabel("flow")).toBe("Adaptive Flow");
  });

  it("validates the shared temporal scope contract ([start,end], start<=end)", () => {
    expect(isNetworkTimeRange([1, 100])).toBe(true);
    expect(isNetworkTimeRange([0, 0])).toBe(true);
    expect(isNetworkTimeRange([100, 1])).toBe(false);
    expect(isNetworkTimeRange(null)).toBe(false);
    expect(isNetworkTimeRange(undefined)).toBe(false);
    expect(isNetworkTimeRange([1, 2, 3])).toBe(false);
    expect(isNetworkTimeRange([1])).toBe(false);
    expect(isNetworkTimeRange(["1", 2])).toBe(false);
    expect(isNetworkTimeRange([Infinity, 2])).toBe(false);
  });

  it("defaults the workspace state to graph / full scope / no focus", () => {
    expect(createDefaultNetworkWorkspaceState()).toEqual({
      activeNetworkView: "graph",
      timeRange: null,
      focusEntityId: null,
    });
  });
});