import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvestigationStatus } from "@/components/status/investigation-status";
import type { InvestigationStatusResponse } from "@/lib/api/types";

const mockInvestigation: InvestigationStatusResponse = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  investigationId: "550e8400-e29b-41d4-a716-446655440001",
  status: "RUNNING",
  state: "INGESTING",
  currentStage: "extracting financial records",
  error: undefined,
  retryCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T12:30:00.000Z",
};

describe("InvestigationStatus", () => {
  it("should render investigation ID", () => {
    render(<InvestigationStatus investigation={mockInvestigation} />);
    expect(
      screen.getByText("550e8400-e29b-41d4-a716-446655440000"),
    ).toBeInTheDocument();
  });

  it("should render state badge", () => {
    render(<InvestigationStatus investigation={mockInvestigation} />);
    expect(screen.getByText("Ingesting")).toBeInTheDocument();
  });

  it("should render status label", () => {
    render(<InvestigationStatus investigation={mockInvestigation} />);
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("should render current stage when present", () => {
    render(<InvestigationStatus investigation={mockInvestigation} />);
    expect(
      screen.getByText("extracting financial records"),
    ).toBeInTheDocument();
  });

  it("should render run ID", () => {
    render(<InvestigationStatus investigation={mockInvestigation} />);
    expect(
      screen.getByText("550e8400-e29b-41d4-a716-446655440000"),
    ).toBeInTheDocument();
  });

  it("should render error when present", () => {
    const withError = {
      ...mockInvestigation,
      error: "Ingestion failed: timeout",
      state: "FAILED" as const,
    };
    render(<InvestigationStatus investigation={withError} />);
    expect(
      screen.getByText("Ingestion failed: timeout"),
    ).toBeInTheDocument();
  });

  it("should not render error when absent", () => {
    render(<InvestigationStatus investigation={mockInvestigation} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("should not render stage when absent", () => {
    const noStage = { ...mockInvestigation, currentStage: undefined };
    render(<InvestigationStatus investigation={noStage} />);
    expect(screen.queryByText("Stage")).not.toBeInTheDocument();
  });

  it("should apply custom className", () => {
    const { container } = render(
      <InvestigationStatus
        investigation={mockInvestigation}
        className="my-class"
      />,
    );
    expect(container.firstChild).toHaveClass("my-class");
  });
});
