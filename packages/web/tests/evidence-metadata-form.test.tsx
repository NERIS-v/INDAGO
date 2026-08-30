import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EvidenceMetadataForm } from "@/components/evidence/evidence-metadata-form";
import type { EvidenceMetadata } from "@/components/evidence/evidence-metadata-form";

const VALID_META: EvidenceMetadata = {
  sourceName: "CDR Export from Telecom A",
  sourceDescription: "Exported from telecom provider",
  evidenceType: "COMMUNICATION",
  sourceCatalog: "CDR",
  evidenceTitle: "Call records for suspect",
  evidenceDescription: "CDR for +91-XXXXXXXXXX",
  observedAt: "2024-01-15",
  notes: "Court order dated 2024-01-10",
};

describe("EvidenceMetadataForm", () => {
  it("renders all form fields", () => {
    render(
      <EvidenceMetadataForm onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByLabelText(/Source.*Origin/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Evidence Type/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Source Catalog/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Evidence Title/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Source Description/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Evidence Description/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Relevant Date/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Notes/)).toBeInTheDocument();
  });

  it("renders with initial values when provided", () => {
    render(
      <EvidenceMetadataForm
        initial={VALID_META}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Source.*Origin/)).toHaveValue("CDR Export from Telecom A");
    expect(screen.getByLabelText(/Evidence Title/)).toHaveValue("Call records for suspect");
    expect(screen.getByLabelText(/Source Catalog/)).toHaveValue("CDR");
  });

  it("disables submit when required fields are empty", () => {
    render(
      <EvidenceMetadataForm onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    const submitBtn = screen.getByRole("button", { name: /Next.*Select Files/ });
    expect(submitBtn).toBeDisabled();
  });

  it("enables submit when required fields are filled", () => {
    render(
      <EvidenceMetadataForm onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText(/Source.*Origin/), {
      target: { value: "Police report" },
    });
    fireEvent.change(screen.getByLabelText(/Evidence Title/), {
      target: { value: "FIR copy" },
    });
    const submitBtn = screen.getByRole("button", { name: /Next.*Select Files/ });
    expect(submitBtn).not.toBeDisabled();
  });

  it("calls onSubmit with form data", () => {
    const onSubmit = vi.fn();
    render(
      <EvidenceMetadataForm onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText(/Source.*Origin/), {
      target: { value: "CDR Export" },
    });
    fireEvent.change(screen.getByLabelText(/Evidence Title/), {
      target: { value: "Call records" },
    });
    fireEvent.change(screen.getByLabelText(/Evidence Type/), {
      target: { value: "FINANCIAL" },
    });
    fireEvent.change(screen.getByLabelText(/Source Catalog/), {
      target: { value: "MANUAL" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Next.*Select Files/ }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceName: "CDR Export",
        evidenceTitle: "Call records",
        evidenceType: "FINANCIAL",
        sourceCatalog: "MANUAL",
      }),
    );
  });

  it("calls onCancel when cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <EvidenceMetadataForm onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
