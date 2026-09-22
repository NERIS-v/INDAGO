"use client";

import Link from "next/link";

const METRICS = [
  {
    label: "Missingness stability",
    value: "87 / 100",
    note: "Lead conclusions survive 87% of structured perturbation tests (random edge dropping and entity obfuscation).",
  },
  {
    label: "Resolution precision",
    value: "93.4%",
    note: "Confidence in identity deduplication. Measured across all 6 blocking passes to prevent false splits or false merges.",
  },
  {
    label: "Coverage",
    value: "81.0%",
    note: "Representation of expected observation space based on known metadata templates and entity types.",
  },
];

const GUARDRAILS = [
  {
    title: "Concealment patterns",
    body: "Absence of an edge is never processed as definitive evidence of criminal intent. Detected sparsification is treated as a hypothesis subject to testing and counter-evidence.",
  },
  {
    title: "Role reversibility",
    body: "Graph structural importance is isolated from investigative relevance. The system maintains role assignments (e.g., suspect, facilitator) as fully reversible hypotheses.",
  },
];

export default function RobustnessPage() {
  return (
    <div className="relative min-h-full px-10 py-10 animate-fade-in bg-semantic-background">
      <div className="mx-auto max-w-[1080px]">
        <header className="border-b border-semantic-border-subtle pb-8">
          <div className="flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
            <span>Assurance</span>
            <span className="h-px w-12 bg-semantic-border-subtle" aria-hidden="true" />
            <span>System audits</span>
          </div>
          <h1 className="mt-4 font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
            Trust &amp; robustness
          </h1>
          <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
            The reliability of the analytical position, expressed through stability
            metrics and the guardrails governing how the system reasons.
          </p>
        </header>

        <section className="pt-10">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
              Stability metrics
            </span>
            <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
          </div>
          <div className="mt-5 grid gap-px border border-semantic-border-subtle bg-semantic-border-subtle rounded-lg overflow-hidden sm:grid-cols-3">
            {METRICS.map((metric) => (
              <div key={metric.label} className="bg-semantic-surface px-6 py-5">
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
                  {metric.label}
                </span>
                <p className="mt-2 font-mono text-3xl font-extralight tracking-wide text-semantic-foreground">
                  {metric.value}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-semantic-foreground-muted">
                  {metric.note}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="pt-10 pb-6">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint">
              Methodology &amp; guardrails
            </span>
            <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
          </div>
          <div className="mt-5 divide-y divide-semantic-border-subtle">
            {GUARDRAILS.map((item) => (
              <div key={item.title} className="py-5">
                <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
                  {item.title}
                </h3>
                <p className="mt-2 max-w-[70ch] text-[0.9375rem] leading-relaxed text-semantic-foreground-muted">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-10 border-t border-semantic-border-subtle pt-6">
          <Link
            href="/benchmarks"
            className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint transition-colors duration-normal ease-restrained hover:text-semantic-foreground"
          >
            System benchmark · view controlled evaluation →
          </Link>
        </div>
      </div>
    </div>
  );
}