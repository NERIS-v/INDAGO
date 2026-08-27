import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProvenanceChip } from "@/components/ui/provenance-chip";

describe("ProvenanceChip", () => {
  it("should render the source label", () => {
    render(<ProvenanceChip source="cdr-export-tel-a" />);
    expect(screen.getByText("cdr-export-tel-a")).toBeInTheDocument();
  });

  it("should render a mono detail when provided", () => {
    render(<ProvenanceChip source="fin-042" detail="rec-118" />);
    expect(screen.getByText(/rec-118/)).toBeInTheDocument();
  });

  it("should render in mono type", () => {
    render(<ProvenanceChip source="case-042" />);
    expect(screen.getByText("case-042").className).toContain("type-mono-small");
  });
});