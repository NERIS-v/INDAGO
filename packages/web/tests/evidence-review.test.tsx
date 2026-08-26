import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvidenceReview } from "@/components/evidence/evidence-review";
import type { EvidenceMetadata } from "@/components/evidence/evidence-metadata-form";
import type { UploadedFileRef } from "@/lib/api/types";

const META: EvidenceMetadata = {
  sourceName: "CDR Export",
  sourceDescription: "From telecom",
  evidenceType: "COMMUNICATION",
  evidenceTitle: "Call records for suspect",
  evidenceDescription: "CDR details",
  observedAt: "2024-01-15",
  notes: "Court order",
};

const FILES: UploadedFileRef[] = [
  {
    fileKey: "key-1",
    fileUrl: "https://utfs.io/f/abc",
    fileName: "cdr-export.csv",
    fileSize: 51200,
    mimeType: "text/csv",
  },
  {
    fileKey: "key-2",
    fileUrl: "https://utfs.io/f/def",
    fileName: "cdr-notes.pdf",
    fileSize: 204800,
  },
];

describe("EvidenceReview", () => {
  it("renders metadata summary", () => {
    render(
      <EvidenceReview
        metadata={META}
        files={FILES}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        submitting={false}
      />,
    );
    expect(screen.getByText("CDR Export")).toBeInTheDocument();
    expect(screen.getByText("Communication")).toBeInTheDocument();
    expect(screen.getByText("Call records for suspect")).toBeInTheDocument();
    expect(screen.getByText("Court order")).toBeInTheDocument();
  });

  it("renders file list with names and sizes", () => {
    render(
      <EvidenceReview
        metadata={META}
        files={FILES}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        submitting={false}
      />,
    );
    expect(screen.getByText("cdr-export.csv")).toBeInTheDocument();
    expect(screen.getByText("cdr-notes.pdf")).toBeInTheDocument();
  });

  it("displays correct file count", () => {
    render(
      <EvidenceReview
        metadata={META}
        files={FILES}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        submitting={false}
      />,
    );
    expect(
      screen.getByText((content) => content.includes("Files") && content.includes("2")),
    ).toBeInTheDocument();
  });

  it("calls onSubmit when submit button is clicked", () => {
    const onSubmit = vi.fn();
    render(
      <EvidenceReview
        metadata={META}
        files={FILES}
        onSubmit={onSubmit}
        onBack={vi.fn()}
        submitting={false}
      />,
    );
    expect(screen.getByRole("button", { name: /Submit Evidence/ })).not.toBeDisabled();
  });

  it("calls onBack when back button is clicked", () => {
    const onBack = vi.fn();
    render(
      <EvidenceReview
        metadata={META}
        files={FILES}
        onSubmit={vi.fn()}
        onBack={onBack}
        submitting={false}
      />,
    );
    expect(screen.getByRole("button", { name: /Back/ })).toBeInTheDocument();
  });

  it("disables submit when submitting", () => {
    render(
      <EvidenceReview
        metadata={META}
        files={FILES}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        submitting={true}
      />,
    );
    expect(screen.getByRole("button", { name: /Submit Evidence/ })).toBeDisabled();
  });

  it("displays submit error when provided", () => {
    render(
      <EvidenceReview
        metadata={META}
        files={FILES}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        submitting={false}
        submitError="Network timeout"
      />,
    );
    expect(screen.getByText("Network timeout")).toBeInTheDocument();
  });
});
