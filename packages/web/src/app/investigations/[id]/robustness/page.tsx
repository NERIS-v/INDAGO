"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default function RobustnessPage() {
  return (
    <div className="space-y-6 p-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="type-title text-surface-900">Trust & Robustness</h1>
        <Badge variant="muted">System Audits</Badge>
        <Badge variant="success" dot>Stable</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1 */}
        <Card className="border-surface-200/60 bg-surface-50 p-6">
          <div className="mb-2 text-[11px] font-mono uppercase tracking-widest text-surface-500">
            Missingness Stability
          </div>
          <div className="text-3xl font-mono text-surface-900">87 / 100</div>
          <p className="mt-3 text-xs text-surface-600">
            Lead conclusions survive 87% of structured perturbation tests (random edge dropping and entity obfuscation).
          </p>
        </Card>

        {/* Metric 2 */}
        <Card className="border-surface-200/60 bg-surface-50 p-6">
          <div className="mb-2 text-[11px] font-mono uppercase tracking-widest text-surface-500">
            Resolution Precision
          </div>
          <div className="text-3xl font-mono text-surface-900">93.4%</div>
          <p className="mt-3 text-xs text-surface-600">
            Confidence in identity deduplication. Measured across all 6 blocking passes to prevent false splits or false merges.
          </p>
        </Card>

        {/* Metric 3 */}
        <Card className="border-surface-200/60 bg-surface-50 p-6">
          <div className="mb-2 text-[11px] font-mono uppercase tracking-widest text-surface-500">
            Coverage
          </div>
          <div className="text-3xl font-mono text-surface-900">81.0%</div>
          <p className="mt-3 text-xs text-surface-600">
            Representation of expected observation space based on known metadata templates and entity types.
          </p>
        </Card>
      </div>

      <Card className="mt-6 border-surface-200/60 bg-surface-0">
        <div className="border-b border-surface-200/40 px-6 py-4">
          <h2 className="text-sm font-medium text-surface-800">Methodology & Guardrails</h2>
        </div>
        <div className="divide-y divide-surface-200/30 p-6">
          <div className="py-4 first:pt-0 last:pb-0">
            <h3 className="mb-2 text-xs font-mono uppercase tracking-widest text-surface-500">Concealment Patterns</h3>
            <p className="text-sm leading-relaxed text-surface-700">
              Absence of an edge is never processed as definitive evidence of criminal intent. Detected sparsification is treated as a hypothesis subject to testing and counter-evidence.
            </p>
          </div>
          <div className="py-4 first:pt-0 last:pb-0">
            <h3 className="mb-2 text-xs font-mono uppercase tracking-widest text-surface-500">Role Reversibility</h3>
            <p className="text-sm leading-relaxed text-surface-700">
              Graph structural importance is isolated from investigative relevance. The system maintains role assignments (e.g., suspect, facilitator) as fully reversible hypotheses.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}