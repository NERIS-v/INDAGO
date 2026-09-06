// ============================================================================
// PR-8 — Operational rail "Challenge" entry (action model + rail surface)
//
// The `challenge` command is the rail ENTRY into the relation-authority
// workflow: clicked on a relation context it reveals the relation (where the
// authority panel lives). This is one model (relation-authority.ts) surfaced
// through both the rail and the panel footer — no frontend `setStatus`.
//
// Matrix under test:
//   relation + demo → enabled + implemented (kind mutation, no reason)
//   relation + live → disabled, NO_RELATION_AUTHORITY_LIVE
//   entity / null / other kinds → disabled, NO_CHALLENGE
//
// The rail itself must render the enabled slot as clickable and dispatch to
// onChallenge, and stay disabled for non-relation selections with an honest
// title reason.
// ============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { getOperationalActionState, OPERATIONAL_REASONS } from "@/lib/context/operational-actions";
import { getContextualCapabilities } from "@/lib/context/investigative-context";
import type { InvestigativeContext } from "@/lib/context/investigative-context";
import { OperationalRail } from "@/components/graph/control-center/operational-rail";
import { DEFAULT_ACTIONS } from "@/lib/layout/control-center";
import type { GraphControlCenterActions } from "@/lib/layout/control-center";
import { REL_1 } from "@/lib/providers/demo/demo-fixtures/lookup";

function context(kind: InvestigativeContext["kind"], id = "ctx-1"): InvestigativeContext {
  return { kind, id, source: "graph" };
}

afterEach(() => cleanup());

describe("PR-8 — challenge action model", () => {
  it("wires challenge as a mutation command enabled only for relation + demo", () => {
    const relationCtx = context("relation");
    const caps = getContextualCapabilities(relationCtx, { mode: "demo" });
    const state = getOperationalActionState("challenge", relationCtx, caps, { mode: "demo" });
    expect(state.enabled).toBe(true);
    expect(state.implemented).toBe(true);
    expect(state.kind).toBe("mutation");
    expect(state.reason).toBeUndefined();
  });

  it("keeps challenge disabled for a relation in live mode with the honest reason", () => {
    const relationCtx = context("relation");
    const caps = getContextualCapabilities(relationCtx, { mode: "live" });
    const state = getOperationalActionState("challenge", relationCtx, caps, { mode: "live" });
    expect(state.enabled).toBe(false);
    expect(state.implemented).toBe(false);
    expect(state.reason).toBe(OPERATIONAL_REASONS.NO_RELATION_AUTHORITY_LIVE);
  });

  it("keeps challenge disabled for non-relation selections", () => {
    for (const kind of ["entity", "evidence", "lead", "gap", "cross-case"] as const) {
      const ctx = context(kind);
      const caps = getContextualCapabilities(ctx, { mode: "demo" });
      const state = getOperationalActionState("challenge", ctx, caps, { mode: "demo" });
      expect(state.enabled).toBe(false);
      expect(state.implemented).toBe(false);
      expect(state.reason).toBe(OPERATIONAL_REASONS.NO_CHALLENGE);
    }
  });

  it("keeps challenge disabled under no selection", () => {
    const state = getOperationalActionState("challenge", null, getContextualCapabilities(null, { mode: "demo" }), {
      mode: "demo",
    });
    expect(state.enabled).toBe(false);
    expect(state.reason).toBe(OPERATIONAL_REASONS.NO_CHALLENGE);
  });

  it("flips PRESERVED pre-PR-8 behavior: entity challenge capability stays false (no fake enable)", () => {
    const entityCtx = context("entity");
    expect(getContextualCapabilities(entityCtx, { mode: "demo" }).canChallenge).toBe(false);
    expect(getContextualCapabilities(context("relation"), { mode: "demo" }).canChallenge).toBe(true);
  });
});

describe("PR-8 — rail surface dispatch", () => {
  const baseActions: GraphControlCenterActions = { ...DEFAULT_ACTIONS };

  function stubActions(overrides: Partial<GraphControlCenterActions> = {}) {
    return { ...baseActions, ...overrides };
  }

  it("renders the Challenge slot enabled for relation+demo and dispatches onChallenge", () => {
    const onChallenge = vi.fn();
    const relationCtx = context("relation", REL_1);
    render(
      <OperationalRail
        open
        onToggle={() => undefined}
        actions={stubActions()}
        onActionToggle={() => undefined}
        onActionsChange={() => undefined}
        foreignOverlays={[]}
        capabilities={getContextualCapabilities(relationCtx, { mode: "demo" })}
        context={relationCtx}
        mode="demo"
        filter={stubActions().filter}
        onFilterChange={() => undefined}
        onFocus={() => undefined}
        onChallenge={onChallenge}
      />,
    );

    const challenge = screen.getByRole("button", { name: /Challenge/ }) as HTMLButtonElement;
    expect(challenge).not.toBeDisabled();
    expect(challenge.getAttribute("data-capability")).toBe("true");
    fireEvent.click(challenge);
    expect(onChallenge).toHaveBeenCalledTimes(1);
  });

  it("renders Challenge disabled for an entity selection with the honest reason", () => {
    const entityCtx = context("entity");
    render(
      <OperationalRail
        open
        onToggle={() => undefined}
        actions={stubActions()}
        onActionToggle={() => undefined}
        onActionsChange={() => undefined}
        foreignOverlays={[]}
        capabilities={getContextualCapabilities(entityCtx, { mode: "demo" })}
        context={entityCtx}
        mode="demo"
        filter={stubActions().filter}
        onFilterChange={() => undefined}
        onFocus={() => undefined}
      />,
    );

    const challenge = screen.getByRole("button", { name: /Challenge/ }) as HTMLButtonElement;
    expect(challenge).toBeDisabled();
    expect(challenge.getAttribute("data-capability")).toBe("false");
    expect(challenge.getAttribute("title")).toContain(OPERATIONAL_REASONS.NO_CHALLENGE);
  });

  it("renders Challenge disabled for relation+live with the authority reason", () => {
    const relationCtx = context("relation", REL_1);
    render(
      <OperationalRail
        open
        onToggle={() => undefined}
        actions={stubActions()}
        onActionToggle={() => undefined}
        onActionsChange={() => undefined}
        foreignOverlays={[]}
        capabilities={getContextualCapabilities(relationCtx, { mode: "live" })}
        context={relationCtx}
        mode="live"
        filter={stubActions().filter}
        onFilterChange={() => undefined}
        onFocus={() => undefined}
      />,
    );

    const challenge = screen.getByRole("button", { name: /Challenge/ }) as HTMLButtonElement;
    expect(challenge).toBeDisabled();
    expect(challenge.getAttribute("title")).toContain(OPERATIONAL_REASONS.NO_RELATION_AUTHORITY_LIVE);
  });
});