import { describe, it, expect } from "vitest";
import {
  investigationUrl,
  appendCaseId,
  NETWORK_VIEW_PARAM,
  NETWORK_FOCUS_PARAM,
  NETWORK_ENTITY_PARAM,
  readNetworkView,
  readNetworkFocus,
  withSearchParam,
  withoutSearchParam,
  pathWithParams,
} from "@/lib/workspace/url";

function params(search: string): URLSearchParams {
  return new URLSearchParams(search);
}

describe("F-PR5 — network URL helpers (pure)", () => {
  it("reads the active representation from ?view=, defaulting to null when absent", () => {
    expect(readNetworkView(params(""))).toBeNull();
    expect(readNetworkView(params("view=matrix"))).toBe("matrix");
    expect(readNetworkView(params("view=graph&caseId=abc"))).toBe("graph");
    expect(readNetworkView(params("view=bogus"))).toBeNull();
    expect(readNetworkView(null)).toBeNull();
  });

  it("reads the durable focus target from ?focus=", () => {
    expect(readNetworkFocus(params(""))).toBeNull();
    expect(readNetworkFocus(params("focus=ent-victor"))).toBe("ent-victor");
    expect(readNetworkFocus(params("focus=&view=graph"))).toBe("");
    expect(readNetworkFocus(null)).toBeNull();
  });

  it("sets a param on a copy, preserving every existing param", () => {
    const next = withSearchParam(params("caseId=c-1&view=pulse"), "focus", "ent-1");
    expect(next.get("caseId")).toBe("c-1");
    expect(next.get("view")).toBe("pulse");
    expect(next.get("focus")).toBe("ent-1");
    // The input object is not mutated.
    const original = params("caseId=c-1");
    withSearchParam(original, "focus", "x");
    expect(original.has("focus")).toBe(false);
  });

  it("removes a param on a copy, preserving every other param", () => {
    const next = withoutSearchParam(
      params("caseId=c-1&view=flow&focus=ent-1"),
      "view",
    );
    expect(next.has("view")).toBe(false);
    expect(next.get("caseId")).toBe("c-1");
    expect(next.get("focus")).toBe("ent-1");
  });

  it("builds a path without a trailing '?' when the query is empty", () => {
    expect(pathWithParams("/investigations/i-1", params(""))).toBe(
      "/investigations/i-1",
    );
    expect(
      pathWithParams("/investigations/i-1", params("caseId=c-1&view=pulse")),
    ).toBe("/investigations/i-1?caseId=c-1&view=pulse");
  });

  it("preserves the existing caseId-invariant URL builders", () => {
    expect(investigationUrl("i-1", "c-1", "graph")).toBe(
      "/investigations/i-1/graph?caseId=c-1",
    );
    expect(investigationUrl("i-1", "c-1")).toBe(
      "/investigations/i-1?caseId=c-1",
    );
    expect(appendCaseId("/x?y=1", "c-1")).toBe("/x?y=1&caseId=c-1");
    expect(appendCaseId("/x", "")).toBe("/x");
  });

  it("declares the wire param names as expected by the state seam", () => {
    expect(NETWORK_VIEW_PARAM).toBe("view");
    expect(NETWORK_FOCUS_PARAM).toBe("focus");
    expect(NETWORK_ENTITY_PARAM).toBe("entity");
  });
});