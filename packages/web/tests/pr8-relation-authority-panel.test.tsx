// ============================================================================
// PR-8 — Relation Authority panel behaviour
//
// The deliberate-analyst command surface for a selected relation hypothesis.
// Behaviour contract exercised here:
//   - Accept (PROPOSED only) executes immediately (single click).
//   - Reject / Reverse run as an inline two-step confirmation with an optional
//     reason that passes through to the provider seam.
//   - The gate (demo/live) renders an honest unsupported state before anything.
//   - Every mutation goes through onMutate (never a frontend setStatus);
//     success is verified against the expected lifecycle target, with a
//     stale-conflict note when the result diverges.
//   - Provider errors surface verbatim.
// ============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  RelationAuthorityPanel,
} from "@/components/graph/control-center/relation-authority-panel";
import { relationAuthorityAvailable } from "@/lib/context/relation-authority";
import { REL_1 } from "@/lib/providers/demo/demo-fixtures/lookup";
import type { RelationHypothesis } from "@indago/contracts";

const gate = relationAuthorityAvailable("demo");
const unsupportedGate = relationAuthorityAvailable("live");

function relation(status: RelationHypothesis["status"]): RelationHypothesis {
  return {
    id: REL_1,
    sourceEntityId: "b1e0c9a6-0000-4000-8000-000000000041",
    targetEntityId: "b1e0c9a6-0000-4000-8000-000000000043",
    relationType: "FINANCIAL",
    status,
    support: 0.7,
    updatedAt: { value: "2026-01-01T00:00:00.000Z", precision: "exact" },
  } as RelationHypothesis;
}

afterEach(() => cleanup());

describe("PR-8 — gate honesty", () => {
  it("renders an honest unsupported note before any authority surface", () => {
    render(
      <RelationAuthorityPanel
        relation={relation("PROPOSED")}
        gate={unsupportedGate}
        onMutate={vi.fn()}
      />,
    );
    expect(screen.getByTestId("relation-authority")).toHaveAttribute("data-authority-state", "unsupported");
    expect(screen.getByTestId("relation-authority-unavailable").textContent).toContain("live mode");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("PR-8 — proposed relation surface", () => {
  it("offers Accept + Reject (immediate/destructive) and no Reverse", () => {
    render(
      <RelationAuthorityPanel relation={relation("PROPOSED")} gate={gate} onMutate={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Accept relation " + REL_1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject relation " + REL_1 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reverse/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("relation-authority-status").textContent).toBe("Proposed");
  });

  it("Accept executes immediately and reports success", async () => {
    const onMutate = vi.fn().mockResolvedValue(relation("ACCEPTED"));
    render(<RelationAuthorityPanel relation={relation("PROPOSED")} gate={gate} onMutate={onMutate} />);

    fireEvent.click(screen.getByRole("button", { name: "Accept relation " + REL_1 }));
    expect(onMutate).toHaveBeenCalledWith("accept", undefined);
    expect(await screen.findByTestId("relation-authority-success").then((el) => el.textContent)).toContain(
      "Accept recorded",
    );
  });

  it("Reject is a two-step confirm that passes the typed reason through", async () => {
    const onMutate = vi.fn().mockResolvedValue(relation("REJECTED"));
    render(<RelationAuthorityPanel relation={relation("PROPOSED")} gate={gate} onMutate={onMutate} />);

    const reject = screen.getByRole("button", { name: "Reject relation " + REL_1 });
    fireEvent.click(reject);
    expect(screen.getByRole("button", { name: "Confirm reject relation " + REL_1 })).toBeInTheDocument();

    const reason = screen.getByLabelText("Optional reason for this authority decision");
    fireEvent.change(reason, { target: { value: "unsupported by records" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm reject relation " + REL_1 }));

    expect(onMutate).toHaveBeenCalledWith("reject", "unsupported by records");
    expect((await screen.findByTestId("relation-authority-success")).textContent).toContain("Reject recorded");
  });

  it("blank reasons are passed as undefined", async () => {
    const onMutate = vi.fn().mockResolvedValue(relation("REJECTED"));
    render(<RelationAuthorityPanel relation={relation("PROPOSED")} gate={gate} onMutate={onMutate} />);

    fireEvent.click(screen.getByRole("button", { name: "Reject relation " + REL_1 }));
    fireEvent.change(screen.getByLabelText("Optional reason for this authority decision"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm reject relation " + REL_1 }));
    expect(onMutate).toHaveBeenCalledWith("reject", undefined);
    expect(await screen.findByTestId("relation-authority-success")).toBeInTheDocument();
  });

  it("the busy state disables every action including the inline confirm", async () => {
    let resolveRun!: (r: RelationHypothesis) => void;
    const pending = new Promise<RelationHypothesis>((res) => (resolveRun = res));
    const onMutate = vi.fn().mockReturnValue(pending);

    render(<RelationAuthorityPanel relation={relation("PROPOSED")} gate={gate} onMutate={onMutate} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept relation " + REL_1 }));

    expect(screen.getByTestId("relation-authority")).toHaveAttribute("data-authority-state", "mutating");
    expect(screen.getByTestId("relation-authority-busy").textContent).toContain("Applying accept");
    const reject = screen.getByRole("button", { name: /Reject relation/ }) as HTMLButtonElement;
    expect(reject).toBeDisabled();

    resolveRun(relation("ACCEPTED"));
    expect(await screen.findByTestId("relation-authority-success")).toBeInTheDocument();
  });
});

describe("PR-8 — decided relation surfaces", () => {
  it("an ACCEPTED relation offers only Reverse (two-step)", async () => {
    const onMutate = vi.fn().mockResolvedValue(relation("REVERSED"));
    render(<RelationAuthorityPanel relation={relation("ACCEPTED")} gate={gate} onMutate={onMutate} />);

    expect(screen.getByRole("button", { name: "Reverse relation " + REL_1 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accept/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("relation-authority-status").textContent).toBe("Accepted");

    fireEvent.click(screen.getByRole("button", { name: "Reverse relation " + REL_1 }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reverse relation " + REL_1 }));
    expect(onMutate).toHaveBeenCalledWith("reverse", undefined);
    expect((await screen.findByTestId("relation-authority-success")).textContent).toContain("Reverse recorded");
  });

  it("a REJECTED relation still offers Reverse (it can be repealed) with no terminal note", () => {
    render(<RelationAuthorityPanel relation={relation("REJECTED")} gate={gate} onMutate={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Reverse relation " + REL_1 })).toBeInTheDocument();
    expect(screen.queryByTestId("relation-authority-terminal")).not.toBeInTheDocument();
  });

  it("a REVERSED relation is the lifecycle terminal: note shown, no actions", () => {
    render(<RelationAuthorityPanel relation={relation("REVERSED")} gate={gate} onMutate={vi.fn()} />);
    expect(screen.getByTestId("relation-authority-terminal").textContent).toContain("terminal");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("PR-8 — honest failure / stale detection", () => {
  it("surfaces provider errors verbatim", async () => {
    const onMutate = vi.fn().mockRejectedValue(new Error("Provider duplicate decision: already decided."));
    render(<RelationAuthorityPanel relation={relation("PROPOSED")} gate={gate} onMutate={onMutate} />);

    fireEvent.click(screen.getByRole("button", { name: "Accept relation " + REL_1 }));
    expect((await screen.findByTestId("relation-authority-error")).textContent).toContain(
      "Provider duplicate decision: already decided.",
    );
    expect(screen.queryByTestId("relation-authority-success")).not.toBeInTheDocument();
  });

  it("a result that diverges from the expected status surfaces the stale-conflict note", async () => {
    const onMutate = vi.fn().mockResolvedValue(relation("REVERSED"));
    render(<RelationAuthorityPanel relation={relation("PROPOSED")} gate={gate} onMutate={onMutate} />);

    fireEvent.click(screen.getByRole("button", { name: "Accept relation " + REL_1 }));
    const note = await screen.findByTestId("relation-authority-stale");
    expect(note.textContent).toContain("changed since it was loaded");
    expect(note.textContent).toContain("Reversed");
    expect(note.textContent).toContain("Accepted");
    expect(screen.queryByTestId("relation-authority-success")).not.toBeInTheDocument();
  });

  it("a validation error prevents a false success", async () => {
    const onMutate = vi.fn().mockRejectedValue(new Error("Only a decided relation can be reversed."));
    render(<RelationAuthorityPanel relation={relation("ACCEPTED")} gate={gate} onMutate={onMutate} />);

    fireEvent.click(screen.getByRole("button", { name: "Reverse relation " + REL_1 }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reverse relation " + REL_1 }));
    expect((await screen.findByTestId("relation-authority-error")).textContent).toContain(
      "Only a decided relation can be reversed.",
    );
  });
});