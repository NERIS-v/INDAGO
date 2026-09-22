// ============================================================================
// Benchmark provenance annotations — integrity facts the committed artifacts do
// NOT self-declare. These are NOT benchmark numbers and they never override an
// artifact-declared value. Each entry is sourced from committed documentation
// (benchmark/audit/deep-audit.md). When a future, corrected run records
// `groundTruthAccessed`, `state`, `gitSha` etc. in its own manifest, the
// artifact value wins and this registry is unused for that run.
// ============================================================================

import type { BenchmarkRunState } from "@indago/contracts";

export interface BenchmarkRunAnnotation {
  /** Cache-normalized run id (e.g. "pilot" for the repo `benchmark/` dir). */
  readonly runId: string;
  readonly label?: string;
  readonly state?: BenchmarkRunState;
  readonly groundTruthAccessed?: boolean;
  readonly gitSha?: string;
  readonly corpus?: string;
  readonly independentValidation?: boolean;
  readonly productionValidation?: boolean;
  /** Human editorial annotation displayed verbatim when the field is absent. */
  readonly note?: string;
  /** Committed documentation the annotation is derived from. */
  readonly source?: string;
}

/**
 * Historical pilot (repo `benchmark/`). Generated before the deep audit
 * (c0d9cc8). The audit confirmed the inference path consulted hidden truth
 * (pipeline.ts:353-370) plus truth-steered planted-hole region anchoring, so
 * this run is PRE_ANALYSIS with groundTruthAccessed=true. `gitSha` is the
 * audited revision recorded at the top of benchmark/audit/deep-audit.md.
 */
export const BENCHMARK_RUN_ANNOTATIONS: readonly BenchmarkRunAnnotation[] = [
  {
    runId: "pilot",
    label: "Prototype Pilot",
    state: "PRE_ANALYSIS",
    groundTruthAccessed: true,
    gitSha: "7b16c9eb1a774db41403a506ded87c4fa9c7c8b7",
    corpus: "SYNTHETIC / DE-IDENTIFIED",
    independentValidation: false,
    productionValidation: false,
    note: "Historical pre-audit run of the deterministic core. The deep audit " +
      "(benchmark/audit/deep-audit.md) confirmed ground-truth leakage in the " +
      "inference path and truth-steered region anchoring; numbers are " +
      "pre-audit and must not be presented as corrected, observation-only, " +
      "or production results.",
    source: "benchmark/audit/deep-audit.md (sections 2, 8, 9)",
  },
];

export function findRunAnnotation(runId: string): BenchmarkRunAnnotation | null {
  return BENCHMARK_RUN_ANNOTATIONS.find((a) => a.runId === runId) ?? null;
}