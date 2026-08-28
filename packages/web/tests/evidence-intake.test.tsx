import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { EvidenceIntake, type EvidenceIntakeSubmitRequest } from "@/components/evidence/evidence-intake";
import type { EvidenceProvider } from "@/lib/providers";
import type { UploadedFileReference } from "@indago/contracts";

afterEach(cleanup);

beforeEach(() => {
  vi.restoreAllMocks();
  let n = 0;
  const randomUUID = () => `uuid-intake-${n++}`;
  if (!("randomUUID" in crypto)) {
    vi.stubGlobal("crypto", { ...crypto, randomUUID });
  } else {
    vi.spyOn(crypto, "randomUUID").mockImplementation(randomUUID);
  }
});

const pdfRef: UploadedFileReference = {
  fileKey: "demo:ref1",
  fileUrl: "demo://ref1",
  fileName: "financial-report.pdf",
  fileSize: 2048,
  mimeType: "application/pdf",
};

function makeEvidence(): EvidenceProvider {
  return {
    prepareUpload: vi.fn().mockResolvedValue([pdfRef]),
    listByInvestigation: vi.fn(),
    get: vi.fn(),
    submit: vi.fn(),
  } as unknown as EvidenceProvider;
}

function renderIntake(opts: {
  evidence?: EvidenceProvider;
  onSubmitEvidence?: (r: EvidenceIntakeSubmitRequest) => Promise<void>;
  onComplete?: () => void;
} = {}) {
  const onSubmitEvidence = opts.onSubmitEvidence ?? vi.fn().mockResolvedValue(undefined);
  const onComplete = opts.onComplete ?? vi.fn();
  const utils = render(
    <EvidenceIntake
      evidence={opts.evidence ?? makeEvidence()}
      investigationId="inv-1"
      caseId="case-1"
      onSubmitEvidence={onSubmitEvidence}
      onComplete={onComplete}
    />,
  );
  return { onSubmitEvidence, onComplete, ...utils };
}

async function fillContext() {
  fireEvent.change(screen.getByLabelText(/Source.*Origin/), {
    target: { value: "Telecom CDR export" },
  });
  fireEvent.change(screen.getByLabelText(/Evidence Title/), {
    target: { value: "Suspect call records" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Next: Select Files/ }));
}

async function addFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, {
    target: {
      files: [new File([new Uint8Array(2048)], "financial-report.pdf", { type: "application/pdf" })],
    },
  });
  await screen.findByText("Uploaded");
}

describe("EvidenceIntake", () => {
  it("progresses through context → files → review steps", async () => {
    renderIntake();
    await fillContext();
    await addFile();
    fireEvent.click(screen.getByRole("button", { name: /Next: Review/ }));
    expect(screen.getByText("Review Submission")).toBeInTheDocument();
    expect(screen.getByText("Suspect call records")).toBeInTheDocument();
    expect(screen.getByText("financial-report.pdf")).toBeInTheDocument();
  });

  it("prevents advancing to review without files", async () => {
    renderIntake();
    await fillContext();
    const reviewButton = screen.getByRole("button", { name: /Next: Review/ });
    expect(reviewButton).toBeDisabled();
  });

  it("preserves metadata when returning from the files step", async () => {
    renderIntake();
    await fillContext();
    screen.getByRole("button", { name: "Back" }).click();
    expect(await screen.findByLabelText(/Source.*Origin/)).toHaveValue("Telecom CDR export");
    expect(screen.getByLabelText(/Evidence Title/)).toHaveValue("Suspect call records");
  });

  it("submits the request through the injected coordinator and completes", async () => {
    const { onSubmitEvidence, onComplete } = renderIntake();
    await fillContext();
    await addFile();
    fireEvent.click(screen.getByRole("button", { name: /Next: Review/ }));
    fireEvent.click(screen.getByRole("button", { name: /Submit Evidence/ }));

    await waitFor(() =>
      expect(onSubmitEvidence).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceName: "Telecom CDR export",
          evidenceTitle: "Suspect call records",
          files: expect.arrayContaining([
            expect.objectContaining({ fileName: "financial-report.pdf" }),
          ]),
        }),
      ),
    );
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it("shows an error when submission fails and allows retry", async () => {
    const onSubmitEvidence = vi
      .fn()
      .mockRejectedValueOnce(new Error("Backend rejected"))
      .mockResolvedValueOnce(undefined);
    const { onComplete } = renderIntake({ onSubmitEvidence });
    await fillContext();
    await addFile();
    fireEvent.click(screen.getByRole("button", { name: /Next: Review/ }));

    fireEvent.click(screen.getByRole("button", { name: /Submit Evidence/ }));
    expect(await screen.findByText(/Backend rejected/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Submit Evidence/ }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
