import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Integration suites share real external state (Neon Postgres + Upstash
    // Redis/BullMQ). Running files serially keeps BullMQ lock renewal on the
    // single real worker stable and avoids cross-file contention — parallel
    // load provoked Upstash stall re-delivery (duplicate ingestion attempts).
    fileParallelism: false,
  },
});