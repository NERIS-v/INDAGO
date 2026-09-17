// ============================================================================
// PR-8 — Relation Authority: pure model (relation-authority.ts)
//
// The provider-agnostic authority model: transition legality, expected-status
// mapping, the demo/live gate, and target construction. Mirrors the platform's
// durable lifecycle — PROPOSED→ACCEPTED/REJECTED, ACCEPTED|REJECTED→REVERSED —
// so the panel disables buttons honestly without a provider round-trip.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  RELATION_AUTHORITY_ACTIONS,
  RELATION_AUTHORITY_ACTION_LABEL,
  RELATION_AUTHORITY_ACTION_HINT,
  RELATION_STATUS_LABEL,
  RELATION_AUTHORITY_LEGAL_FROM,
  relationAuthorityAllows,
  relationAuthorityExpectedStatus,
  relationAuthorityAvailable,
  relationAuthorityTarget,
} from "@/lib/context/relation-authority";
import type { RelationHypothesis, RelationStatus } from "@indago/contracts";

function relation(overrides: Partial<RelationHypothesis> = {}): RelationHypothesis {
  return {
    id: "b1e0c9a6-0000-4000-8000-000000000055",
    sourceEntityId: "b1e0c9a6-0000-4000-8000-000000000041",
    targetEntityId: "b1e0c9a6-0000-4000-8000-000000000043",
    relationType: "FINANCIAL",
    status: "PROPOSED",
    support: 0.7,
    updatedAt: { value: "2026-01-01T00:00:00.000Z", precision: "exact" },
    ...overrides,
  } as RelationHypothesis;
}

describe("PR-8 — transition legality table", () => {
  it("declares the exact lifecycle for each action", () => {
    expect([...RELATION_AUTHORITY_LEGAL_FROM.accept]).toEqual(["PROPOSED"]);
    expect([...RELATION_AUTHORITY_LEGAL_FROM.reject]).toEqual(["PROPOSED"]);
    expect([...RELATION_AUTHORITY_LEGAL_FROM.reverse].sort()).toEqual(["ACCEPTED", "REJECTED"]);
  });

  it("relationAuthorityAllows exactly matches the table", () => {
    const statuses: RelationStatus[] = ["PROPOSED", "ACCEPTED", "REJECTED", "REVERSED"];
    const expected: Record<"accept" | "reject" | "reverse", boolean[]> = {
      accept: [true, false, false, false],
      reject: [true, false, false, false],
      reverse: [false, true, true, false],
    };
    for (const action of RELATION_AUTHORITY_ACTIONS) {
      for (const [i, status] of statuses.entries()) {
        expect(relationAuthorityAllows(action, status)).toBe(expected[action][i]);
      }
    }
  });

  it("reports the status a successful mutation must carry", () => {
    expect(relationAuthorityExpectedStatus("accept")).toBe("ACCEPTED");
    expect(relationAuthorityExpectedStatus("reject")).toBe("REJECTED");
    expect(relationAuthorityExpectedStatus("reverse")).toBe("REVERSED");
  });

  it("exposes stable labels and hints for the panel/rail surface", () => {
    expect(RELATION_AUTHORITY_ACTION_LABEL.accept).toBe("Accept");
    expect(RELATION_AUTHORITY_ACTION_LABEL.reject).toBe("Reject");
    expect(RELATION_AUTHORITY_ACTION_LABEL.reverse).toBe("Reverse");
    expect(RELATION_AUTHORITY_ACTION_HINT.accept).toContain("Endorse");
    expect(RELATION_STATUS_LABEL.REVERSED).toBe("Reversed");
  });
});

describe("PR-8 — the demo/live authority gate", () => {
  it("opens authority in demo mode", () => {
    const gate = relationAuthorityAvailable("demo");
    expect(gate.available).toBe(true);
    expect(gate.unavailableReason).toBeUndefined();
  });

  it("opens authority honestly in live mode (PR-21 — live authority is genuinely wired)", () => {
    const gate = relationAuthorityAvailable("live");
    expect(gate.available).toBe(true);
    expect(gate.unavailableReason).toBeUndefined();
  });
});

describe("PR-8 — authority target construction", () => {
  it("builds a well-formed accept target without a reason", () => {
    expect(relationAuthorityTarget("accept", relation())).toEqual({
      action: "accept",
      relationHypothesisId: "b1e0c9a6-0000-4000-8000-000000000055",
    });
  });

  it("trimmed reasons are preserved, blank/spaces omitted", () => {
    const r = relation({ status: "PROPOSED" });
    expect(
      relationAuthorityTarget("reject", r, "  weak support  ").reason,
    ).toBe("weak support");
    expect(relationAuthorityTarget("reject", r, "   ").reason).toBeUndefined();
    expect(relationAuthorityTarget("reject", r, undefined).reason).toBeUndefined();
  });

  it("throws without a provider round-trip on an illegal transition", () => {
    expect(() => relationAuthorityTarget("accept", relation({ status: "ACCEPTED" }))).toThrow(
      /does not support the "accept" authority action/,
    );
    expect(() => relationAuthorityTarget("reverse", relation({ status: "PROPOSED" }))).toThrow(
      /does not support the "reverse" authority action/,
    );
  });

  it("REVERSED is a lifecycle terminal, not deletion (REVERSED status still resolves)", () => {
    const reversed = relation({ status: "REVERSED" });
    expect(relationAuthorityAllows("accept", "REVERSED")).toBe(false);
    expect(relationAuthorityAllows("reverse", "REVERSED")).toBe(false);
    expect(reversed.status).toBe("REVERSED");
  });
});