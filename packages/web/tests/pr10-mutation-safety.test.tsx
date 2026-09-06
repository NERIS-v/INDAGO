// ============================================================================
// PR-10 §38 — Relation-authority mutation safety
//
// The authority panel must be safe under fast interactions and provider
// failures:
//   - a double-submit (double-click, Enter+click) runs the mutation ONCE;
//   - a rejected mutation surfaces the provider's verbatim error, recovers the
//     panel to a usable state, and never fabricates a success;
//   - a stale concurrent change (the resolved status differs from the one the
//     action promised) surfaces the stale-conflict note, never a false success;
//   - destructive decisions (reject/reverse) require an explicit confirm and
//     carry the typed reason to the provider seam.
// ============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { RelationAuthorityPanel } from "@/components/graph/control-center/relation-authority-panel";
import { relationAuthorityAvailable } from "@/lib/context/relation-authority";
import { operationFinancialShadowRelations } from "@/lib/providers/demo/demo-fixtures/relations";
import { REL_5 } from "@/lib/providers/demo/demo-fixtures/lookup";
import type { RelationHypothesis } from "@indago/contracts";

const gate = relationAuthorityAvailable("demo");
const relation = operationFinancialShadowRelations.find((r) => r.id === REL_5)!;
const accepted: RelationHypothesis = { ...relation, status: "ACCEPTED" };
const rejected: RelationHypothesis = { ...relation, status: "REJECTED" };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderPanel(onMutate: (a: "accept" | "reject" | "reverse", r?: string) => Promise<RelationHypothesis>) {
  return render(
    <div>
      <RelationAuthorityPanel relation={relation} gate={gate} onMutate={onMutate} />
    </div>,
  );
}

afterEach(() => cleanup());

describe("PR-10 §38 — no double-submission under fast interactions", () => {
  it("a rapid Accept double-click executes the provider mutation exactly once", async () => {
    const d = deferred<RelationHypothesis>();
    const onMutate = vi.fn(() => d.promise);
    renderPanel(onMutate);

    const accept = screen.getByRole("button", { name: `Accept relation ${REL_5}` });
    fireEvent.click(accept);
    fireEvent.click(accept);

    expect(onMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("relation-authority-busy")).toBeInTheDocument();

    await act(async () => {
      d.resolve(accepted);
      await d.promise;
    });
    await waitFor(() => expect(screen.getByTestId("relation-authority-success")).toBeInTheDocument());
  });

  it("a destructive decision cannot be second-committed while the confirm mutation is busy", async () => {
    const d = deferred<RelationHypothesis>();
    const onMutate = vi.fn(() => d.promise);
    renderPanel(onMutate);

    fireEvent.click(screen.getByRole("button", { name: `Reject relation ${REL_5}` }));
    const confirm = screen.getByRole("button", { name: `Confirm reject relation ${REL_5}` });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(onMutate).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve(rejected);
      await d.promise;
    });
    await waitFor(() => expect(screen.getByTestId("relation-authority-success")).toBeInTheDocument());
  });
});

describe("PR-10 §38 — provider rejection honesty", () => {
  it("a rejected mutation surfaces the provider message verbatim and the panel recovers", async () => {
    const onMutate = vi
      .fn()
      .mockRejectedValueOnce(new Error("Provider seam rejected the decision: state conflict."))
      .mockResolvedValueOnce(accepted);
    renderPanel(onMutate);

    fireEvent.click(screen.getByRole("button", { name: `Accept relation ${REL_5}` }));
    const error = await screen.findByTestId("relation-authority-error");
    expect(error.textContent).toContain("Provider seam rejected the decision: state conflict.");
    expect(screen.queryByTestId("relation-authority-success")).not.toBeInTheDocument();

    // The panel recovers: the same action can be retried and succeeds.
    fireEvent.click(screen.getByRole("button", { name: `Accept relation ${REL_5}` }));
    await waitFor(() => expect(screen.getByTestId("relation-authority-success")).toBeInTheDocument());
    expect(onMutate).toHaveBeenCalledTimes(2);
  });

  it("a stale concurrent change surfaces the stale note, never a false success", async () => {
    // Accept is promised → the resolved relation came back REJECTED (a concurrent
    // decision won). The panel must NOT claim the accept landed.
    const onMutate = vi.fn(async () => rejected);
    renderPanel(onMutate);

    fireEvent.click(screen.getByRole("button", { name: `Accept relation ${REL_5}` }));
    const stale = await screen.findByTestId("relation-authority-stale");
    expect(stale.textContent).toContain("not Accepted");
    expect(screen.queryByTestId("relation-authority-success")).not.toBeInTheDocument();
  });

  it("a successful accept records the honest success note", async () => {
    const onMutate = vi.fn(async () => accepted);
    renderPanel(onMutate);

    fireEvent.click(screen.getByRole("button", { name: `Accept relation ${REL_5}` }));
    await waitFor(() => expect(screen.getByTestId("relation-authority-success")).toBeInTheDocument());
    expect(screen.getByTestId("relation-authority-success").textContent).toContain("Accept recorded.");
    expect(screen.queryByTestId("relation-authority-stale")).not.toBeInTheDocument();
  });
});

describe("PR-10 §38 — destructive decisions require an explicit confirm", () => {
  it("Reject first opens the confirm step (no provider call) and only Confirm runs it with the reason", async () => {
    const onMutate = vi.fn(async () => rejected);
    renderPanel(onMutate);

    fireEvent.click(screen.getByRole("button", { name: `Reject relation ${REL_5}` }));
    expect(onMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId("relation-authority-reason")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("relation-authority-reason"), {
      target: { value: "Duplicate record on file" },
    });
    fireEvent.click(screen.getByRole("button", { name: `Confirm reject relation ${REL_5}` }));

    await waitFor(() => expect(onMutate).toHaveBeenCalledTimes(1));
    expect(onMutate).toHaveBeenCalledWith("reject", "Duplicate record on file");
  });

  it("an empty reason is passed as undefined (accept path)", async () => {
    const onMutate = vi.fn(async () => accepted);
    renderPanel(onMutate);

    fireEvent.click(screen.getByRole("button", { name: `Accept relation ${REL_5}` }));
    await waitFor(() => expect(onMutate).toHaveBeenCalledTimes(1));
    expect(onMutate).toHaveBeenCalledWith("accept", undefined);
  });
});