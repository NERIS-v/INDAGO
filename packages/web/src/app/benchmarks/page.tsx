import type { Metadata } from "next";
import Link from "next/link";

import { loadBenchmarkCatalog } from "@/lib/benchmark/benchmark-loader";
import {
  BenchmarkHero,
  ConditionTrio,
  Integrity,
  Reproducibility,
  SectionShell,
} from "@/components/benchmark/sections";
import { Eyebrow, StateMarker } from "@/components/benchmark/bits";
import { displayNumber, statePresentation } from "@/lib/benchmark/benchmark-domain";
import { benchmarkExecuted } from "@/lib/benchmark/capability-coverage";

export const metadata: Metadata = {
  title: "System Benchmark — INDAGO",
  description:
    "Controlled evaluation of the INDAGO intelligence system over synthetic, de-identified benchmark data.",
};

export default async function BenchmarkIndexPage() {
  const catalog = await loadBenchmarkCatalog();

  if (!catalog.active) {
    return (
      <main className="relative min-h-screen bg-semantic-background">
        <div className="mx-auto max-w-[1080px] px-8 py-16">
          <div className="mb-10 flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            <span>INDAGO</span>
            <span className="h-px w-12 bg-semantic-border-subtle" aria-hidden="true" />
            <span>System evaluation</span>
            <span className="h-px w-12 bg-semantic-border-subtle" aria-hidden="true" />
            <span>Benchmark</span>
          </div>
          <h1 className="font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
            No benchmark corpus mounted
          </h1>
          <p className="mt-4 max-w-[60ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
            The system benchmark surface is artifact-driven: it renders committed run
            directories, never a live process. No directory containing a
            <span className="font-mono text-[10px] tracking-[0.15em] text-semantic-foreground-faint"> manifest.json </span>
            was resolved from the workspace or from
            <span className="font-mono text-[10px] tracking-[0.15em] text-semantic-foreground-faint"> INDAGO_BENCHMARK_DIR / INDAGO_BENCHMARK_RUNS_DIR</span>.
          </p>
        </div>
      </main>
    );
  }

  const run = catalog.active;
  const executedCount = run.capabilities.filter((c) => benchmarkExecuted(c)).length;
  const wiredCount = run.capabilities.filter((c) => c.productionWired).length;

  return (
    <main className="relative min-h-screen bg-semantic-background">
      <div className="mx-auto max-w-[1080px] px-8 py-14">
        <BenchmarkHero run={run} />

        <section className="mt-14 grid gap-px border border-semantic-border-subtle bg-semantic-border-subtle lg:grid-cols-3">
          {[
            { label: "Capabilities", value: displayNumber(run.capabilities.length) },
            { label: "Production-wired", value: displayNumber(wiredCount) },
            { label: "Benchmark surface", value: `${displayNumber(executedCount)} executed` },
          ].map((m) => (
            <div key={m.label} className="bg-semantic-background px-6 py-5">
              <Eyebrow>{m.label}</Eyebrow>
              <p className="mt-2 font-mono text-sm tracking-[0.04em] text-semantic-foreground-muted">{m.value}</p>
            </div>
          ))}
        </section>

        {/* PRIMARY RESULT */}
        <SectionShell
          index="01"
          id="result"
          eyebrow="Primary result"
          title={
            <>
              Planted graph-hole recovery
              <span className="ml-3 font-mono text-[10px] font-normal uppercase tracking-[0.2em] text-surface-600">
                recovered / planted, per condition
              </span>
            </>
          }
        >
          <p className="mb-8 max-w-[72ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
            The deterministic core recovered 3 of 8 planted holes on the clean suite.
            Noise and adversarial manipulation each remove one further recovery. The
            numbers below are the measured aggregate from
            <span className="font-mono text-[10px] tracking-[0.15em] text-semantic-foreground-faint"> summary.json</span>.
          </p>
          <ConditionTrio run={run} />
          <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.18em] text-surface-600">
            Historical pre-analysis slice — do not read as AI accuracy. See integrity.
          </p>
        </SectionShell>

        {/* RUN INDEX */}
        <SectionShell
          index="02"
          id="runs"
          eyebrow="Runs"
          title={
            <>
              Run index
              <span className="ml-3 font-mono text-[10px] font-normal uppercase tracking-[0.2em] text-surface-600">
                committed directories
              </span>
            </>
          }
        >
          <div className="divide-y divide-semantic-border-subtle border-y border-semantic-border-subtle">
            <div className="grid gap-x-8 gap-y-2 py-5 sm:grid-cols-[1fr_1fr_auto]">
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-surface-600">01</span>
                <span className="text-[0.9375rem] text-semantic-foreground">
                  {run.view.label || run.view.runId}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-semantic-foreground-faint">
                  {run.view.runId} · {displayNumber(run.counts.plantedHoles)} planted gaps
                </span>
              </div>
              <Link
                href={`/benchmarks/${run.view.runId}`}
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-semantic-foreground-muted transition-colors duration-normal ease-restrained hover:text-semantic-foreground"
              >
                View full run ↗
              </Link>
            </div>
            {catalog.runs
              .filter((r) => r.runId !== run.view.runId)
              .map((r, i) => (
                <div key={r.runId} className="grid gap-x-8 gap-y-2 py-5 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-surface-600">
                      {String(i + 2).padStart(2, "0")}
                    </span>
                    <span className="text-[0.9375rem] text-semantic-foreground">{r.label || r.runId}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-semantic-foreground-faint">
                      {r.runId}
                    </span>
                    <StateMarker tone={r.state === "PRE_ANALYSIS" ? "amber" : "warm"}>
                      {statePresentation(r.state).marker}
                    </StateMarker>
                  </div>
                  <Link
                    href={`/benchmarks/${r.runId}`}
                    className="font-mono text-[10px] uppercase tracking-[0.2em] text-semantic-foreground-muted transition-colors duration-normal ease-restrained hover:text-semantic-foreground"
                  >
                    View run ↗
                  </Link>
                </div>
              ))}
          </div>
        </SectionShell>

        {/* INTEGRITY */}
        <SectionShell
          index="03"
          id="integrity"
          eyebrow="Integrity"
          title="How to read this slice"
          right={
            run.integrity.groundTruthAccessed === true ? (
              <StateMarker tone="amber">Historical · pre-audit</StateMarker>
            ) : (
              <StateMarker tone="warm">Observation-only</StateMarker>
            )
          }
        >
          <Integrity run={run} />
        </SectionShell>

        {/* REPRODUCIBILITY */}
        <SectionShell
          index="04"
          id="artifacts"
          eyebrow="Reproducibility"
          title="Append-only artifacts"
          right={
            catalog.resolution.error ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-semantic-warning">
                {catalog.resolution.error}
              </span>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-surface-600">
                {run.resolution.dir ?? ""}
              </span>
            )
          }
        >
          <Reproducibility run={run} />
        </SectionShell>
      </div>
    </main>
  );
}