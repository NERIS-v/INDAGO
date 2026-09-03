"use client";

import { CrossCaseSignals } from "@/components/intel/cross-case-signals";
import { Badge } from "@/components/ui/badge";

export default function CrossCasePage() {
  return (
    <div className="relative mx-auto max-w-6xl space-y-8 p-8 animate-fade-in">
      
      {/* TACTICAL PAGE HEADER */}
      <header className="space-y-4 border-b border-surface-200/50 pb-6">
        <div className="flex flex-col gap-1">
          {/* Eyebrow Label */}
          <span className="type-mono-small text-accent-blue font-bold uppercase tracking-widest">
            System Module // Boundary Analysis
          </span>
          
          {/* Main Title & Status */}
          <div className="flex items-center gap-4 mt-1">
            <h1 className="text-3xl font-light text-surface-900 tracking-tight">
              Cross-Case Signals
            </h1>
            <Badge variant="info" dot className="bg-info/10 border-info/30 backdrop-blur-md">
              Global Scan Active
            </Badge>
          </div>
        </div>
        
        {/* Module Description */}
        <p className="text-sm text-surface-700 max-w-3xl leading-relaxed font-sans">
          INDAGO autonomously correlates entities, communication channels, and financial infrastructure in this investigation against the global case registry. Candidates below represent potential overlaps with isolated operations.
        </p>
      </header>

      {/* MAIN MODULE MOUNT */}
      <div className="w-full">
        <CrossCaseSignals />
      </div>
      
    </div>
  );
}