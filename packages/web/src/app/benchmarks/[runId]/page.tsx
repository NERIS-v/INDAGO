import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadBenchmarkRun } from "@/lib/benchmark/benchmark-loader";
import {
  AvailableRunsNav,
  BenchmarkHero,
  CapabilityTable,
  ComparisonSection,
  ConditionTrio,
  FailureAnatomy,
  Integrity,
  Methodology,
  MetricBreakdown,
  Reproducibility,
  SectionShell,
} from "@/components/benchmark/sections";
import {
  AnchorNav,
  ConditionExplorer,
  ExecutionToggle,
} from "@/components/benchmark/interactive";

export const metadata: Metadata = {
  title: "Benchmark Run — INDAGO",
  description: "Detailed measurement surface for one committed benchmark run.",
};

export default async function BenchmarkRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await loadBenchmarkRun(runId);
  if (!run) notFound();

  const anchors = [
    { id: "result", label: "Result" },
    { id: "breakdown", label: "Breakdown" },
    { id: "comparison", label: "Comparison" },
    { id: "failure", label: "Failure anatomy" },
    { id: "conditions", label: "Conditions" },
    { id: "semantic", label: "Semantic retrieval" },
    { id: "llm", label: "LLM stack" },
    { id: "capability", label: "Capability" },
    { id: "integrity", label: "Integrity" },
    { id: "methodology", label: "Methodology" },
    { id: "reproducibility", label: "Reproducibility" },
  ] as const;

  return (
    <main className="relative min-h-screen bg-semantic-background">
      <div className="px-8 pt-14">
        <div className="mx-auto max-w-[1080px]">
          <BenchmarkHero run={run} />
        </div>
      </div>

      <div className="mt-6">
        <AnchorNav items={anchors} />
      </div>

      <div className="mx-auto max-w-[1080px] px-8 pb-24">
        <SectionShell index="01" id="result" eyebrow="Result" title="Primary measurement">
          <ConditionTrio run={run} />
        </SectionShell>

        <SectionShell index="02" id="breakdown" eyebrow="Breakdown" title="Condition metric table">
          <MetricBreakdown run={run} />
        </SectionShell>

        <SectionShell index="03" id="comparison" eyebrow="Run comparison" title="Intervention arms">
          <ComparisonSection run={run} />
        </SectionShell>

        <SectionShell index="04" id="failure" eyebrow="Failure anatomy" title="Where recovery is lost">
          <FailureAnatomy run={run} />
        </SectionShell>

        <SectionShell index="05" id="conditions" eyebrow="Condition explorer" title="Per-condition hole surface">
          <ConditionExplorer run={run} />
        </SectionShell>

        <SectionShell
          index="06"
          id="semantic"
          eyebrow="Semantic retrieval"
          title="Region/context expansion"
          right={<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-semantic-warning">not executed</span>}
        >
          <ExecutionToggle
            subsystem="semantic"
            rows={run.capabilities.filter((c) => c.id === "semantic-retrieval" || c.id === "claim-grounding")}
          />
        </SectionShell>

        <SectionShell
          index="07"
          id="llm"
          eyebrow="Language / AI stack"
          title="Analyst · validator · judge"
          right={<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-semantic-warning">not executed</span>}
        >
          <ExecutionToggle
            subsystem="llm"
            rows={run.capabilities.filter((c) => c.group === "Language / AI" && c.id !== "semantic-retrieval" && c.id !== "claim-grounding")}
          />
        </SectionShell>

        <SectionShell index="08" id="capability" eyebrow="Capability coverage" title="Implemented · wired · executed">
          <CapabilityTable run={run} />
        </SectionShell>

        <SectionShell index="09" id="integrity" eyebrow="Integrity" title="Provenance and validity">
          <Integrity run={run} />
        </SectionShell>

        <SectionShell index="10" id="methodology" eyebrow="Methodology" title="How the numbers were produced">
          <Methodology run={run} />
        </SectionShell>

        <SectionShell index="11" id="reproducibility" eyebrow="Reproducibility" title="Raw artifacts and actions">
          <Reproducibility run={run} />
        </SectionShell>

        <AvailableRunsNav run={run} />
      </div>
    </main>
  );
}