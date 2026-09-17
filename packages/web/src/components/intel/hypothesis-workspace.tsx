"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { HypothesisEngine } from "./hypothesis-engine";
import { ReverseHypothesisEngine } from "./reverse-hypothesis-engine";
import { Phase2HypothesisSurface } from "./phase2-hypothesis-surface";
import { LiveHypothesisWorkspace } from "./live-hypothesis-workspace";

type Mode = "generated" | "reverse";

const MODES: readonly { value: Mode; label: string }[] = [
  { value: "generated", label: "Hypothesis generation" },
  { value: "reverse", label: "Reverse hypothesis" },
];

export function HypothesisWorkspace() {
  const workspace = useWorkspace();
  const [mode, setMode] = useState<Mode>("generated");

  // PASS 4 — the real Case-B workspace genuinely carries the derived Phase-2
  // seams, so the "generated" tab projects the real H1/H2/H3 motion reading
  // instead of the generic OFS pipeline. OFS and live workspaces keep the
  // existing experience unchanged (no fabricated phase-2).
  const isRealCasePhase2 =
    workspace.mode === "demo" && Boolean(workspace.phase2AssessmentFreeze);

  // PR-21 — honest LIVE seam: a live workspace renders the honest LIVE
  // hypothesis surface (platform-data projections through the entity/relation
  // provider seams) and is NEVER offered the reverse/fabricated surface. The
  // reverse engine stays demo/OFS-only; live never renders it at any mode.
  if (workspace.mode === "live") {
    return <LiveHypothesisWorkspace />;
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex w-full justify-center">
        <div
          role="tablist"
          aria-label="Hypothesis modes"
          className="inline-flex items-center gap-1 rounded-lg border border-surface-200 bg-surface-0 p-1"
        >
          {MODES.map((m) => (
            <button
              key={m.value}
              role="tab"
              type="button"
              aria-selected={mode === m.value}
              data-testid={`hypothesis-mode-${m.value}`}
              onClick={() => setMode(m.value)}
              className={`rounded px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors ${
                mode === m.value
                  ? "bg-surface-800 text-surface-0"
                  : "text-surface-500 hover:bg-surface-100"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "generated" ? (
        isRealCasePhase2 ? (
          <Phase2HypothesisSurface onRequestChallenge={() => setMode("reverse")} />
        ) : (
          <HypothesisEngine investigationId={workspace.investigationId} />
        )
      ) : (
        <ReverseHypothesisEngine />
      )}
    </div>
  );
}