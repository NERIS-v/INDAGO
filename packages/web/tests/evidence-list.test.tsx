import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EvidenceList } from "@/components/evidence/evidence-list";
import type { Evidence } from "@indago/contracts";
import { createDemoWorkspaceState } from "@/lib/providers/demo/state";

afterEach(cleanup);

const fixtureEvidence = createDemoWorkspaceState("evidence-list:test").evidenceById;
const demoEvidence = [...fixtureEvidence.values()][0] as Evidence;

describe("EvidenceList", () => {
  it("renders evidence items with their title and status", () => {
    render(<EvidenceList items={[demoEvidence]} loading={false} error={null} />);
    expect(screen.getByText(demoEvidence.title)).toBeInTheDocument();
    expect(screen.getByText(demoEvidence.status)).toBeInTheDocument();
  });

  it("renders an empty state when there are no items", () => {
    render(<EvidenceList items={[]} loading={false} error={null} />);
    expect(screen.getByText(/No evidence/)).toBeInTheDocument();
  });

  it("renders a loading state", () => {
    render(<EvidenceList items={null} loading error={null} />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("renders an error state with retry", () => {
    const onRetry = vi.fn();
    render(
      <EvidenceList items={null} loading={false} error="Something failed" onRetry={onRetry} />,
    );
    expect(screen.getByText(/Something failed/)).toBeInTheDocument();
    screen.getByRole("button", { name: /Retry/ }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders a typed unavailable state (live mode without an endpoint)", () => {
    render(
      <EvidenceList items={[]} loading={false} error={null} unavailable />,
    );
    expect(
      screen.getByText("Evidence listing not available in this mode"),
    ).toBeInTheDocument();
  });
});
