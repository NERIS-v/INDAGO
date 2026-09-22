// ============================================================================
// Benchmark presentation domain — pure derivation helpers that translate the
// typed artifact projection into display structures. No `server-only`, no fs,
// no React: unit-testable in isolation. The UI never hardcodes numbers here;
// everything flows from the projection passed in.
// ============================================================================

import type {
  BenchmarkConditionLabel,
  BenchmarkConditionAggregate,
  BenchmarkRunState,
  BenchmarkRunView,
  BenchmarkVerdictEntry,
} from "@indago/contracts";

export type ConditionLabel = BenchmarkConditionLabel;

export const CONDITION_DISPLAY: Readonly<Record<ConditionLabel, string>> = {
  CLEAN: "CLEAN",
  NOISY_MISSING: "NOISY",
  ADVERSARIAL: "ADVERSARIAL",
};

export const CONDITION_ORDER: readonly ConditionLabel[] = [
  "CLEAN",
  "NOISY_MISSING",
  "ADVERSARIAL",
];

export function conditionLabel(c: ConditionLabel): string {
  return CONDITION_DISPLAY[c] ?? c;
}

export function displayNumber(value: number | null | undefined, fallback = "NOT AVAILABLE"): string {
  return value === null || value === undefined || Number.isNaN(value) ? fallback : String(value);
}

export function displayPercent(value: number | null | undefined, digits = 1, fallback = "—"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return `${(value * 100).toFixed(digits)}%`;
}

/** editorial ratio "a / b" used by the primary result. */
export function displayRatio(n: number | null | undefined, d: number | null | undefined, fallback = "—"): string {
  if (n === null || n === undefined || d === null || d === undefined) return fallback;
  return `${n} / ${d}`;
}

// ─── Run state ---------------------------------------------------------------

export interface RunStatePresentation {
  readonly marker: string;
  readonly isHistorical: boolean;
}

export function statePresentation(state: BenchmarkRunState | null): RunStatePresentation {
  switch (state) {
    case "PRE_ANALYSIS":
      return { marker: "PRE-AUDIT RESULT", isHistorical: true };
    case "CORRECTED_OBSERVATION_ONLY":
      return { marker: "OBSERVATION-ONLY RESULT", isHistorical: false };
    case "COUNTERFACTUAL":
      return { marker: "COUNTERFACTUAL RUN", isHistorical: false };
    default:
      return { marker: "RUN STATE NOT RECORDED", isHistorical: false };
  }
}

export function inferenceMode(
  state: BenchmarkRunState | null,
  groundTruthAccessed: boolean | null,
): string {
  if (state === "COUNTERFACTUAL") return "COUNTERFACTUAL";
  if (state === "CORRECTED_OBSERVATION_ONLY") return "OBSERVATION-ONLY";
  if (state === "PRE_ANALYSIS") return "HISTORICAL (inference consulted hidden truth)";
  if (groundTruthAccessed === true) return "HISTORICAL (inference consulted hidden truth)";
  if (groundTruthAccessed === false) return "OBSERVATION-ONLY";
  return "UNKNOWN";
}

// ─── Primary result ------------------------------------------------------------

export interface PrimaryResult {
  readonly totalRecovered: string;
  readonly totalPlanted: string;
  readonly conditions: readonly {
    readonly condition: ConditionLabel;
    readonly label: string;
    readonly recovered: string;
    readonly planted: string;
  }[];
}

export function primaryResult(run: BenchmarkRunView): PrimaryResult {
  const order = CONDITION_ORDER.filter((c) => run.conditions.some((a) => a.condition === c));
  const used = order.length > 0 ? order : CONDITION_ORDER;
  return {
    totalRecovered: displayNumber(
      run.conditions.reduce((n, c) => n + (c.holesDetected ?? 0), 0),
    ),
    totalPlanted: displayNumber(
      run.conditions.reduce((n, c) => n + (c.totalHoles ?? 0), 0),
    ),
    conditions: used.map((c) => {
      const agg = run.conditions.find((a) => a.condition === c);
      return {
        condition: c,
        label: conditionLabel(c),
        recovered: displayNumber(agg?.holesDetected ?? null),
        planted: displayNumber(agg?.totalHoles ?? null),
      };
    }),
  };
}

// ─── Metric breakdown -----------------------------------------------------------

export interface MetricRow {
  readonly label: string;
  readonly sublabel?: string;
  readonly kind: "pct" | "count" | "ratio" | "na";
  readonly clean: { value: number | null; numerator?: number | null };
  readonly noisy: { value: number | null; numerator?: number | null };
  readonly adversarial: { value: number | null; numerator?: number | null };
}

function cellVal(a: BenchmarkConditionAggregate, sel: (x: BenchmarkConditionAggregate) => number | null): number | null {
  try {
    return sel(a);
  } catch {
    return null;
  }
}

export function metricBreakdown(run: BenchmarkRunView): readonly MetricRow[] {
  const clean = run.conditions.find((a) => a.condition === "CLEAN") ?? null;
  const noisy = run.conditions.find((a) => a.condition === "NOISY_MISSING") ?? null;
  const adv = run.conditions.find((a) => a.condition === "ADVERSARIAL") ?? null;
  const aggCell = (a: BenchmarkConditionAggregate | null, sel: (x: BenchmarkConditionAggregate) => number | null) =>
    a ? cellVal(a, sel) : null;

  const ratio = (selD: (a: BenchmarkConditionAggregate) => number | null, selN: (a: BenchmarkConditionAggregate) => number | null) => ({
    clean: { value: aggCell(clean, selD), numerator: aggCell(clean, selN) },
    noisy: { value: aggCell(noisy, selD), numerator: aggCell(noisy, selN) },
    adversarial: { value: aggCell(adv, selD), numerator: aggCell(adv, selN) },
  });

  return [
    {
      label: "Planted graph-hole recovery",
      sublabel: "recovered / planted, per condition suite",
      kind: "ratio",
      ...ratio((a) => a.holesDetected, (a) => a.totalHoles),
    },
    {
      label: "Strict recovery",
      kind: "ratio",
      ...ratio((a) => a.holesDetectedStrict, (a) => a.totalHoles),
    },
    {
      label: "ERR@K",
      sublabel: "expected reciprocal rank at the frozen candidate budget",
      kind: "pct",
      clean: { value: aggCell(clean, (a) => a.errAtK) },
      noisy: { value: aggCell(noisy, (a) => a.errAtK) },
      adversarial: { value: aggCell(adv, (a) => a.errAtK) },
    },
    {
      label: "Candidate precision",
      kind: "pct",
      clean: { value: aggCell(clean, (a) => a.candidatePrecision) },
      noisy: { value: aggCell(noisy, (a) => a.candidatePrecision) },
      adversarial: { value: aggCell(adv, (a) => a.candidatePrecision) },
    },
    {
      label: "Surface recall @ 1",
      sublabel: "entity surface resolution at the first rank",
      kind: "pct",
      clean: { value: aggCell(clean, (a) => a.surfaceRecallAt1) },
      noisy: { value: aggCell(noisy, (a) => a.surfaceRecallAt1) },
      adversarial: { value: aggCell(adv, (a) => a.surfaceRecallAt1) },
    },
    {
      label: "Entity precision",
      kind: "pct",
      clean: { value: aggCell(clean, (a) => a.entityPrecision) },
      noisy: { value: aggCell(noisy, (a) => a.entityPrecision) },
      adversarial: { value: aggCell(adv, (a) => a.entityPrecision) },
    },
    {
      label: "Relation precision",
      kind: "pct",
      clean: { value: aggCell(clean, (a) => a.relationPrecision) },
      noisy: { value: aggCell(noisy, (a) => a.relationPrecision) },
      adversarial: { value: aggCell(adv, (a) => a.relationPrecision) },
    },
    {
      label: "Relation recall",
      kind: "pct",
      clean: { value: aggCell(clean, (a) => a.relationRecall) },
      noisy: { value: aggCell(noisy, (a) => a.relationRecall) },
      adversarial: { value: aggCell(adv, (a) => a.relationRecall) },
    },
    {
      label: "Observation coverage",
      kind: "pct",
      clean: { value: aggCell(clean, (a) => a.observationCoverage) },
      noisy: { value: aggCell(noisy, (a) => a.observationCoverage) },
      adversarial: { value: aggCell(adv, (a) => a.observationCoverage) },
    },
    {
      label: "Classification coverage",
      kind: "pct",
      clean: { value: aggCell(clean, (a) => a.classificationCoverage) },
      noisy: { value: aggCell(noisy, (a) => a.classificationCoverage) },
      adversarial: { value: aggCell(adv, (a) => a.classificationCoverage) },
    },
    {
      label: "Signal alignment",
      sublabel: "hole verdicts that match evidence alignment",
      kind: "count",
      clean: { value: aggCell(clean, (a) => a.holesWithSignalAlignment) },
      noisy: { value: aggCell(noisy, (a) => a.holesWithSignalAlignment) },
      adversarial: { value: aggCell(adv, (a) => a.holesWithSignalAlignment) },
    },
    {
      label: "Hard failures",
      sublabel: "uncaught exceptions in the pipeline",
      kind: "count",
      clean: { value: aggCell(clean, (a) => a.hardFailures) },
      noisy: { value: aggCell(noisy, (a) => a.hardFailures) },
      adversarial: { value: aggCell(adv, (a) => a.hardFailures) },
    },
  ];
}

// ─── Hole trace ----------------------------------------------------------------

export interface HoleTrace {
  readonly caseKey: string;
  readonly condition: ConditionLabel;
  readonly holeId: string;
  readonly holeType: string | null;
  readonly expectedType: string | null;
  readonly regionStatus: string | null;
  readonly regionError: string | null;
  readonly detectionError: string | null;
  readonly qualificationError: string | null;
  readonly rawCandidates: number | null;
  readonly qualified: number | null;
  readonly failureReasons: readonly string[];
  readonly verdict: BenchmarkVerdictEntry | null;
}

export function holeTraces(
  run: BenchmarkRunView,
  condition?: ConditionLabel,
): readonly HoleTrace[] {
  const entries = run.holes.filter((e) => !condition || e.condition === condition);
  return entries.map((e) => ({
    caseKey: e.caseKey,
    condition: e.condition ?? "CLEAN",
    holeId: e.holeId,
    holeType: e.holeType,
    expectedType: e.expectedType,
    regionStatus: e.regionStatus,
    regionError: e.regionError,
    detectionError: e.detectionError,
    qualificationError: e.qualificationError,
    rawCandidates: e.rawCandidateCount,
    qualified: e.qualifiedCount,
    failureReasons: e.qualificationFailureReasons ?? [],
    verdict:
      run.verdicts.find(
        (v) => v.caseKey === e.caseKey && v.condition === e.condition && v.holeId === e.holeId,
      ) ?? null,
  }));
}

export function failedHoleTraces(run: BenchmarkRunView, condition?: ConditionLabel): readonly HoleTrace[] {
  return holeTraces(run, condition).filter((t) => {
    if (t.verdict?.lenientHit === true) return false;
    return (t.rawCandidates ?? 0) > 0 || (t.qualified ?? 0) > 0;
  });
}

// ─── Comparison arms --------------------------------------------------------------

export interface ComparisonArm {
  readonly id: string;
  readonly label: string;
  readonly definition: string;
  readonly state: "EXECUTED" | "NOT_RUN" | "COUNTERFACTUAL";
}

export interface ComparisonRow {
  readonly metric: string;
  readonly arms: readonly (number | null)[];
}

export const COMPARISON_DEFINITIONS: readonly {
  id: string;
  label: string;
  definition: string;
}[] = [
  { id: "baseline", label: "BASELINE", definition: "Deterministic core; this run." },
  { id: "semantic", label: "+ SEMANTIC RETRIEVAL", definition: "Region/context expansion injected into PR1; measured delta." },
  { id: "llm", label: "+ LLM ANALYST", definition: "PR7 analyst injected after PR5; telemetry + delta." },
  { id: "full", label: "FULL AVAILABLE INTELLIGENCE", definition: "Every currently implemented, wired, legitimate stage." },
];

/**
 * Comparison surface. Only arms with an executed run carry values; unexecuted
 * arms render NOT RUN — the UI never synthesizes a number for them.
 */
export function comparisonSurface(run: BenchmarkRunView): {
  readonly arms: readonly ComparisonArm[];
  readonly rows: readonly ComparisonRow[];
} {
  const executed = run.conditions;
  const baselineValues = (sel: (a: BenchmarkConditionAggregate) => number | null): number | null => {
    // Reports the CLEAN arm as the single baseline point until a comparison
    // run declares its own values.
    const clean = executed.find((a) => a.condition === "CLEAN");
    return clean ? sel(clean) ?? null : null;
  };
  const arms: ComparisonArm[] = COMPARISON_DEFINITIONS.map((def) => ({
    ...def,
    state: def.id === "baseline" ? "EXECUTED" : "NOT_RUN",
  }));

  const rows: ComparisonRow[] = [
    { metric: "Hole recovery", arms: [baselineValues((a) => a.holesDetected), null, null, null] },
    { metric: "ERR@3", arms: [baselineValues((a) => a.errAtK), null, null, null] },
    { metric: "Candidate availability", arms: [baselineValues((a) => a.candidatePrecision), null, null, null] },
    { metric: "Signal alignment", arms: [baselineValues((a) => a.holesWithSignalAlignment), null, null, null] },
    { metric: "Evidence requests", arms: [null, null, null, null] },
  ];

  return { arms, rows };
}

// ─── Condition view ---------------------------------------------------------------

export interface ConditionFocus {
  readonly condition: ConditionLabel;
  readonly aggregate: BenchmarkConditionAggregate | null;
  readonly traces: readonly HoleTrace[];
  readonly failedTraces: readonly HoleTrace[];
}

export function conditionFocus(run: BenchmarkRunView, condition: ConditionLabel): ConditionFocus {
  const c = (CONDITION_ORDER as readonly string[]).includes(condition) ? condition : "CLEAN";
  return {
    condition: c,
    aggregate: run.conditions.find((a) => a.condition === c) ?? null,
    traces: holeTraces(run, c),
    failedTraces: failedHoleTraces(run, c),
  };
}

// ─── Run label ------------------------------------------------------------------

export function runLabel(run: BenchmarkRunView): string {
  return run.label || "Prototype Pilot";
}