// ============================================================================
// Benchmark surface — interactive client components.
//   · ConditionExplorer — per-condition hole traces with verdict pairing
//   · ExecutionToggle — EXECUTED / NOT EXECUTED surface switch
//   · AnchorNav — sticky section index with scroll-spy
// All data flows in as serializable props from the server projection; the
// client never computes benchmark numbers.
// ============================================================================

"use client";

import { useEffect, useRef, useState } from "react";
import type { BenchmarkConditionLabel } from "@indago/contracts";

import type { BenchmarkRunLoad } from "@/lib/benchmark/benchmark-loader";
import {
  CONDITION_ORDER,
  conditionFocus,
  conditionLabel,
  displayNumber,
  displayRatio,
} from "@/lib/benchmark/benchmark-domain";
import type { CapabilityCoverageRow } from "@/lib/benchmark/capability-coverage";

import { Eyebrow, NotAvailable, ToneDot, type Tone } from "./bits";

// ─── Condition explorer ----------------------------------------------------------

const CONDITION_TONE: Record<BenchmarkConditionLabel, Tone> = {
  CLEAN: "warm",
  NOISY_MISSING: "amber",
  ADVERSARIAL: "rose",
};

export function ConditionExplorer({ run }: { run: BenchmarkRunLoad }) {
  const [active, setActive] = useState<BenchmarkConditionLabel>("CLEAN");
  const focus = conditionFocus(run.view, active);
  const agg = focus.aggregate;

  const stats: { label: string; value: string | null }[] = [
    { label: "Recovery", value: agg ? displayRatio(agg.holesDetected, agg.totalHoles) : null },
    { label: "Strict", value: agg ? displayRatio(agg.holesDetectedStrict, agg.totalHoles) : null },
    { label: "ERR@K", value: agg?.errAtK != null ? (agg.errAtK * 100).toFixed(1) : null },
    { label: "Cand. precision", value: agg?.candidatePrecision != null ? (agg.candidatePrecision * 100).toFixed(1) : null },
    { label: "Hard failures", value: displayNumber(agg?.hardFailures ?? null, "—") },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Condition">
        {CONDITION_ORDER.map((c) => {
          const selected = c === active;
          return (
            <button
              key={c}
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(c)}
              className={`inline-flex items-center gap-2 border px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] transition-colors duration-normal ease-restrained ${
                selected
                  ? "border-semantic-border-emphasis bg-semantic-surface-soft text-semantic-selection"
                  : "border-semantic-border-subtle bg-transparent text-semantic-foreground-faint hover:border-semantic-border-emphasis hover:text-semantic-foreground"
              }`}
            >
              <ToneDot tone={CONDITION_TONE[c]} />
              {conditionLabel(c)}
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-px border border-semantic-border-subtle bg-semantic-border-subtle sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="bg-semantic-background px-5 py-4">
            <Eyebrow>{s.label}</Eyebrow>
            <p className="mt-2 font-mono text-base tracking-[0.04em] text-semantic-foreground-muted">
              {s.value ?? <NotAvailable reason="—" />}
              {s.label === "ERR@K" && s.value && "%"}
              {s.label === "Cand. precision" && s.value && "%"}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <div className="mb-4 flex items-center gap-3">
          <Eyebrow>Planted holes — {conditionLabel(active)}</Eyebrow>
          <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
        </div>
        {focus.traces.length === 0 ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-surface-600">
            No hole traces recorded for this condition.
          </p>
        ) : (
          <div className="divide-y divide-semantic-border-subtle border-y border-semantic-border-subtle">
            {focus.traces.map((t) => {
              const hit = t.verdict?.lenientHit;
              return (
                <div key={`${t.caseKey}-${t.holeId}`} className="grid gap-x-8 gap-y-1 py-4 sm:grid-cols-[1fr_1.4fr]">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-semantic-foreground-faint">
                      {t.caseKey}
                    </span>
                    <span className="text-[0.875rem] text-semantic-foreground">{t.holeId}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-semantic-foreground-faint">
                      {t.holeType ?? "—"}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-semantic-foreground-faint">
                      region · {t.regionStatus ?? "—"}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-semantic-foreground-faint">
                      {displayNumber(t.rawCandidates)} raw / {displayNumber(t.qualified)} qualified
                    </span>
                    {hit === true || hit === false ? (
                      <span
                        className={`font-mono text-[9px] font-bold uppercase tracking-[0.2em] ${
                          hit ? "text-semantic-foreground-muted" : "text-semantic-contradiction"
                        }`}
                      >
                        {hit ? "recovered" : "missed"} {t.verdict?.firstHitRank ? `· r${t.verdict.firstHitRank}` : ""}
                      </span>
                    ) : (
                      <NotAvailable />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Execution toggle ------------------------------------------------------------

export function ExecutionToggle({
  subsystem,
  rows,
}: {
  subsystem: "semantic" | "llm";
  rows: readonly CapabilityCoverageRow[];
}) {
  const [mode, setMode] = useState<"not_executed" | "executed">("not_executed");
  const executed = rows.some((r) => r.benchmarkExecuted === "EXECUTED" || r.benchmarkExecuted === "PARTIAL");

  const modeOptions = executed
    ? ([
        { id: "executed" as const, label: "EXECUTED" },
        { id: "not_executed" as const, label: "NOT EXECUTED" },
      ])
    : ([
        { id: "not_executed" as const, label: "NOT EXECUTED" },
        { id: "executed" as const, label: "EXECUTED" },
      ]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2" role="tablist" aria-label="Execution surface">
        {modeOptions.map((o) => (
          <button
            key={o.id}
            role="tab"
            aria-selected={mode === o.id}
            onClick={() => setMode(o.id)}
            className={`border px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] transition-colors duration-normal ease-restrained ${
              mode === o.id
                ? "border-semantic-border-emphasis bg-semantic-surface-soft text-semantic-selection"
                : "border-semantic-border-subtle text-semantic-foreground-faint hover:text-semantic-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {mode === "not_executed" ? (
        <div className="grid gap-px border border-semantic-border-subtle bg-semantic-border-subtle">
          {rows.map((row) => (
            <div key={row.id} className="bg-semantic-background p-6">
              <div className="grid gap-x-8 gap-y-3 lg:grid-cols-[1.2fr_1fr_1fr]">
                <div>
                  <Eyebrow>{row.capability}</Eyebrow>
                  <p className="mt-2 text-[0.8125rem] leading-relaxed text-semantic-foreground-muted">
                    {row.note ?? "No note recorded."}
                  </p>
                </div>
                <div className="space-y-2">
                  <StatusLine label="Implemented" on={row.implemented} />
                  <StatusLine label="Production-wired" on={row.productionWired} note={row.productionWiredNote} />
                </div>
                <p className="font-mono text-[9px] uppercase leading-relaxed tracking-[0.18em] text-surface-600">
                  {row.source}
                </p>
              </div>
            </div>
          ))}
          <p className="bg-semantic-background p-6 font-mono text-[10px] uppercase leading-relaxed tracking-[0.18em] text-semantic-warning">
            {subsystem === "semantic"
              ? "Semantic retrieval never ran inside the benchmark — there is no measured number to display."
              : "The LLM stack never ran inside the benchmark — there is no measured number to display."}
          </p>
        </div>
      ) : (
        <div className="border border-semantic-border-subtle bg-semantic-background p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-surface-600">
            No executed measurement is recorded in this run. The executed surface for this subsystem is empty.
          </p>
        </div>
      )}
    </div>
  );
}

function StatusLine({ label, on, note }: { label: string; on: boolean; note?: string }) {
  return (
    <p className="flex items-center gap-2">
      <span className={`h-1 w-1 rounded-full ${on ? "bg-semantic-foreground-muted" : "bg-surface-600"}`} aria-hidden="true" />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-semantic-foreground-muted">{label}</span>
      <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-semantic-foreground-faint">{on ? "· yes" : "· no"}</span>
      {note && <span className="font-mono text-[9px] tracking-[0.1em] text-surface-600">({note})</span>}
    </p>
  );
}

// ─── Anchor nav ---------------------------------------------------------------------

export interface AnchorItem {
  readonly id: string;
  readonly label: string;
}

export function AnchorNav({ items }: { items: readonly AnchorItem[] }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");
  const activeRef = useRef<string>(items[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            activeRef.current = entry.target.id;
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav
      aria-label="Benchmark sections"
      className="sticky top-4 z-20 mx-auto max-w-fit border border-semantic-border-subtle bg-semantic-surface/95 backdrop-blur-md"
    >
      <div className="flex flex-wrap items-center gap-x-1 px-3 py-2">
        {items.map((item, i) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`flex items-center gap-2 px-2.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] transition-colors duration-normal ease-restrained ${
              active === item.id
                ? "text-semantic-selection"
                : "text-semantic-foreground-faint hover:text-semantic-foreground"
            }`}
          >
            <span className="text-surface-600">{String(i + 1).padStart(2, "0")}</span>
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}