import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EvidenceList } from "@/components/evidence/evidence-list";
import type { EvidenceListItem } from "@/lib/api/types";

afterEach(cleanup);

const demoEvidence: EvidenceListItem = {
  id: "550e8400-e29b-41d4-a716-446655444200",
  caseId: "case-1",
  investigationId: "investigation-1",
  type: "FINANCIAL",
  title: "Ledger Export",
  description: "Monthly ledger",
  status: "PROCESSED",
  sourceRef: "src-ledger",
  observedAt: { value: "2026-08-01T00:00:00.000Z", precision: "day" },
  observationCount: 3,
  artifactIds: ["art-1"],
  strength: 0.7,
  createdAt: "2026-08-01T00:00:00.000Z",
};

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

  it("renders a typed unavailable state when listing is not supported", () => {
    render(
      <EvidenceList items={[]} loading={false} error={null} unavailable />,
    );
    expect(
      screen.getByText("Evidence listing not available in this mode"),
    ).toBeInTheDocument();
  });
});
