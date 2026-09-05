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
    for (const live of ["investigation", "evidence", "observations", "cases", "realtime"] as const) {
      expect(CAPABILITY_AVAILABILITY[live], live).toEqual({ demo: true, live: true });
    }
    for (const demoOnly of [
      "entities", "graph", "relations", "intelligence", "timeline",
      "leads", "gaps", "review", "robustness", "hypotheses", "crossCase",
    ] as const) {
      expect(CAPABILITY_AVAILABILITY[demoOnly], demoOnly).toEqual({ demo: true, live: false });
    }
    expect(CAPABILITY_AVAILABILITY["network.graph"]).toEqual({ demo: true, live: false });
    expect(CAPABILITY_AVAILABILITY["network.pulse"]).toEqual({ demo: false, live: false });
    expect(CAPABILITY_AVAILABILITY["network.matrix"]).toEqual({ demo: false, live: false });
    expect(CAPABILITY_AVAILABILITY["network.flow"]).toEqual({ demo: false, live: false });
  });
});

describe("F-PR5 — resolveCapabilityStatus matrix", () => {
  it("demo workspace: demo-available -> demo; otherwise not-ready", () => {
    expect(resolveCapabilityStatus("graph", config("demo", true), "demo")).toBe("demo");
    expect(resolveCapabilityStatus("network.graph", config("auto", true), "demo")).toBe("demo");
    expect(resolveCapabilityStatus("network.pulse", config("auto", true), "demo")).toBe("not-ready");
    expect(resolveCapabilityStatus("network.flow", config("demo", true), "demo")).toBe("not-ready");
  });

  it("live workspace + explicit config.mode live: never a silent demo", () => {
    expect(resolveCapabilityStatus("evidence", config("live", true), "live")).toBe("live");
    expect(resolveCapabilityStatus("graph", config("live", true), "live")).toBe("not-ready");
    expect(resolveCapabilityStatus("timeline", config("live", true), "live")).toBe("not-ready");
    expect(resolveCapabilityStatus("network.pulse", config("live", false), "live")).toBe("not-ready");
  });

  it("live workspace + config.mode demo is still never -demo- served", () => {
    // A config.mode of "demo" does not unlock live capabilities: the workspace
    // is live and the capability is not live-available -> typed not-ready.
    expect(resolveCapabilityStatus("graph", config("demo", true), "live")).toBe("not-ready");
    expect(resolveCapabilityStatus("timeline", config("demo", true), "live")).toBe("not-ready");
  });

  it("live workspace + AUTO: live wins, demo-only is served by demo, nothing-available is not-ready", () => {
    expect(resolveCapabilityStatus("evidence", config("auto", true), "live")).toBe("live");
    expect(resolveCapabilityStatus("graph", config("auto", true), "live")).toBe("demo");
    expect(resolveCapabilityStatus("timeline", config("auto", true), "live")).toBe("demo");
    // Neither demo nor live can serve it: typed not-ready (never a fake).
    expect(resolveCapabilityStatus("network.flow", config("auto", true), "live")).toBe("not-ready");
  });

  it("live workspace + AUTO: capability-level, uniform in dev AND prod", () => {
    for (const isDev of [true, false]) {
      const here = config("auto", isDev);
      // Live-implemented capabilities stay live in both.
      expect(resolveCapabilityStatus("evidence", here, "live")).toBe("live");
      // Demo-only capabilities fall back to the demo provider in both (the
      // AUTO bundle genuinely serves them; never merely declared).
      expect(resolveCapabilityStatus("graph", here, "live")).toBe("demo");
      expect(resolveCapabilityStatus("timeline", here, "live")).toBe("demo");
      // Neither implementation -> typed not-ready (never a fake) in both.
      expect(resolveCapabilityStatus("network.pulse", here, "live")).toBe("not-ready");
    }
  });

  it("reports the full table for both bundle creators", () => {
    const demo = createCapabilityStatusTable(config("demo", true), "demo");
    expect(demo["network.graph"]).toBe("demo");
    expect(demo["graph"]).toBe("demo");
    expect(demo["network.pulse"]).toBe("not-ready");
    expect(demo["timeline"]).toBe("demo");

    const live = createCapabilityStatusTable(config("live", false), "live");
    expect(live["evidence"]).toBe("live");
    expect(live["graph"]).toBe("not-ready");
    expect(live["timeline"]).toBe("not-ready");
    expect(live["network.graph"]).toBe("not-ready");

    const autoDevLive = createCapabilityStatusTable(config("auto", true), "live");
    expect(autoDevLive["evidence"]).toBe("live");
    expect(autoDevLive["graph"]).toBe("demo");
    expect(autoDevLive["network.pulse"]).toBe("not-ready");

    // Every declared capability key resolves to a valid status.
    for (const key of Object.keys(CAPABILITY_AVAILABILITY)) {
      expect(["demo", "live", "not-ready"]).toContain(demo[key]);
    }
  });

  it("keeps representations honest: pulse/matrix/flow are never demo-served in a LIVE workspace", () => {
    for (const mode of ["live", "auto"] as const) {
      for (const isDev of [true, false]) {
        const cfg = config(mode, isDev);
        for (const cap of ["network.pulse", "network.matrix", "network.flow"] as const) {
          const status = resolveCapabilityStatus(cap, cfg, "live");
          expect(["live", "not-ready"], `${cap} in ${mode}/${isDev}`).toContain(status);
        }
      }
    }
  });
});