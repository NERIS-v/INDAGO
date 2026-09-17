import { describe, it, expect } from "vitest";
import {
  CAPABILITY_AVAILABILITY,
  resolveCapabilityStatus,
  createCapabilityStatusTable,
  type NetworkDataModeConfig,
} from "@/lib/providers/capabilities";

function config(
  mode: NetworkDataModeConfig["mode"],
  isDevelopment: boolean,
): NetworkDataModeConfig {
  return { mode, isDevelopment };
}

describe("F-PR5 — capability availability registry", () => {
  it("declares exactly the documented demo/live availability", () => {
    for (const live of [
      "investigation", "evidence", "observations", "cases", "realtime",
      // PR-20: Phase-4 capabilities are now live-available.
      "graph", "leads", "crossCase",
      // PR-21: entities + relations (entity hypotheses, canonical relations and
      // relation authority) are genuinely live-wired.
      "entities", "relations",
    ] as const) {
      expect(CAPABILITY_AVAILABILITY[live], live).toEqual({ demo: true, live: true });
    }
    for (const demoOnly of [
      "intelligence", "timeline",
      "gaps", "review", "robustness", "hypotheses",
    ] as const) {
      expect(CAPABILITY_AVAILABILITY[demoOnly], demoOnly).toEqual({ demo: true, live: false });
    }
    expect(CAPABILITY_AVAILABILITY["network.graph"]).toEqual({ demo: true, live: false });
    // PR-23: Pulse / Matrix / Flow are frontend-derived visualizations whose
    // authoritative INPUTS resolve through the live provider seams in a live
    // workspace, so they are genuinely live-served (distinct from any claimed
    // backend "pulse/flow/matrix" analytics API, which does not exist).
    expect(CAPABILITY_AVAILABILITY["network.pulse"]).toEqual({ demo: true, live: true });
    expect(CAPABILITY_AVAILABILITY["network.matrix"]).toEqual({ demo: true, live: true });
    expect(CAPABILITY_AVAILABILITY["network.flow"]).toEqual({ demo: true, live: true });
  });
});

describe("F-PR5 — resolveCapabilityStatus matrix", () => {
  it("demo workspace: demo-available -> demo; otherwise not-ready", () => {
    expect(resolveCapabilityStatus("graph", config("demo", true), "demo")).toBe("demo");
    expect(resolveCapabilityStatus("network.graph", config("auto", true), "demo")).toBe("demo");
    expect(resolveCapabilityStatus("network.pulse", config("auto", true), "demo")).toBe("demo");
    expect(resolveCapabilityStatus("network.matrix", config("auto", true), "demo")).toBe("demo");
    expect(resolveCapabilityStatus("network.flow", config("demo", true), "demo")).toBe("demo");
  });

  it("live workspace + explicit config.mode live: never a silent demo", () => {
    expect(resolveCapabilityStatus("evidence", config("live", true), "live")).toBe("live");
    expect(resolveCapabilityStatus("graph", config("live", true), "live")).toBe("live");
    expect(resolveCapabilityStatus("timeline", config("live", true), "live")).toBe("not-ready");
    // PR-23: network.pulse is live-served in explicit live (its live provider
    // seams drive it), so it is "live" — never a silent demo fallback.
    expect(resolveCapabilityStatus("network.pulse", config("live", false), "live")).toBe("live");
  });

  it("live workspace + config.mode demo is still never -demo- served", () => {
    // A config.mode of "demo" does not unlock live capabilities: the workspace
    // is live and the capability is not live-available -> typed not-ready.
    // A live-available capability is ALWAYS served live, regardless of config.
    expect(resolveCapabilityStatus("graph", config("demo", true), "live")).toBe("live");
    expect(resolveCapabilityStatus("timeline", config("demo", true), "live")).toBe("not-ready");
  });

  it("live workspace + AUTO: live wins, demo-only is served by demo, nothing-available is not-ready", () => {
    expect(resolveCapabilityStatus("evidence", config("auto", true), "live")).toBe("live");
    expect(resolveCapabilityStatus("graph", config("auto", true), "live")).toBe("live");
    expect(resolveCapabilityStatus("gaps", config("auto", true), "live")).toBe("demo");
    expect(resolveCapabilityStatus("timeline", config("auto", true), "live")).toBe("demo");
    // PR-23: the Cross-Case Matrix is frontend-derived but live-served, so AUTO
    // serves it LIVE (a live implementation exists), never demo.
    expect(resolveCapabilityStatus("network.matrix", config("auto", true), "live")).toBe("live");
    // The Adaptive Flow is similarly live-served under AUTO.
    expect(resolveCapabilityStatus("network.flow", config("auto", true), "live")).toBe("live");
  });

  it("live workspace + AUTO: capability-level, uniform in dev AND prod", () => {
    for (const isDev of [true, false]) {
      const here = config("auto", isDev);
      // Live-implemented capabilities stay live in both.
      expect(resolveCapabilityStatus("evidence", here, "live")).toBe("live");
      expect(resolveCapabilityStatus("graph", here, "live")).toBe("live");
      expect(resolveCapabilityStatus("leads", here, "live")).toBe("live");
      // Demo-only capabilities fall back to the demo provider in both (the
      // AUTO bundle genuinely serves them; never merely declared). The
      // network representations are frontend-derived but live-served, so they
      // stay live in both dev and prod.
      expect(resolveCapabilityStatus("gaps", here, "live")).toBe("demo");
      expect(resolveCapabilityStatus("timeline", here, "live")).toBe("demo");
      expect(resolveCapabilityStatus("network.pulse", here, "live")).toBe("live");
      expect(resolveCapabilityStatus("network.matrix", here, "live")).toBe("live");
      // The Adaptive Flow is frontend-derived and live-served, so it stays live.
      expect(resolveCapabilityStatus("network.flow", here, "live")).toBe("live");
    }
  });

  it("reports the full table for both bundle creators", () => {
    const demo = createCapabilityStatusTable(config("demo", true), "demo");
    expect(demo["network.graph"]).toBe("demo");
    expect(demo["graph"]).toBe("demo");
    expect(demo["network.pulse"]).toBe("demo");
    expect(demo["network.matrix"]).toBe("demo");
    expect(demo["network.flow"]).toBe("demo");
    expect(demo["timeline"]).toBe("demo");

    const live = createCapabilityStatusTable(config("live", false), "live");
    expect(live["evidence"]).toBe("live");
    expect(live["graph"]).toBe("live");
    expect(live["timeline"]).toBe("not-ready");
    expect(live["network.graph"]).toBe("not-ready");

    const autoDevLive = createCapabilityStatusTable(config("auto", true), "live");
    expect(autoDevLive["evidence"]).toBe("live");
    expect(autoDevLive["graph"]).toBe("live");
    expect(autoDevLive["gaps"]).toBe("demo");
    // PR-23: network representations are live-served in AUTO (live wins).
    expect(autoDevLive["network.pulse"]).toBe("live");
    expect(autoDevLive["network.matrix"]).toBe("live");
    expect(autoDevLive["network.flow"]).toBe("live");

    // Every declared capability key resolves to a valid status.
    for (const key of Object.keys(CAPABILITY_AVAILABILITY)) {
      expect(["demo", "live", "not-ready"]).toContain(demo[key]);
    }
  });

  it("keeps representations honest: flow/pulse/matrix are live-served in live and AUTO (frontend-derived but live-input driven)", () => {
    // PR-23: these are frontend-derived visualizations whose authoritative
    // INPUTS resolve through live provider seams, so both explicit live and
    // AUTO serve them LIVE. They are NOT claimed as backend analytics APIs.
    for (const mode of ["live", "auto"] as const) {
      for (const isDev of [true, false]) {
        const cfg = config(mode, isDev);
        const flow = resolveCapabilityStatus("network.flow", cfg, "live");
        expect(flow, "network.flow in " + mode).toBe("live");
        for (const cap of ["network.pulse", "network.matrix", "network.flow"] as const) {
          const status = resolveCapabilityStatus(cap, cfg, "live");
          expect(status, cap + " in " + mode).toBe("live");
        }
      }
    }
  });
});