// ============================================================================
// Capability coverage registry — the implemented / production-wired /
// benchmark-executed truth for every intelligence subsystem.
//
// This is the distinction the deep audit (benchmark/audit/deep-audit.md §2, §4)
// established: IMPLEMENTED ≠ PRODUCTION-WIRED ≠ BENCHMARK-EXECUTED. The UI
// renders the coverage surface ONLY from this registry — it never claims a
// capability ran just because the code exists.
//
// Source column cites the audit row to keep every flag reviewable.
// ============================================================================

export type BenchmarkExecution =
  | "EXECUTED"
  | "PARTIAL"
  | "FABRICATED_INPUT"
  | "NOT_EXECUTED"
  | "NOT_APPLICABLE";

export interface CapabilityCoverageRow {
  readonly id: string;
  readonly capability: string;
  readonly group: "Ingestion" | "Core intelligence" | "Graph & holes" | "Language / AI" | "Event-driven";
  readonly implemented: boolean;
  readonly productionWired: boolean;
  /** Qualifier for productionWired=true cases (e.g. event-driven only). */
  readonly productionWiredNote?: string;
  readonly benchmarkExecuted: BenchmarkExecution;
  readonly note?: string;
  readonly source: string;
}

export const CAPABILITY_COVERAGE: readonly CapabilityCoverageRow[] = [
  {
    id: "ingestion",
    capability: "Ingestion (fetch / classify / storage)",
    group: "Ingestion",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "PARTIAL",
    note: "Local storage only; artifact fetch is harness-local by design.",
    source: "audit §2",
  },
  {
    id: "extraction",
    capability: "Extraction / OCR / parsing",
    group: "Ingestion",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "FABRICATED_INPUT",
    note: "createTesseractOcrProvider exists; the benchmark injects RawExtraction via makeTxt — real OCR never ran.",
    source: "audit §2, §4",
  },
  {
    id: "normalization",
    capability: "Normalization",
    group: "Ingestion",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "EXECUTED",
    source: "audit §2",
  },
  {
    id: "observation-extraction",
    capability: "Observation extraction",
    group: "Core intelligence",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "EXECUTED",
    source: "audit §2",
  },
  {
    id: "entity-mention",
    capability: "Entity mention candidates",
    group: "Core intelligence",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "EXECUTED",
    source: "audit §2",
  },
  {
    id: "blocking",
    capability: "Multi-pass blocking",
    group: "Core intelligence",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "EXECUTED",
    source: "audit §2",
  },
  {
    id: "entity-resolution",
    capability: "Entity resolution",
    group: "Core intelligence",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "EXECUTED",
    source: "audit §2",
  },
  {
    id: "pr16",
    capability: "PR16 entity-split → PR17",
    group: "Core intelligence",
    implemented: true,
    productionWired: false,
    benchmarkExecuted: "NOT_EXECUTED",
    note: "erSplit is an optional PR17 input; the benchmark never supplies it and fixtures have no over-merge cases.",
    source: "audit §2, §7",
  },
  {
    id: "relation-resolution",
    capability: "Relation resolution",
    group: "Core intelligence",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "EXECUTED",
    source: "audit §2",
  },
  {
    id: "graph-projection",
    capability: "Graph projection",
    group: "Core intelligence",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "EXECUTED",
    source: "audit §2",
  },
  {
    id: "temporal",
    capability: "Temporal graph / versioning",
    group: "Core intelligence",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "EXECUTED",
    source: "audit §2",
  },
  {
    id: "pr1-region",
    capability: "PR1 graph-hole region",
    group: "Graph & holes",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "EXECUTED",
    note: "Region constructed without semanticExpansion — the retrieval seam is disabled.",
    source: "audit §2, §5",
  },
  {
    id: "pr3-hypothesis-context",
    capability: "PR3 hypothesis context",
    group: "Graph & holes",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "EXECUTED",
    source: "audit §2",
  },
  {
    id: "semantic-retrieval",
    capability: "Semantic retrieval",
    group: "Language / AI",
    implemented: true,
    productionWired: false,
    benchmarkExecuted: "NOT_EXECUTED",
    note: "Postgres repositories exist with zero call sites; the region seam is never injected.",
    source: "audit §2, §5",
  },
  {
    id: "pr4-detection",
    capability: "PR4 detection",
    group: "Graph & holes",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "EXECUTED",
    source: "audit §2",
  },
  {
    id: "pr5-qualification",
    capability: "PR5 qualification",
    group: "Graph & holes",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "EXECUTED",
    note: "Frozen MIN_STRUCTURAL_SCORE = MIN_SIGNIFICANCE = 0.70.",
    source: "audit §2",
  },
  {
    id: "pr7-analyst",
    capability: "PR7 AI analyst",
    group: "Language / AI",
    implemented: true,
    productionWired: false,
    benchmarkExecuted: "NOT_EXECUTED",
    note: "analyzeGraphHole has zero non-test callers; AiAnalysisPort is never instantiated.",
    source: "audit §2, §3, §6",
  },
  {
    id: "pr8-validator",
    capability: "PR8 AI validator",
    group: "Language / AI",
    implemented: true,
    productionWired: false,
    benchmarkExecuted: "NOT_EXECUTED",
    note: "Validates analyst output only; unwired downstream of the analyst.",
    source: "audit §2, §6",
  },
  {
    id: "pr9-judge",
    capability: "PR9 AI judge",
    group: "Language / AI",
    implemented: true,
    productionWired: false,
    benchmarkExecuted: "NOT_EXECUTED",
    note: "runJudgeDecision / judgeGraphHole have zero non-test callers.",
    source: "audit §2, §6",
  },
  {
    id: "pr14-classification",
    capability: "PR14 gap classification",
    group: "Graph & holes",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "EXECUTED",
    source: "audit §2",
  },
  {
    id: "pr15-explanations",
    capability: "PR15 competing explanations",
    group: "Graph & holes",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "EXECUTED",
    source: "audit §2",
  },
  {
    id: "pr17-evidence-requests",
    capability: "PR17 evidence requests",
    group: "Graph & holes",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "EXECUTED",
    source: "audit §2",
  },
  {
    id: "pr18-next-best-evidence",
    capability: "PR18 next-best evidence",
    group: "Graph & holes",
    implemented: true,
    productionWired: false,
    benchmarkExecuted: "EXECUTED",
    note: "Only the benchmark and an integration test call selectBestEvidenceFromCandidates.",
    source: "audit §2",
  },
  {
    id: "lead-generation",
    capability: "Lead generation",
    group: "Core intelligence",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "EXECUTED",
    note: "No hole-metric effect.",
    source: "audit §2",
  },
  {
    id: "targeted-reblocking",
    capability: "Targeted reblocking",
    group: "Event-driven",
    implemented: true,
    productionWired: true,
    productionWiredNote: "event-driven",
    benchmarkExecuted: "NOT_APPLICABLE",
    note: "Triggered by accepted changes/new evidence; outside a static snapshot.",
    source: "audit §2, §7",
  },
  {
    id: "reassessment",
    capability: "Reassessment",
    group: "Event-driven",
    implemented: true,
    productionWired: true,
    productionWiredNote: "event-driven",
    benchmarkExecuted: "NOT_APPLICABLE",
    note: "Queue worker exists; triggered by accepted case changes; not a static run.",
    source: "audit §2, §3, §7",
  },
  {
    id: "claim-grounding",
    capability: "Claim grounding",
    group: "Language / AI",
    implemented: true,
    productionWired: true,
    benchmarkExecuted: "NOT_EXECUTED",
    note: "Append-only agent guard; no metric-stage effect.",
    source: "audit §2, §7",
  },
];

/**
 * True when a run explicitly executed a capability at the benchmark surface
 * (or the capability is categorically out of static scope).
 */
export function benchmarkExecuted(row: CapabilityCoverageRow): boolean {
  return (
    row.benchmarkExecuted === "EXECUTED" ||
    row.benchmarkExecuted === "PARTIAL"
  );
}