"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { HypothesisEngine } from "./hypothesis-engine";
import { ReverseHypothesisEngine } from "./reverse-hypothesis-engine";

type Mode = "generated" | "reverse";

const MODES: readonly { value: Mode; label: string }[] = [
  { value: "generated", label: "Hypothesis generation" },
  { value: "reverse", label: "Reverse hypothesis" },
];

export function HypothesisWorkspace() {
  const workspace = useWorkspace();
  const [mode, setMode] = useState<Mode>("generated");

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
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
        <HypothesisEngine investigationId={workspace.investigationId} />
      ) : (
        <ReverseHypothesisEngine />
      )}
    </div>
  );
}