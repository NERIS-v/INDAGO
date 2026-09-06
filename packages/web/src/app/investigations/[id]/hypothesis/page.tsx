import { HypothesisWorkspace } from "@/components/intel/hypothesis-workspace";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function HypothesisPage({ params }: PageProps) {
  // In Next.js 15, params must be awaited
  await params;

  return (
    <div className="flex h-full w-full flex-col bg-semantic-background">
      <div className="px-10 pt-10 pb-4">
        <div className="mx-auto max-w-[1080px]">
          <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            <span>Intelligence</span>
            <span className="h-px w-12 bg-semantic-border-subtle" aria-hidden="true" />
            <span>Reasoning</span>
          </div>
          <h1 className="mt-4 font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
            Hypothesis
          </h1>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
            Investigator reasoning surfaced as testable hypotheses derived from the
            observations and structure of this investigation.
          </p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <HypothesisWorkspace />
      </div>
    </div>
  );
}