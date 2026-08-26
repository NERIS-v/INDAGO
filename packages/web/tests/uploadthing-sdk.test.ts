import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("uploadthing/client", () => ({
  genUploader: vi.fn(() => ({
    uploadFiles: vi.fn().mockResolvedValue([
      { key: "file-key-1", url: "https://utfs.io/f/123", name: "doc.pdf" },
    ]),
  })),
}));

describe("UploadThing SDK Helper", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should export uploadEvidence function", async () => {
    const mod = await import("@/lib/upload/uploadthing");
    expect(typeof mod.uploadEvidence).toBe("function");
  });

  it("should call uploadFiles with casePackUploader endpoint and x-investigation-id header", async () => {
    const mockUploadFiles = vi.fn().mockResolvedValue([
      { key: "file-key-1", url: "https://utfs.io/f/123", name: "doc.pdf", size: 1024 },
    ]);
    const { genUploader } = await import("uploadthing/client");
    vi.mocked(genUploader).mockReturnValue({
      uploadFiles: mockUploadFiles,
    } as ReturnType<typeof genUploader>);

    const { uploadEvidence } = await import("@/lib/upload/uploadthing");

    const results = await uploadEvidence({
      investigationId: "inv-001",
      files: [new File(["test"], "doc.pdf", { type: "application/pdf" })],
    });

    expect(mockUploadFiles).toHaveBeenCalledWith("casePackUploader", {
      files: expect.any(Array),
      headers: {
        "x-investigation-id": "inv-001",
      },
      onUploadBegin: undefined,
      onUploadProgress: undefined,
    });

    expect(results).toEqual([
      {
        fileKey: "file-key-1",
        fileUrl: "https://utfs.io/f/123",
        fileName: "doc.pdf",
        fileSize: 1024,
      },
    ]);
  });

  it("should pass progress callbacks to uploadFiles", async () => {
    const mockUploadFiles = vi.fn().mockResolvedValue([
      { key: "k", url: "u", name: "f.pdf" },
    ]);
    const { genUploader } = await import("uploadthing/client");
    vi.mocked(genUploader).mockReturnValue({
      uploadFiles: mockUploadFiles,
    } as ReturnType<typeof genUploader>);

    const { uploadEvidence } = await import("@/lib/upload/uploadthing");

    const onBegin = vi.fn();
    const onProgress = vi.fn();

    await uploadEvidence({
      investigationId: "inv-001",
      files: [new File([""], "f.pdf")],
      onUploadBegin: onBegin,
      onUploadProgress: onProgress,
    });

    const opts = mockUploadFiles.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(typeof opts.onUploadBegin).toBe("function");
    expect(typeof opts.onUploadProgress).toBe("function");
  });

  it("should throw when upload fails", async () => {
    const mockUploadFiles = vi.fn().mockRejectedValue(new Error("Upload failed"));
    const { genUploader } = await import("uploadthing/client");
    vi.mocked(genUploader).mockReturnValue({
      uploadFiles: mockUploadFiles,
    } as ReturnType<typeof genUploader>);

    const { uploadEvidence } = await import("@/lib/upload/uploadthing");

    await expect(
      uploadEvidence({
        investigationId: "inv-001",
        files: [new File([""], "test.pdf")],
      }),
    ).rejects.toThrow("Upload failed");
  });
});

describe("Upload SDK Auth Boundary", () => {
  it("should not import AUTH_TOKEN or demo-token in upload module", async () => {
    const content = fs.readFileSync(
      path.resolve("src/lib/upload/uploadthing.ts"),
      "utf-8",
    );

    expect(content).not.toContain("demo-token");
    expect(content).not.toContain("AUTH_TOKEN");
    expect(content).not.toContain("Authorization");
  });
});
