// ============================================================================
// Benchmark surface — editorial sections (server components). Every section
// renders ONLY from the typed projection (BenchmarkRunLoad); nothing here
// invents a metric. Missing data renders as NOT AVAILABLE. Interactive pieces
// (condition explorer, capability disclosure, anchor nav) are client
// components imported from ./interactive.
// ============================================================================

import Link from "next/link";
import type { ReactNode } from "react";
import type { BenchmarkConditionLabel, BenchmarkVerdictEntry } from "@indago/contracts";

import type { BenchmarkRunLoad } from "@/lib/benchmark/benchmark-loader";
import {
  conditionLabel,
  displayNumber,
  displayPercent,
  displayRatio,
  metricBreakdown,
  primaryResult,
  statePresentation,
  type HoleTrace,
} from "@/lib/benchmark/benchmark-domain";
import { findHoleAnnotation } from "@/lib/benchmark/failure-mechanisms";
import type { CapabilityCoverageRow } from "@/lib/benchmark/capability-coverage";

import {
  Cell,
  Eyebrow,
  Kicker,
  Monument,
  MonoValue,
  NotAvailable,
  RowNumber,
  SectionHeader,
  StateMarker,
  Table,
  ToneDot,
  type Tone,
} from "./bits";

export function formatSha(sha: string | null): string {
  if (!sha) return "NOT RECORDED";
  return sha.length > 12 ? sha.slice(0, 12) : sha;
}

export function conditionTone(condition: BenchmarkConditionLabel): Tone {
  switch (condition) {
    case "CLEAN":
      return "warm";
    case "NOISY_MISSING":
      return "amber";
    case "ADVERSARIAL":
      return "rose";
    default:
      return "warm";
  }
}

// ─── Hero + primary result ----------------------------------------------------

export function BenchmarkHero({ run }: { run: BenchmarkRunLoad }) {
  const { view, integrity, counts } = run;
  const { marker, isHistorical } = statePresentation(view.state);
  const primary = primaryResult(view);
  const tone = isHistorical ? "amber" : view.state === "COUNTERFACTUAL" ? "rose" : "warm";

  const meta = [
    { label: "Case packages", value: displayNumber(counts.cases) },
    { label: "Planted gaps", value: displayNumber(counts.plantedHoles) },
    { label: "Conditions", value: displayNumber(counts.conditionCount) },
    { label: "Version", value: view.benchmarkVersion || "prototype-pilot" },
    { label: "Commit", value: formatSha(view.gitSha) },
  ];

  return (
    <header className="border-b border-semantic-border-subtle pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Kicker>INDAGO · System evaluation · Benchmark</Kicker>
        <StateMarker tone={tone}>{marker}</StateMarker>
      </div>

      <div className="mt-10 grid gap-x-16 gap-y-10 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-semantic-foreground-faint">
            {view.commentary?.title ?? "PROTOTYPE BENCHMARK"}
          </p>
          <h1 className="mt-4 font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
            {run.view.label || run.view.runId}
          </h1>
          <p className="mt-4 max-w-[46ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
            {view.commentary?.label ?? "INTERNAL PILOT EVALUATION"} ·{" "}
            {integrity.corpus}
            {view.model ? ` · model ${view.model}` : ""}
          </p>
          {integrity.groundTruthAccessed === true && (
            <p className="mt-3 max-w-[52ch] font-mono text-[10px] uppercase leading-relaxed tracking-[0.18em] text-semantic-warning">
              Historical run — inference path consulted hidden truth; not a
              corrected observation-only result
            </p>
          )}
        </div>

        <div className="lg:justify-self-end">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-semantic-foreground-faint">
            Planted graph-hole recovery
          </p>
          <div className="mt-2 flex items-baseline gap-4">
            <Monument>
              <span className="text-[6.5rem]">{primary.totalRecovered}</span>
              <span className="mx-3 text-[3rem] text-semantic-foreground-faint">/</span>
              <span className="text-[3.5rem] text-semantic-foreground-muted">{primary.totalPlanted}</span>
            </Monument>
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-semantic-foreground-faint">
            recovered holes · planted holes
          </p>
        </div>
      </div>

      <div className="mt-10 grid gap-px border border-semantic-border-subtle bg-semantic-border-subtle sm:grid-cols-5">
        {meta.map((m) => (
          <div key={m.label} className="bg-semantic-background px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-semantic-foreground-faint">{m.label}</p>
            <p className="mt-2 font-mono text-sm tracking-[0.05em] text-semantic-foreground-muted">{m.value}</p>
          </div>
        ))}
      </div>
    </header>
  );
}

export function ConditionTrio({ run }: { run: BenchmarkRunLoad }) {
  const primary = primaryResult(run.view);
  return (
    <div className="grid gap-px border border-semantic-border-subtle bg-semantic-border-subtle sm:grid-cols-3">
      {primary.conditions.map((c) => {
        const agg = run.view.conditions.find((a) => a.condition === c.condition);
        return (
          <div key={c.condition} className="bg-semantic-background p-6">
            <div className="flex items-center gap-2">
              <ToneDot tone={conditionTone(c.condition)} />
              <Eyebrow>{c.label}</Eyebrow>
            </div>
            <p className="mt-4 font-display text-[3rem] font-light leading-none tracking-[-0.02em] text-semantic-foreground">
              <span>{c.recovered}</span>
              <span className="mx-2 text-[1.4rem] text-semantic-foreground-faint">/</span>
              <span className="text-[1.8rem] text-semantic-foreground-muted">{c.planted}</span>
            </p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-semantic-foreground-faint">
              recovered · planted
            </p>
            {agg && (agg.fprProxy ?? null) !== null && (
              <p className="mt-3 text-[0.8125rem] text-semantic-foreground-muted">
                FPR proxy {displayPercent(agg.fprProxy, 4)} · ERR@K {displayPercent(agg.errAtK)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Metric breakdown ----------------------------------------------------------

function MetricCell({ value, numerator, kind }: { value: number | null; numerator?: number | null; kind: "pct" | "count" | "ratio" | "na" }) {
  if (value === null || value === undefined) return <NotAvailable />;
  if (kind === "ratio") return <span className="font-mono text-sm text-semantic-foreground-muted">{displayRatio(value, numerator ?? null)}</span>;
  if (kind === "count") return <span className="font-mono text-sm text-semantic-foreground-muted">{displayNumber(value)}</span>;
  return <span className="font-mono text-sm text-semantic-foreground-muted">{displayPercent(value)}</span>;
}

export function MetricBreakdown({ run }: { run: BenchmarkRunLoad }) {
  const rows = metricBreakdown(run.view);
  const headers = ["Metric", "CLEAN", "NOISY", "ADVERSARIAL"] as const;
  return (
    <Table
      headers={headers.map((h, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <ToneDot tone={conditionTone(h as BenchmarkConditionLabel)} />}
          {i === 0 ? h : conditionLabel(h as BenchmarkConditionLabel)}
        </span>
      ))}
    >
      {rows.map((r, i) => (
        <tr key={r.label} className="group">
          <Cell className="pr-6">
            <div className="flex items-baseline gap-3">
              <RowNumber index={`${String(i + 1).padStart(2, "0")}`} />
              <div>
                <span className="text-[0.875rem] text-semantic-foreground">{r.label}</span>
                {r.sublabel && (
                  <p className="mt-0.5 text-[0.75rem] text-semantic-foreground-faint">{r.sublabel}</p>
                )}
              </div>
            </div>
          </Cell>
          <Cell align="left">
            <MetricCell value={r.clean.value} numerator={r.clean.numerator} kind={r.kind} />
          </Cell>
          <Cell align="left">
            <MetricCell value={r.noisy.value} numerator={r.noisy.numerator} kind={r.kind} />
          </Cell>
          <Cell align="left">
            <MetricCell value={r.adversarial.value} numerator={r.adversarial.numerator} kind={r.kind} />
          </Cell>
        </tr>
      ))}
    </Table>
  );
}

// ─── Run comparison -------------------------------------------------------------

export function ComparisonSection({ run }: { run: BenchmarkRunLoad }) {
  const { arms, rows } = run.comparison;
  const labels = ["Baseline", "+ Semantic retrieval", "+ LLM analyst", "Full available intelligence"];
  return (
    <div>
      <div className="mb-8 grid gap-px border border-semantic-border-subtle bg-semantic-border-subtle lg:grid-cols-4">
        {arms.map((arm) => (
          <div key={arm.id} className="bg-semantic-background p-5">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>{arm.label}</Eyebrow>
              {arm.state === "EXECUTED" ? (
                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-semantic-foreground-muted">
                  <ToneDot tone="warm" /> executed
                </span>
              ) : (
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-semantic-foreground-faint">
                  not run
                </span>
              )}
            </div>
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-semantic-foreground-muted">{arm.definition}</p>
          </div>
        ))}
      </div>

      <p className="mb-4 max-w-[70ch] text-[0.8125rem] leading-relaxed text-semantic-foreground-faint">
        Only the deterministic baseline has executed in this run. Intervention arms
        are declared but not measured — their cells render NOT RUN rather than a
        synthesized number. When a future run executes an arm, the artifact materalizes
        its values here.
      </p>

      <Table headers={["Metric", ...labels.map((l) => <span key={l}>{l}</span>)]}>
        {rows.map((row) => (
          <tr key={row.metric}>
            <Cell className="pr-6">
              <span className="text-[0.875rem] text-semantic-foreground">{row.metric}</span>
            </Cell>
            {row.arms.map((v, i) => (
              <Cell key={i} align="left">
                {v === null ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-surface-600">not run</span>
                ) : (
                  <span className="font-mono text-sm text-semantic-foreground-muted">{displayNumber(v)}</span>
                )}
              </Cell>
            ))}
          </tr>
        ))}
      </Table>
    </div>
  );
}

// ─── Capability coverage ----------------------------------------------------------

function CoverageCell({ on, label, note }: { on: boolean; label: string; note?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-1 w-1 rounded-full ${on ? "bg-semantic-foreground-muted" : "bg-surface-600"}`} aria-hidden="true" />
      <span className={`font-mono text-[10px] uppercase tracking-[0.18em] ${on ? "text-semantic-foreground-muted" : "text-surface-600"}`}>
        {label}
      </span>
      {note && <span className="font-mono text-[9px] tracking-[0.1em] text-surface-600">({note})</span>}
    </span>
  );
}

function ExecStatus({ row }: { row: CapabilityCoverageRow }) {
  const map: Record<CapabilityCoverageRow["benchmarkExecuted"], { label: string; tone: Tone }> = {
    EXECUTED: { label: "EXECUTED", tone: "warm" },
    PARTIAL: { label: "PARTIAL", tone: "warm" },
    FABRICATED_INPUT: { label: "FABRICATED INPUT", tone: "amber" },
    NOT_EXECUTED: { label: "NOT EXECUTED", tone: "rose" },
    NOT_APPLICABLE: { label: "N/A", tone: "info" },
  };
  const m = map[row.benchmarkExecuted];
  return (
    <span className="flex items-center gap-2">
      <ToneDot tone={m.tone} />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-semantic-foreground-muted">{m.label}</span>
    </span>
  );
}

export function CapabilityTable({ run }: { run: BenchmarkRunLoad }) {
  return (
    <Table
      headers={[
        "Component",
        "Implemented",
        "Production-wired",
        "Benchmark surface",
        <span className="sr-only" key="note">Note</span>,
      ]}
    >
      {run.capabilities.map((row, i) => (
        <tr key={row.id}>
          <Cell className="pr-6 align-top">
            <div className="flex items-baseline gap-3">
              <RowNumber index={String(i + 1).padStart(2, "0")} />
              <div>
                <span className="text-[0.875rem] text-semantic-foreground">{row.capability}</span>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-semantic-foreground-faint">{row.group}</p>
              </div>
            </div>
          </Cell>
          <Cell className="align-top">
            <CoverageCell on={row.implemented} label={row.implemented ? "impl" : "—"} />
          </Cell>
          <Cell className="align-top">
            <CoverageCell
              on={row.productionWired}
              label={row.productionWired ? "wired" : "not wired"}
              note={row.productionWiredNote}
            />
          </Cell>
          <Cell className="align-top">
            <ExecStatus row={row} />
          </Cell>
          <Cell className="align-top">
            {row.note ? (
              <p className="max-w-[42ch] text-[0.75rem] leading-relaxed text-semantic-foreground-faint">{row.note}</p>
            ) : (
              <NotAvailable reason="—" />
            )}
          </Cell>
        </tr>
      ))}
    </Table>
  );
}

// ─── Failure anatomy ----------------------------------------------------------------

function StageLine({ label, state, detail }: { label: string; state: "ok" | "fail" | "empty"; detail?: string | null }) {
  const dot =
    state === "ok" ? "bg-semantic-foreground-muted" : state === "fail" ? "bg-semantic-contradiction" : "bg-surface-600";
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center self-stretch">
        <span className={`mt-1 h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
        <span className="w-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
      </div>
      <div className="pb-6">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-semantic-foreground-faint">{label}</p>
        <p className="mt-1 text-[0.8125rem] text-semantic-foreground-muted">
          {detail ? <MonoValue>{detail}</MonoValue> : <NotAvailable reason="not recorded" />}
        </p>
      </div>
    </div>
  );
}

function FailureTrace({ trace }: { trace: HoleTrace }) {
  const ann = findHoleAnnotation(trace.caseKey, trace.condition);
  const reasonCol = trace.failureReasons.length > 0 ? trace.failureReasons.join(" · ") : null;
  return (
    <article className="border border-semantic-border-subtle bg-semantic-surface">
      <div className="border-b border-semantic-border-subtle px-6 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-semantic-foreground-faint">{trace.caseKey}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-semantic-foreground-muted">{trace.holeId}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-semantic-foreground-faint">
              {trace.holeType ?? "—"} / expected {trace.expectedType ?? "—"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1fr_1fr]">
        <div className="border-b border-semantic-border-subtle px-6 py-6 lg:border-b-0 lg:border-r">
          <Eyebrow>Measured trace</Eyebrow>
          <div className="mt-5">
            <StageLine
              label="Region construction"
              state={trace.regionStatus ? "ok" : "empty"}
              detail={trace.regionStatus ? trace.regionStatus : trace.regionError}
            />
            <StageLine
              label="Detection"
              state={trace.rawCandidates !== null && trace.rawCandidates > 0 ? "ok" : "fail"}
              detail={trace.detectionError ?? `${trace.rawCandidates ?? "—"} raw candidates`}
            />
            <StageLine
              label="Qualification"
              state={trace.qualified !== null && trace.qualified > 0 ? "ok" : "fail"}
              detail={trace.qualificationError ?? (trace.qualified ?? "—") + " qualified · " + (reasonCol ?? "no reasons recorded")}
            />
            {trace.verdict && (
              <StageLine
                label="Verdict"
                state={trace.verdict.lenientHit === true ? "ok" : "fail"}
                detail={
                  `${VerdictVerb(trace.verdict)}` + (trace.verdict.firstHitRank ? ` · first hit r${trace.verdict.firstHitRank}` : "")
                }
              />
            )}
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="flex items-center gap-3">
            <Eyebrow>Audit analysis</Eyebrow>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-surface-600">§10</span>
          </div>
          {ann ? (
            <dl className="mt-5 space-y-4">
              <Fact label="Earliest loss stage" value={ann.earliestLossStage} />
              <Fact label="Mechanism" value={ann.mechanism} wide />
              <div className="grid grid-cols-3 gap-4">
                <Fact label="LLM recover" value={ann.llmRecover} />
                <Fact label="Semantic recover" value={ann.semanticRecover} />
                <Fact label="Reassessment" value={ann.reassessmentRecover} />
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-[0.8125rem] text-semantic-foreground-faint">
              No audit annotation recorded for this hole.
            </p>
          )}
          <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.15em] text-surface-600">
            Source · benchmark/audit/deep-audit.md
          </p>
        </div>
      </div>
    </article>
  );
}

function VerdictVerb(v: BenchmarkVerdictEntry): string {
  if (v.lenientHit === true) return v.strictHit === true ? "HIT · strict" : "HIT · lenient";
  return v.lenientHit === false ? "MISS" : "NO VERDICT";
}

function Fact({ label, value, wide = false }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-full" : ""}>
      <dt className="font-mono text-[9px] uppercase tracking-[0.22em] text-semantic-foreground-faint">{label}</dt>
      <dd className="mt-1 text-[0.8125rem] leading-relaxed text-semantic-foreground-muted">{value ?? "—"}</dd>
    </div>
  );
}

export function FailureAnatomy({ run }: { run: BenchmarkRunLoad }) {
  const groups: { condition: BenchmarkConditionLabel; traces: readonly HoleTrace[] }[] = (
    ["CLEAN", "NOISY_MISSING", "ADVERSARIAL"] as const
  ).map((condition) => ({
    condition,
    traces: run.view.verdicts.length > 0
      ? collectFailed(run, condition)
      : failedTracesFallback(run, condition),
  }));

  return (
    <div className="space-y-12">
      {groups.map((g) =>
        g.traces.length === 0 ? null : (
          <div key={g.condition}>
            <div className="mb-4 flex items-center gap-2">
              <ToneDot tone={conditionTone(g.condition)} />
              <Eyebrow>{conditionLabel(g.condition)}</Eyebrow>
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-surface-600">
                {g.traces.length} failed {g.traces.length === 1 ? "hole" : "holes"}
              </span>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              {g.traces.map((t) => (
                <FailureTrace key={`${t.caseKey}-${t.holeId}`} trace={t} />
              ))}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function collectFailed(run: BenchmarkRunLoad, condition: BenchmarkConditionLabel): HoleTrace[] {
  // Verdict-driven: a hole failed when no lenient hit was recorded. Traces come
  // from the hole entries paired by caseKey+holeId (hard linkage keyed on the
  // verdict record, the measured trace is appended when it exists).
  const verdicts = run.view.verdicts.filter((v) => v.condition === condition);
  const entries = run.view.holes.filter((h) => h.condition === condition);
  const failed: HoleTrace[] = [];
  for (const v of verdicts) {
    if (v.lenientHit === true) continue;
    const e = entries.find((h) => h.caseKey === v.caseKey && h.holeId === v.holeId);
    failed.push({
      caseKey: v.caseKey,
      condition: v.condition ?? condition,
      holeId: v.holeId,
      holeType: v.holeType ?? e?.holeType ?? null,
      expectedType: null,
      regionStatus: e?.regionStatus ?? v.regionStatus ?? null,
      regionError: e?.regionError ?? null,
      detectionError: e?.detectionError ?? null,
      qualificationError: e?.qualificationError ?? null,
      rawCandidates: e?.rawCandidateCount ?? null,
      qualified: e?.qualifiedCount ?? null,
      failureReasons: e?.qualificationFailureReasons ?? [],
      verdict: v,
    });
  }
  return failed;
}

function failedTracesFallback(run: BenchmarkRunLoad, condition: BenchmarkConditionLabel): HoleTrace[] {
  return run.view.holes
    .filter((h) => h.condition === condition)
    .filter((h) => h.rawCandidateCount !== null && (h.rawCandidateCount ?? 0) > 0)
    .map((h) => ({
      caseKey: h.caseKey,
      condition: h.condition ?? condition,
      holeId: h.holeId,
      holeType: h.holeType,
      expectedType: h.expectedType,
      regionStatus: h.regionStatus,
      regionError: h.regionError,
      detectionError: h.detectionError,
      qualificationError: h.qualificationError,
      rawCandidates: h.rawCandidateCount,
      qualified: h.qualifiedCount,
      failureReasons: h.qualificationFailureReasons ?? [],
      verdict: null,
    }));
}

// ─── Integrity ---------------------------------------------------------------------

export function Integrity({ run }: { run: BenchmarkRunLoad }) {
  const { integrity, view } = run;
  const facts: { label: string; value: ReactNode }[] = [
    { label: "Run state", value: <StateMarker tone={integrity.state === "PRE_ANALYSIS" ? "amber" : "warm"}>{statePresentation(view.state).marker}</StateMarker> },
    { label: "Inference mode", value: <MonoValue>{integrity.inferenceMode}</MonoValue> },
    { label: "Ground truth accessed", value: <MonoValue>{integrity.groundTruthAccessed === true ? "YES" : integrity.groundTruthAccessed === false ? "NO" : <NotAvailable />}</MonoValue> },
    { label: "Corpus", value: <MonoValue>{integrity.corpus}</MonoValue> },
    { label: "Independent validation", value: <MonoValue>{integrity.independentValidation === true ? "PASSED" : integrity.independentValidation === false ? "NOT PERFORMED" : <NotAvailable />}</MonoValue> },
    { label: "Production validation", value: <MonoValue>{integrity.productionValidation === true ? "CONFIRMED" : integrity.productionValidation === false ? "NOT PERFORMED" : <NotAvailable />}</MonoValue> },
    { label: "Generated at", value: <MonoValue>{view.generatedAt || <NotAvailable />}</MonoValue> },
  ];
  return (
    <div className="grid gap-px border border-semantic-border-subtle bg-semantic-border-subtle lg:grid-cols-2">
      <div className="space-y-5 bg-semantic-background p-6 lg:col-span-2">
        <Eyebrow>Provenance annotation</Eyebrow>
        <p className="max-w-[80ch] text-[0.875rem] leading-relaxed text-semantic-foreground-muted">
          {integrity.provenanceNote ?? "No annotation was recorded for this run beyond the artifact self-declared values."}
        </p>
        {integrity.provenanceSource && (
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-surface-600">
            Source · {integrity.provenanceSource}
          </p>
        )}
      </div>
      {facts.map((f) => (
        <div key={f.label} className="bg-semantic-background p-6">
          <Eyebrow>{f.label}</Eyebrow>
          <div className="mt-3">{f.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Methodology -------------------------------------------------------------------

export function Methodology({ run }: { run: BenchmarkRunLoad }) {
  const { sources, artifactHashes, counts } = run;
  const gate = "Frozen gates — MIN_STRUCTURAL_SCORE = MIN_SIGNIFICANCE = 0.70";
  return (
    <div className="grid gap-px border border-semantic-border-subtle bg-semantic-border-subtle lg:grid-cols-2">
      <div className="bg-semantic-background p-6">
        <Eyebrow>Procedure</Eyebrow>
        <p className="mt-4 max-w-[68ch] text-[0.875rem] leading-relaxed text-semantic-foreground-muted">
          A deterministic synthetic corpus of {displayNumber(counts.cases)} case packages across{" "}
          {displayNumber(counts.conditionCount)} conditions. {displayNumber(counts.plantedHoles)} holes were planted
          across {counts.conditionCount} suites. Every measurement flows through the committed benchmark harness
          (corpus → pipeline → holes → robustness → metrics → report); no number in this view was typed by hand.
        </p>
        <div className="mt-5 space-y-2.5">
          {[
            `${gate}`,
            "Semantic retrieval not injected — region expansion seam disabled",
            "Extraction input fabricated as RawExtraction (makeTxt); real OCR never ran",
            "Reassessment is event-driven — outside the static snapshot",
          ].map((line) => (
            <p key={line} className="flex items-start gap-2.5 font-mono text-[10px] uppercase leading-relaxed tracking-[0.15em] text-semantic-foreground-faint">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-surface-600" aria-hidden="true" />
              {line}
            </p>
          ))}
        </div>
      </div>

      <div className="bg-semantic-background p-6">
        <Eyebrow>Sources (manifest)</Eyebrow>
        <dl className="mt-4 space-y-2.5">
          {Object.entries(sources).map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-semantic-border-subtle pb-2">
              <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-semantic-foreground-faint">{k}</dt>
              <dd className="font-mono text-[0.75rem] text-semantic-foreground-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {Object.keys(artifactHashes).length > 0 && (
        <div className="bg-semantic-background p-6 lg:col-span-2">
          <Eyebrow>Append-only artifact hashes</Eyebrow>
          <div className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
            {Object.entries(artifactHashes).map(([k, v]) => (
              <span key={k} className="font-mono text-[10px] text-semantic-foreground-faint">
                {k} <span className="text-surface-600">{v.slice(0, 12)}…</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reproducibility -----------------------------------------------------------------

export function Reproducibility({ run }: { run: BenchmarkRunLoad }) {
  const base = `/benchmarks/${run.view.runId}/documents`;
  const docs: { file: string; label: string; kind: string }[] = [
    { file: "manifest.json", label: "manifest.json", kind: "Run provenance" },
    { file: "summary.json", label: "summary.json", kind: "Aggregated metrics" },
    { file: "holes.json", label: "holes.json", kind: "Hole traces + verdicts" },
    { file: "deep-audit.md", label: "deep-audit.md", kind: "Failure analysis" },
    { file: "condition-summary.md", label: "condition-summary.md", kind: "Condition notes" },
    { file: "viability.md", label: "viability.md", kind: "Viability review" },
    { file: "README.md", label: "README.md", kind: "Corpus description" },
  ];
  return (
    <div>
      <p className="mb-6 max-w-[70ch] font-mono text-[10px] uppercase leading-relaxed tracking-[0.18em] text-semantic-warning">
        Historical slice — served from committed artifacts. The numbers above can be re-derived by re-running the
        benchmark harness on the same seed.
      </p>
      <div className="grid gap-px border border-semantic-border-subtle bg-semantic-border-subtle lg:grid-cols-3">
        {docs.map((d) => (
          <Link
            key={d.file}
            href={`${base}/${encodeURIComponent(d.file)}`}
            className="group bg-semantic-background p-5 transition-colors duration-normal ease-restrained hover:bg-semantic-surface"
          >
            <Eyebrow>{d.kind}</Eyebrow>
            <p className="mt-3 font-mono text-[0.8125rem] text-semantic-foreground-muted group-hover:text-semantic-foreground">
              {d.label}
            </p>
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-surface-600 group-hover:text-semantic-foreground-faint">
              View raw artifact ↗
            </p>
          </Link>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-semantic-border-subtle pt-5">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-surface-600">
          Resolution · {run.resolution.dir ?? "none mounted"}
        </span>
        <Link
          href="/benchmarks"
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-semantic-foreground-muted transition-colors duration-normal ease-restrained hover:text-semantic-foreground"
        >
          ← Benchmark index
        </Link>
      </div>
    </div>
  );
}

export function AvailableRunsNav({ run }: { run: BenchmarkRunLoad }) {
  if (run.availableRuns.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-semantic-border-subtle pt-5">
      <Eyebrow>Other runs</Eyebrow>
      {run.availableRuns.map((r) => (
        <Link
          key={r.runId}
          href={`/benchmarks/${r.runId}`}
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-semantic-foreground-muted transition-colors duration-normal ease-restrained hover:text-semantic-foreground"
        >
          {r.label || r.runId}
        </Link>
      ))}
    </div>
  );
}

export function SectionShell({ index, eyebrow, title, right, id, children }: {
  index: string;
  eyebrow: string;
  title: ReactNode;
  right?: ReactNode;
  id: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-semantic-border-subtle py-14">
      <SectionHeader index={index} eyebrow={eyebrow} title={title} right={right} />
      <div className="mt-10">{children}</div>
    </section>
  );
}