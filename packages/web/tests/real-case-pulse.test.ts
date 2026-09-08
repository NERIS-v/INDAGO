// ============================================================================
// H. Paul Rico Case B activity — communication + financial channels
//
// The Case B workspace enriches Rico's pulse with COMM / FIN activity drawn
// strictly from base observations (OBS_B11, OBS_B12) — never invented by the
// pulse itself. Guards: (1) the base corpus carries those records referencing
// ENT_RICO, and (2) buildEntityPulseOverview surfaces communication + financial
// indicators for Rico.
// ============================================================================

import { describe, it, expect } from "vitest";
import { RAW_CASE_FIXTURES, caseBEnriched } from "@/lib/providers/real-case/index";
import { buildEntityPulseOverview } from "@/lib/network/pulse/pulse-model";
import {
  CASE_B_ID,
  ENT_RICO,
  OBS_B11,
  OBS_B12,
} from "@/lib/providers/real-case/lookup";

describe("Case B — H. Paul Rico communication / financial activity", () => {
  it("base corpus carries COMM (OBS_B11) + FIN (OBS_B12) records for Rico", () => {
    const raw = RAW_CASE_FIXTURES[CASE_B_ID]!;
    const obs = raw.observations.filter(
      (o) => o.id === OBS_B11 || o.id === OBS_B12,
    );
    expect(obs).toHaveLength(2);
    const byId = new Map(obs.map((o) => [o.id, o]));
    expect(byId.get(OBS_B11)?.type).toBe("COMMUNICATION");
    expect(byId.get(OBS_B11)?.entityIds).toContain(ENT_RICO);
    expect(byId.get(OBS_B12)?.type).toBe("FINANCIAL");
    expect(byId.get(OBS_B12)?.entityIds).toContain(ENT_RICO);
  });

  it("the pulse field for Rico derives communication + financial indicators", () => {
    const overview = buildEntityPulseOverview({
      nodes: caseBEnriched.graphNodes,
      observations: caseBEnriched.observations,
      timeRange: null,
    });
    const rico = overview.entities.find((e) => e.entityId === ENT_RICO);
    expect(rico).toBeDefined();
    const categories = rico!.indicators.map((i) => i.category);
    expect(categories).toContain("communication");
    expect(categories).toContain("financial");
  });
});