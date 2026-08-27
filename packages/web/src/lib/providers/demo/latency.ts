// ============================================================================
// F-PR2 Demo Deterministic Latency
//
// Simulated network latency scaled by DEMO_TIMING_SCALE. Deterministic: a given
// (logicalMs, scale) always yields the same real delay via a fixed multiplier —
// no randomness, so tests are stable.
// ============================================================================

import type { DataModeConfig } from "../types";

/** Base latency per call, ms (before scale). */
const BASE_MS = 40;
/** Extra latency added for "heavier" reads (before scale). */
const HEAVY_MS = 120;

/** Resolve the scaled wall-clock delay for a logical latency value. */
export function scaleDelay(logicalMs: number, scale: number): number {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return Math.round(logicalMs * s);
}

/** Base deterministic latency for a standard provider call. */
export function baseLatency(config: DataModeConfig): number {
  return scaleDelay(BASE_MS, config.demoTimingScale);
}

/** Deterministic latency for a heavier provider call (lists/analysis). */
export function heavyLatency(config: DataModeConfig): number {
  return scaleDelay(HEAVY_MS, config.demoTimingScale);
}

/** Deterministic stream delay (from DEMO stream events, before scale). */
export function streamDelay(logicalMs: number, config: DataModeConfig): number {
  return scaleDelay(logicalMs, config.demoTimingScale);
}

/** Sleep helper honoring an optional abort signal. */
export function deterministicSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}
