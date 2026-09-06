// ============================================================================
// F-PR14 — workspace readability filter URL serialization (pure)
//
// The filter is DETERMINISTIC and REST-ful: explicit values only exist on the
// wire when the filter is active. Absent or corrupted params always resolve to
// the unfiltered default so corrupted URLs can never crash the workspace.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  NETWORK_SUPPORT_PARAM,
  NETWORK_HIDEC_PARAM,
  readNetworkFilter,
  networkFilterToParams,
} from "@/lib/workspace/url";
import { DEFAULT_GRAPH_FILTER } from "@/lib/graph/graph-filter";

function params(search: string): URLSearchParams {
  return new URLSearchParams(search);
}

describe("F-PR14 — readNetworkFilter (pure URL parse)", () => {
  it("defaults when the params are absent or null", () => {
    expect(readNetworkFilter(params(""))).toEqual(DEFAULT_GRAPH_FILTER);
    expect(readNetworkFilter(params("caseId=c-1&view=graph"))).toEqual(
      DEFAULT_GRAPH_FILTER,
    );
    expect(readNetworkFilter(null)).toEqual(DEFAULT_GRAPH_FILTER);
  });

  it("reads support and hidec from the wire", () => {
    expect(
      readNetworkFilter(params("support=0.5&hidec=1")),
    ).toEqual({ minSupport: 0.5, hideContradicted: true });
    expect(readNetworkFilter(params("support=0.6&hidec=0"))).toEqual({
      minSupport: 0.6,
      hideContradicted: false,
    });
  });

  it("accepts true spellings for hidec", () => {
    expect(readNetworkFilter(params("hidec=true"))).toEqual({
      minSupport: 0,
      hideContradicted: true,
    });
  });

  it("resolves malformed values to the default (determinism over noise)", () => {
    expect(readNetworkFilter(params("support=bogus"))).toEqual(
      DEFAULT_GRAPH_FILTER,
    );
    expect(readNetworkFilter(params("support=-3"))).toEqual(
      DEFAULT_GRAPH_FILTER,
    );
    expect(readNetworkFilter(params("hidec=y"))).toEqual(DEFAULT_GRAPH_FILTER);
    expect(readNetworkFilter(params("support=&hidec=1"))).toEqual({
      minSupport: 0,
      hideContradicted: true,
    });
  });

  it("clamps support at the workbook maximum (MIN_SUPPORT_MAX 0.6)", () => {
    expect(readNetworkFilter(params("support=0.9")).minSupport).toBe(0.6);
    expect(readNetworkFilter(params("support=0.6")).minSupport).toBe(0.6);
    expect(readNetworkFilter(params("support=0.2")).minSupport).toBe(0.2);
  });
});

describe("F-PR14 — networkFilterToParams (default-drop serialization)", () => {
  it("serializes both active dimensions with the wire names", () => {
    const entries = networkFilterToParams({
      minSupport: 0.5,
      hideContradicted: true,
    });
    expect(entries).toEqual([
      { key: NETWORK_SUPPORT_PARAM, value: "0.5" },
      { key: NETWORK_HIDEC_PARAM, value: "1" },
    ]);
  });

  it("serializes each dimension alone", () => {
    expect(
      networkFilterToParams({ minSupport: 0.4, hideContradicted: false }),
    ).toEqual([{ key: NETWORK_SUPPORT_PARAM, value: "0.4" }]);
    expect(
      networkFilterToParams({ minSupport: 0, hideContradicted: true }),
    ).toEqual([{ key: NETWORK_HIDEC_PARAM, value: "1" }]);
  });

  it("drops the default filter to an empty entry set (REST-ful)", () => {
    expect(networkFilterToParams(DEFAULT_GRAPH_FILTER)).toEqual([]);
    expect(
      networkFilterToParams({ minSupport: 0, hideContradicted: false }),
    ).toEqual([]);
  });

  it("round-trips through readNetworkFilter", () => {
    const state = { minSupport: 0.5, hideContradicted: true };
    const rebuilt = new URLSearchParams(
      networkFilterToParams(state).map((e) => [e.key, e.value]),
    );
    expect(readNetworkFilter(rebuilt)).toEqual(state);
  });
});