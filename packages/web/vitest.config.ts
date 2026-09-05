import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    // The recursive `pnpm test` runs ingestion's heavy PDF suite in a parallel
    // vitest process while this suite mounts 43 WorkspaceProvider shells; the
    // default 5s per-test ceiling flakes under that contention. 20s keeps the
    // ceiling safely above the async-utility budget in tests/setup.ts.
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
});
