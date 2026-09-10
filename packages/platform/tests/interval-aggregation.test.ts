import { describe, expect, it } from "vitest";
import { deriveValidityInterval } from "../src/temporal/interval-aggregation.js";
import type { Observation } from "@indago/contracts";

// ============================================================================
// M-A12 WS-3 validity-interval aggregation — pure unit tests (no DB).
//
// `deriveValidityInterval` produces the proposed relation's domain-validity
// closed interval from the REAL observed instants of its supporting
// observations (min..max). It NEVER fabricates: a supporting observation without
// an explicit, parseable, finite instant is skipped rather than coerced, and an
// absent contribution set yields `undefined` — the relation stays truthfully
// un-validated instead of receiving an invented boundary.
//
// Maps to the G2/G3 plan sections from docs/roadmap/development-plan.md.
// ============================================================================

function observation(overrides: Partial<Observation> & { id: string }): Observation {
  return {
    evidenceId: "ev-alt-0000-0000-0000-000000000001",
    sourceId: "src-alt-0000-0000-0000-000000000001",
    type: "TEMPORAL",
    content: "test observation",
    entityIds: [],
    candidateMentions: [],
    strength: "corroborating",
    provenance: { extractor: "test", extractionMethod: "test" },
    createdAt: { value: "2026-08-01T00:00:00.000Z", precision: "exact" as const },
    updatedAt: { value: "2026-08-01T00:00:00.000Z", precision: "exact" as const },
    eventTime: undefined,
    validityInterval: undefined,
    ...overrides,
  };
}

describe("deriveValidityInterval (WS-3)", () => {
  const exact = (value: string, precision = "exact" as const) => ({ value, precision });

  it("single explicit instant → open-ended interval from that instant", () => {
    const r = deriveValidityInterval([
      observation({ id: "o1", eventTime: exact("2026-08-10T12:00:00.000Z") }),
    ]);
    expect(r).toEqual({
      validFrom: { value: "2026-08-10T12:00:00.000Z", precision: "exact" },
      validTo: undefined,
      precision: "exact",
      semantics: "inferred",
    });
  });

  it("multiple explicit instants → closed min..max range, precision exact (all bounds exact)", () => {
    const r = deriveValidityInterval([
      observation({ id: "o1", eventTime: exact("2026-08-10T12:00:00.000Z") }),
      observation({ id: "o2", eventTime: exact("2026-08-14T09:30:00.000Z") }),
      observation({ id: "o3", eventTime: exact("2026-08-12T08:00:00.000Z") }),
    ]);
    expect(r).toEqual({
      validFrom: { value: "2026-08-10T12:00:00.000Z", precision: "exact" },
      validTo: { value: "2026-08-14T09:30:00.000Z", precision: "exact" },
      precision: "exact",
      semantics: "inferred",
    });
  });

  it("any non-exact contributor downgrades interval precision to range", () => {
    const r = deriveValidityInterval([
      observation({ id: "o1", eventTime: exact("2026-08-10T12:00:00.000Z") }),
      observation({
        id: "o2",
        eventTime: { value: "2026-08-14T09:30:00.000Z", precision: "hour" },
      }),
    ]);
    expect(r?.precision).toBe("range");
    expect(r?.validTo?.value).toBe("2026-08-14T09:30:00.000Z");
  });

  it("all-exact instants → precision exact", () => {
    const r = deriveValidityInterval([
      observation({ id: "o1", eventTime: exact("2026-08-10T00:00:00.000Z") }),
    ]);
    expect(r?.precision).toBe("exact");
  });

  it("aggregates only eventTime instants into a closed min..max span", () => {
    expect(
      deriveValidityInterval([
        observation({
          id: "o1",
          eventTime: exact("2026-08-01T00:00:00.000Z"),
          validityInterval: {
            validFrom: { value: "2026-08-01T00:00:00.000Z", precision: "exact" },
            precision: "exact",
            semantics: "observed",
          },
        }),
        observation({ id: "o2", eventTime: exact("2026-08-20T00:00:00.000Z") }),
      ])?.validTo?.value,
    ).toBe("2026-08-20T00:00:00.000Z");
    expect(
      deriveValidityInterval([
        observation({
          id: "o1",
          eventTime: exact("2026-08-01T00:00:00.000Z"),
        }),
        observation({ id: "o2", eventTime: exact("2026-08-20T00:00:00.000Z") }),
      ])?.validFrom.value,
    ).toBe("2026-08-01T00:00:00.000Z");
  });

  it("no explicit parseable instant → undefined (no fabrication)", () => {
    expect(
      deriveValidityInterval([
        observation({ id: "o1", eventTime: exact("early March", "approximate") }),
        observation({
          id: "o2",
          eventTime: undefined,
          validityInterval: {
            validFrom: { value: "2026-08", precision: "month" },
            precision: "month",
            semantics: "observed",
          },
        }),
      ]),
    ).toBeUndefined();
  });

  it("empty support set → undefined", () => {
    expect(deriveValidityInterval([])).toBeUndefined();
  });
});