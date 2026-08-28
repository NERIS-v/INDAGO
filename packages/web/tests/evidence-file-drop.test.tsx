import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EvidenceFileDrop } from "@/components/evidence/evidence-file-drop";
import type { EvidenceProvider } from "@/lib/providers";
import type { UploadedFileReference } from "@indago/contracts";
import { ACCEPTED_FILE_TYPES } from "@/lib/upload/types";

afterEach(cleanup);

beforeEach(() => {
  vi.restoreAllMocks();
  let n = 0;
  const randomUUID = () => `uuid-test-${n++}`;
  if (!("randomUUID" in crypto)) {
    vi.stubGlobal("crypto", { ...crypto, randomUUID });
  } else {
    vi.spyOn(crypto, "randomUUID").mockImplementation(randomUUID);
  }
});

function pdfFile(size = 1024): File {
  return new File([new Uint8Array(size)], "rpt.pdf", { type: "application/pdf" });
}

function makeProvider(
  prepareUpload: EvidenceProvider["prepareUpload"] = vi.fn().mockResolvedValue([]),
): EvidenceProvider {
  return {
    prepareUpload,
    listByInvestigation: vi.fn(),
    get: vi.fn(),
    submit: vi.fn(),
  } as unknown as EvidenceProvider;
}

function renderDrop(opts: {
  evidence?: EvidenceProvider;
  onRefsChange?: (refs: UploadedFileReference[]) => void;
} = {}) {
  const onRefsChange = opts.onRefsChange ?? vi.fn();
  const utils = render(
    <EvidenceFileDrop
      evidence={opts.evidence ?? makeProvider()}
      investigationId="inv-1"
      refs={[]}
      onRefsChange={onRefsChange}
    />,
  );
  return { onRefsChange, ...utils };
}

const refFor = (fileName = "rpt.pdf"): UploadedFileReference => ({
  fileKey: "demo:abc",
  fileUrl: "demo://abc",
  fileName,
  fileSize: 1024,
  mimeType: "application/pdf",
});

describe("EvidenceFileDrop", () => {
  it("adds a file through the file picker and uploads it", async () => {
    const prepareUpload = vi.fn().mockResolvedValue([refFor("rpt.pdf")]);
    const { container } = renderDrop({ evidence: makeProvider(prepareUpload) });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdfFile()] } });

    expect(await screen.findByText("rpt.pdf")).toBeInTheDocument();
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    expect(prepareUpload).toHaveBeenCalledWith(
      "inv-1",
      expect.any(Array),
      expect.any(Function),
    );
  });

  it("uploads multiple files independently", async () => {
    const prepareUpload = vi.fn().mockResolvedValue([refFor()]);
    const { container } = renderDrop({ evidence: makeProvider(prepareUpload) });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [pdfFile(), new File([new Uint8Array(10)], "b.pdf", { type: "application/pdf" })],
      },
    });
    expect(await screen.findByText("rpt.pdf")).toBeInTheDocument();
    expect(await screen.findByText("b.pdf")).toBeInTheDocument();
    expect(prepareUpload).toHaveBeenCalledTimes(2);
    expect(await screen.findAllByText("Uploaded")).toHaveLength(2);
  });

  it("rejects an unsupported file type and does not upload it", async () => {
    const prepareUpload = vi.fn().mockResolvedValue([refFor()]);
    const { container } = renderDrop({ evidence: makeProvider(prepareUpload) });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array(10)], "app.exe", { type: "application/x-msdownload" })] },
    });
    expect(await screen.findByText(/Unsupported file type/)).toBeInTheDocument();
    expect(prepareUpload).not.toHaveBeenCalled();
    expect(screen.queryByText("Uploaded")).toBeNull();
  });

  it("rejects an oversized file and does not upload it", async () => {
    const prepareUpload = vi.fn().mockResolvedValue([refFor()]);
    const pdfMax = ACCEPTED_FILE_TYPES["application/pdf"].maxSize;
    const { container } = renderDrop({ evidence: makeProvider(prepareUpload) });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array(pdfMax + 1)], "big.pdf", { type: "application/pdf" })] },
    });
    expect(await screen.findByText(/larger than the|limit/)).toBeInTheDocument();
    expect(prepareUpload).not.toHaveBeenCalled();
  });

  it("reports upload progress", async () => {
    let resolveUpload: (v: UploadedFileReference[]) => void;
    const prepareUpload = vi.fn(
      (_inv: string, _files: File[], onProgress?: (p: number) => void) => {
        onProgress?.(42);
        return new Promise<UploadedFileReference[]>((res) => {
          resolveUpload = res;
        });
      },
    );
    const { container } = renderDrop({ evidence: makeProvider(prepareUpload as typeof prepareUpload) });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdfFile()] } });

    expect(await screen.findByText("Uploading")).toBeInTheDocument();
    expect(await screen.findByText(/42%/)).toBeInTheDocument();
    resolveUpload!([refFor()]);
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
  });

  it("marks a failed upload and allows retry", async () => {
    const prepareUpload = vi
      .fn()
      .mockRejectedValueOnce(new Error("Upload failed"))
      .mockResolvedValue([refFor("rpt.pdf")]);
    const { container } = renderDrop({ evidence: makeProvider(prepareUpload) });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdfFile()] } });

    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();

    screen.getByRole("button", { name: /Retry/ }).click();
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
  });

  it("keeps a successful upload while a second one fails (per-file isolation)", async () => {
    const prepareUpload = vi
      .fn()
      .mockResolvedValueOnce([refFor("a.pdf")])
      .mockRejectedValueOnce(new Error("Upload failed"));
    const { container } = renderDrop({ evidence: makeProvider(prepareUpload) });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          pdfFile(),
          new File([new Uint8Array(10)], "b.pdf", { type: "application/pdf" }),
        ],
      },
    });

    // First upload succeeds, second fails.
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    expect(await screen.findByText("Failed")).toBeInTheDocument();
  });

  it("removes a file entry", async () => {
    const prepareUpload = vi.fn().mockResolvedValue([refFor("rpt.pdf")]);
    const { container } = renderDrop({ evidence: makeProvider(prepareUpload) });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdfFile()] } });

    expect(await screen.findByText("rpt.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Remove rpt.pdf/ }));
    expect(screen.queryByText("rpt.pdf")).toBeNull();
  });

  it("supports keyboard activation of the file picker", () => {
    renderDrop();
    const dropzone = screen.getByRole("button", { name: /Add evidence files/ });
    dropzone.focus();
    // Keyboard "Enter" triggers the hidden input; no crash and focus retained.
    fireEvent.keyDown(dropzone, { key: "Enter" });
    fireEvent.keyDown(dropzone, { key: " " });
    expect(dropzone).toHaveFocus();
  });
});
