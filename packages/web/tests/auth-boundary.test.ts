import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

const CLIENT_COMPONENT_DIR = path.resolve("src/app/investigations/[id]");
const SSE_CLIENT_PATH = path.resolve("src/lib/realtime/sse-client.ts");
const UPLOAD_PATH = path.resolve("src/lib/upload");

function isClientComponent(filePath: string): boolean {
  if (!filePath.endsWith(".tsx") && !filePath.endsWith(".ts")) return false;
  // Server Components: page.tsx, layout.tsx, route.ts
  const basename = path.basename(filePath);
  if (basename === "page.tsx" || basename === "layout.tsx" || basename === "route.ts") return false;
  // Check for "use client" directive
  const content = fs.readFileSync(filePath, "utf-8");
  return content.includes('"use client"');
}

function readClientComponentFiles(): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (isClientComponent(full)) {
        files.push(full);
      }
    }
  }

  walk(CLIENT_COMPONENT_DIR);
  return files;
}

describe("Browser Auth Boundary — no tokens in client code", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should not contain demo-token in any client component", () => {
    const files = readClientComponentFiles();
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      expect(content, `${file} contains "demo-token"`).not.toContain("demo-token");
    }
  });

  it("should not contain hardcoded Authorization header in client components", () => {
    const files = readClientComponentFiles();
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      expect(content, `${file} contains "Authorization: Bearer"`).not.toMatch(
        /Authorization:\s*Bearer/,
      );
    }
  });

  it("should not reference process.env.AUTH_TOKEN in client components", () => {
    const files = readClientComponentFiles();
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      expect(content, `${file} references process.env.AUTH_TOKEN`).not.toMatch(
        /process\.env\.AUTH_TOKEN/,
      );
    }
  });

  it("should not contain hardcoded Bearer tokens or demo-token in SSE client code", () => {
    const content = fs.readFileSync(SSE_CLIENT_PATH, "utf-8");
    // No Bearer token patterns in executable code
    expect(content).not.toMatch(/Bearer\s+[a-zA-Z0-9\-_.]+/);
    // No hardcoded demo-token
    expect(content).not.toContain("demo-token");
    // No code-level reference to process.env.AUTH_TOKEN or token variable in options
    expect(content).not.toMatch(/process\.env\.AUTH_TOKEN/);
  });

  it("should not import from packages/platform/src in any web client code", () => {
    const files = readClientComponentFiles();
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      expect(content, `${file} imports from packages/platform/src`).not.toMatch(
        /packages\/platform\/src/,
      );
    }
  });
});

describe("Upload Component — uses real SDK", () => {
  it("file-upload.tsx should import from uploadthing helper", () => {
    const content = fs.readFileSync(
      path.resolve("src/components/upload/file-upload.tsx"),
      "utf-8",
    );
    expect(content).toContain("@/lib/upload/uploadthing");
    expect(content).toContain("uploadEvidence");
  });

  it("file-upload.tsx should not use raw fetch for upload", () => {
    const content = fs.readFileSync(
      path.resolve("src/components/upload/file-upload.tsx"),
      "utf-8",
    );
    expect(content).not.toMatch(/fetch\(["']\/api\/uploadthing/);
  });
});

describe("SSE — uses server proxy", () => {
  it("SSE client should connect to /api/sse/[id] proxy, not platform", () => {
    const content = fs.readFileSync(SSE_CLIENT_PATH, "utf-8");
    expect(content).toContain("/api/sse/${investigationId}");
    expect(content).not.toContain("/api/v1/investigations");
  });

  it("SSE client should not accept token in options", () => {
    const content = fs.readFileSync(SSE_CLIENT_PATH, "utf-8");
    expect(content).not.toMatch(/token:\s*string/);
    expect(content).not.toMatch(/token\s*:/);
  });
});
