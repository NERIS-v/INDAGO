// ============================================================================
// PR-8 — Relation Authority: provider transition surface (demo + live)
//
// Verifies the DURABLE relation lifecycle enforced by the demo provider and the
// honest typed-unsupported surface of the live seam:
//
//   PROPOSED → ACCEPTED   (accept)
//   PROPOSED → REJECTED   (reject)
//   ACCEPTED | REJECTED → REVERSED   (reverse; REVERSED ≠ deleted)
//
// Every mutation runs through the provider seam only, mutates relationById and
// reconciles the canonical graph projection (graphEdgeById), and writes the
// authority audit. Live throws an explicit UNSUPPORTED ProviderError and never
// fabricates behavior.
// ============================================================================

import { describe, it, expect } from "vitest";
import { ProviderError } from "@/lib/providers/types";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { createLiveWorkspaceProviders } from "@/lib/providers/live/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity, RelationHypothesis } from "@/lib/providers/types";
import type { GraphEdge } from "@indago/contracts";
import {
  CASE_ID,
  INVESTIGATION_ID,
  REL_1,
  REL_2,
  REL_3,
  REL_4,
  REL_5,
  REL_6,
  GE_1,
  GE_2,
  GE_3,
  GE_4,
  GE_5,
  GE_6,
} from "@/lib/providers/demo/demo-fixtures/lookup";

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

function identity(workspaceId = `pr8-provider:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function demoBundle(workspaceId?: string) {
  return createWorkspaceDemoProviders(identity(workspaceId), config);
}

function liveBundle(workspaceId?: string) {
  return createLiveWorkspaceProviders(identity(workspaceId), config);
}

async function relationOf(bundle: ReturnType<typeof demoBundle>, id: string): Promise<RelationHypothesis> {
  const r = await bundle.relations.get(id);
  if (!r) throw new Error(`Missing relation ${id}`);
  return r;
}

async function edgeOf(bundle: ReturnType<typeof demoBundle>, id: string): Promise<GraphEdge> {
  const page = await bundle.graph.getEdges(INVESTIGATION_ID);
  const edge = page.items.find((e) => e.id === id);
  if (!edge) throw new Error(`Missing edge ${id}`);
  return edge;
}

async function expectValidation(promise: Promise<unknown>, pattern: RegExp) {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ProviderError);
  const pe = err as ProviderError;
  expect(pe.code).toBe("VALIDATION");
  expect(pe.message).toMatch(pattern);
}

describe("PR-8 — demo provider: lifecycle transition table", () => {
  it("seeds the fixture standing: REL_1..4 ACCEPTED, REL_5/6 PROPOSED", async () => {
    const bundle = demoBundle();
    expect((await relationOf(bundle, REL_1)).status).toBe("ACCEPTED");
    expect((await relationOf(bundle, REL_2)).status).toBe("ACCEPTED");
    expect((await relationOf(bundle, REL_3)).status).toBe("ACCEPTED");
    expect((await relationOf(bundle, REL_4)).status).toBe("ACCEPTED");
    expect((await relationOf(bundle, REL_5)).status).toBe("PROPOSED");
    expect((await relationOf(bundle, REL_6)).status).toBe("PROPOSED");
  });

  it("accept moves PROPOSED → ACCEPTED and records the audit", async () => {
    const bundle = demoBundle();
    const before = await relationOf(bundle, REL_5);
    expect(before.status).toBe("PROPOSED");

    const accepted = await bundle.relations.accept!(INVESTIGATION_ID, REL_5);
    expect(accepted.status).toBe("ACCEPTED");
    expect(accepted.updatedAt.value).not.toBe(before.updatedAt.value);
    expect((await relationOf(bundle, REL_5)).status).toBe("ACCEPTED");

    const audit = (bundle.relations as any).getAudit(REL_5);
    expect(audit).toBeDefined();
    expect(audit.action).toBe("accept");
    expect(audit.by).toBe("analyst");
  });

  it("accept reconciles the graph projection but keeps a CONTRADICTED edge contradicted", async () => {
    // GE_5 (SHELL_ONE → SHELL_TWO, relation REL_5) is the PR-6 CONTRADICTED
    // edge; PR-6's GROUNDED visual state must survive the relation accepting.
    const bundle = demoBundle();
    expect((await edgeOf(bundle, GE_5)).status).toBe("CONTRADICTED");
    await bundle.relations.accept!(INVESTIGATION_ID, REL_5);
    expect((await relationOf(bundle, REL_5)).status).toBe("ACCEPTED");
    expect((await edgeOf(bundle, GE_5)).status).toBe("CONTRADICTED");
  });

  it("reject moves PROPOSED → REJECTED, archives the edge, records reason", async () => {
    const bundle = demoBundle();
    const rejected = await bundle.relations.reject!(INVESTIGATION_ID, REL_6, "no corroborating source");
    expect(rejected.status).toBe("REJECTED");
    expect((await relationOf(bundle, REL_6)).status).toBe("REJECTED");
    expect((await edgeOf(bundle, GE_6)).status).toBe("ARCHIVED");

    const audit = (bundle.relations as any).getAudit(REL_6);
    expect(audit.action).toBe("reject");
    expect(audit.reason).toBe("no corroborating source");
  });

  it("reverse moves an ACCEPTED relation → REVERSED and archives its edge", async () => {
    const bundle = demoBundle();
    const reversed = await bundle.relations.reverse!(INVESTIGATION_ID, REL_1, "superseded by account evidence");
    expect(reversed.status).toBe("REVERSED");
    expect(reversed.id).toBe(REL_1);
    expect((await relationOf(bundle, REL_1)).status).toBe("REVERSED");
    expect((await relationOf(bundle, REL_1)).id).toBe(REL_1); // REVERSED ≠ deleted
    expect((await edgeOf(bundle, GE_1)).status).toBe("ARCHIVED");

    const audit = (bundle.relations as any).getAudit(REL_1);
    expect(audit.action).toBe("reverse");
    expect(audit.reason).toBe("superseded by account evidence");
  });

  it("reverse also moves a REJECTED relation → REVERSED", async () => {
    const bundle = demoBundle();
    await bundle.relations.reject!(INVESTIGATION_ID, REL_6);
    const reversed = await bundle.relations.reverse!(INVESTIGATION_ID, REL_6);
    expect(reversed.status).toBe("REVERSED");
    expect((await edgeOf(bundle, GE_6)).status).toBe("ARCHIVED");
  });

  it("accept does not disturb already-ACCEPTED relations in the same bundle", async () => {
    // A realistic authority session: every PROPOSED relation can be decided
    // without corrupting the ACCEPTED baseline or its active edges.
    const bundle = demoBundle();
    await bundle.relations.accept!(INVESTIGATION_ID, REL_5);
    await bundle.relations.accept!(INVESTIGATION_ID, REL_6);
    expect((await relationOf(bundle, REL_1)).status).toBe("ACCEPTED");
    expect((await edgeOf(bundle, GE_1)).status).toBe("ACTIVE");
    expect((await relationOf(bundle, REL_6)).status).toBe("ACCEPTED");
    expect((await edgeOf(bundle, GE_6)).status).toBe("ACTIVE");
  });
});

describe("PR-8 — demo provider: legality (defense in depth)", () => {
  it("rejects accepting a relation that is not PROPOSED", async () => {
    const bundle = demoBundle();
    await expectValidation(
      bundle.relations.accept!(INVESTIGATION_ID, REL_1),
      /Only a PROPOSED relation hypothesis can be accepted/,
    );
    expect((await relationOf(bundle, REL_1)).status).toBe("ACCEPTED");
  });

  it("rejects rejecting a relation that is not PROPOSED", async () => {
    const bundle = demoBundle();
    await expectValidation(
      bundle.relations.reject!(INVESTIGATION_ID, REL_2),
      /Only a PROPOSED relation hypothesis can be rejected/,
    );
    expect((await relationOf(bundle, REL_2)).status).toBe("ACCEPTED");
  });

  it("rejects reversing a relation that is still PROPOSED", async () => {
    const bundle = demoBundle();
    await expectValidation(
      bundle.relations.reverse!(INVESTIGATION_ID, REL_5),
      /Only a decided|PROPOSED/i,
    );
    expect((await relationOf(bundle, REL_5)).status).toBe("PROPOSED");
  });

  it("rejects reversing a REVERSED relation again", async () => {
    const bundle = demoBundle();
    await bundle.relations.reverse!(INVESTIGATION_ID, REL_1);
    await expectValidation(
      bundle.relations.reverse!(INVESTIGATION_ID, REL_1),
      /Only a decided|ACCEPTED|REJECTED/i,
    );
    expect((await relationOf(bundle, REL_1)).status).toBe("REVERSED");
  });

  it("throws NOT_FOUND for an unknown relation id", async () => {
    const bundle = demoBundle();
    const err = await bundle.relations
      .accept!(INVESTIGATION_ID, "11111111-0000-4000-8000-000000000000")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).code).toBe("NOT_FOUND");
  });

  it("throws NOT_FOUND for a foreign investigation id", async () => {
    const bundle = demoBundle();
    const err = await bundle.relations
      .accept!("22222222-0000-4000-8000-000000000000", REL_5)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).code).toBe("NOT_FOUND");
  });

  it("unknown relation mutations never touch the graph projection", async () => {
    const bundle = demoBundle();
    await bundle.relations
      .reject!(INVESTIGATION_ID, "11111111-0000-4000-8000-000000000000")
      .catch(() => undefined);
    const page = await bundle.graph.getEdges(INVESTIGATION_ID);
    expect(page.items).toHaveLength(6);
    for (const e of page.items) expect(e.status).not.toBe("ARCHIVED");
  });
});

describe("PR-8 — live seam: genuinely-wired authority (PR-21), never fabricated", () => {
  it("accept is LIVE (rejects with a server/config error when the API is unconfigured, never UNSUPPORTED)", async () => {
    const bundle = liveBundle();
    const err = await bundle.relations
      .accept!(INVESTIGATION_ID, REL_5)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    const pe = err as ProviderError;
    expect(pe.code).toBe("SERVER");
  });

  it("reject is LIVE (rejects with a server/config error when the API is unconfigured, never UNSUPPORTED)", async () => {
    const bundle = liveBundle();
    const err = await bundle.relations
      .reject!(INVESTIGATION_ID, REL_6, "n/a")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).code).toBe("SERVER");
  });

  it("reverse is LIVE (rejects with a server/config error when the API is unconfigured, never UNSUPPORTED)", async () => {
    const bundle = liveBundle();
    const err = await bundle.relations
      .reverse!(INVESTIGATION_ID, REL_1)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).code).toBe("SERVER");
  });

  it("each live authority method is genuinely exposed on the seam (no silent fallback)", async () => {
    const bundle = liveBundle();
    for (const method of ["accept", "reject", "reverse"] as const) {
      const fn = bundle.relations[method];
      expect(fn).toBeTypeOf("function");
      const err = await fn!(INVESTIGATION_ID, REL_5).catch((e: unknown) => e);
      // The method exists and is wired: an unconfigured env surfaces the real
      // server/config failure of the platform call, not an UNSUPPORTED seam.
      expect((err as ProviderError).code).toBe("SERVER");
    }
  });
});