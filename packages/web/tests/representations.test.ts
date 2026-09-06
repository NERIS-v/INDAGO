import { describe, it, expect } from "vitest";
import {
  GRAPH_PRESENTATION,
  PULSE_PRESENTATION,
  NOT_READY_PRESENTATION,
  MATRIX_PRESENTATION,
  FLOW_PRESENTATION,
  presentationFor,
} from "@/lib/network/representations";

describe("F-PR6/F-PR7/F-PR8 — typed five-zone presentation model", () => {
  it("maps the Graph representation to the unchanged five-zone graph presentation", () => {
    for (const served of [true, false]) {
      expect(presentationFor("graph", served, served, served)).toBe(GRAPH_PRESENTATION);
    }
    expect(GRAPH_PRESENTATION).toEqual({
      zoneOne: "graph-rail",
      zoneTwo: "graph",
      zoneThree: "graph-context",
      zoneFourNote: "none",
      zoneFive: "intelligence",
    });
  });

  it("maps a served Entity Pulse to the pulse content across ALL five zones", () => {
    expect(presentationFor("pulse", true, true, true)).toBe(PULSE_PRESENTATION);
    expect(PULSE_PRESENTATION).toEqual({
      zoneOne: "pulse-rail",
      zoneTwo: "pulse",
      zoneThree: "pulse-context",
      zoneFourNote: "pulse",
      zoneFive: "pulse",
    });
  });

  it("maps a served Cross-Case Matrix to the matrix content across ALL five zones", () => {
    expect(presentationFor("matrix", true, true, true)).toBe(MATRIX_PRESENTATION);
    expect(MATRIX_PRESENTATION).toEqual({
      zoneOne: "matrix-rail",
      zoneTwo: "matrix",
      zoneThree: "matrix-context",
      zoneFourNote: "matrix",
      zoneFive: "matrix",
    });
  });

  it("maps a served Adaptive Flow to the flow content across ALL five zones", () => {
    expect(presentationFor("flow", true, true, true)).toBe(FLOW_PRESENTATION);
    expect(FLOW_PRESENTATION).toEqual({
      zoneOne: "flow-rail",
      zoneTwo: "flow",
      zoneThree: "flow-context",
      zoneFourNote: "flow",
      zoneFive: "flow",
    });
  });

  it("maps an explicit-live (unsupported) pulse to a typed not-ready presentation", () => {
    expect(presentationFor("pulse", false, true, true)).toBe(NOT_READY_PRESENTATION);
    expect(NOT_READY_PRESENTATION.zoneTwo).toBe("not-ready");
    // Supporting zones fall back to the graph presentation — never a fake pulse.
    expect(NOT_READY_PRESENTATION.zoneOne).toBe("graph-rail");
    expect(NOT_READY_PRESENTATION.zoneFourNote).toBe("none");
  });

  it("maps an unsupported matrix to a typed not-ready presentation", () => {
    expect(presentationFor("matrix", true, false, true)).toBe(NOT_READY_PRESENTATION);
    expect(presentationFor("matrix", false, false, true)).toBe(NOT_READY_PRESENTATION);
  });

  it("maps an unsupported Adaptive Flow to a typed not-ready presentation", () => {
    expect(presentationFor("flow", true, true, false)).toBe(NOT_READY_PRESENTATION);
    expect(presentationFor("flow", false, false, false)).toBe(NOT_READY_PRESENTATION);
  });
});