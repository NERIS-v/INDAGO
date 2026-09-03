"use client";

import { Badge } from "@/components/ui/badge";

export interface GapMock {
  id: string;
  holeType: "ISOLATED_NODE" | "MISSING_COMPARISON" | "INFRASTRUCTURE_GAP";
  missingRelationship: string;
  affectedEntities: string[];
  impact: "HIGH" | "MODERATE" | "LOW";
  status: "OPEN" | "EVIDENCE_REQUESTED" | "RESOLVED";
}

interface GapsListProps {
  gaps: GapMock[];
  onSelectGap: (id: string) => void;
  loading?: boolean;
}

const IMPACT_COLORS = {
  HIGH: "text-accent-rose",
  MODERATE: "text-accent-amber",
  LOW: "text-info",
};

const HOLE_TYPE_ICONS: Record<GapMock["holeType"], React.ReactNode> = {
  ISOLATED_NODE: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12h2 M3 12h2 M12 3v2 M12 19v2" strokeDasharray="2 2" className="opacity-50" />
    </svg>
  ),
  MISSING_COMPARISON: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="12" r="3" />
      <path d="M9 12h6" strokeDasharray="3 3" className="opacity-50 text-danger" />
    </svg>
  ),
  INFRASTRUCTURE_GAP: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 12h16" />
      <path d="M12 4v16" strokeDasharray="3 3" className="opacity-50 text-danger" />
    </svg>
  ),
};

export function GapsList({ gaps, onSelectGap, loading }: GapsListProps) {
  if (loading) {
    return (
      <div className="flex h-48 w-full flex-col items-center justify-center glass-panel rounded-xl">
        <div className="w-6 h-6 rounded-full border-2 border-surface-400 border-t-accent-amber animate-spin mb-3" />
        <span className="text-[10px] font-mono text-surface-500 uppercase tracking-widest animate-pulse">Scanning graph topology...</span>
      </div>
    );
  }

  if (!gaps.length) {
    return (
      <div className="flex h-48 w-full flex-col items-center justify-center glass-panel rounded-xl">
        <span className="text-[10px] font-mono text-surface-500 uppercase tracking-widest">
          No structural gaps or graph-holes detected.
        </span>
      </div>
    );
  }

  const openGaps = gaps.filter(g => g.status === "OPEN").length;

  return (
    <div className="flex flex-col gap-6">
      
      {/* HUD Telemetry Bar */}
      <div className="flex items-center justify-between px-2 pb-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xl font-light text-surface-900 tabular-nums">
            {gaps.length}
          </span>
          <span className="text-sm font-mono text-surface-700 uppercase tracking-widest">
            {gaps.length === 1 ? "STRUCTURAL HOLE" : "STRUCTURAL HOLES"}
          </span>
        </div>
        
        {openGaps > 0 && (
          <span className="text-[10px] font-mono uppercase tracking-widest text-warning flex items-center gap-1.5 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
            {openGaps} ACTIONABLE
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {gaps.map((gap, i) => {
          const isOpen = gap.status === "OPEN";
          const isResolved = gap.status === "RESOLVED";

          return (
            <button
              key={gap.id}
              onClick={() => onSelectGap(gap.id)}
              className={`glass-panel transition-all duration-300 rounded-xl overflow-hidden relative text-left group flex flex-col md:flex-row md:items-stretch ${
                isResolved ? "opacity-60 grayscale-[40%] bg-surface-50/20" : "hover:border-surface-400/50 shadow-lg glass-panel-hover"
              }`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {/* Left Edge Status Glow */}
              <div 
                className={`absolute left-0 top-0 bottom-0 w-1 ${
                  isOpen ? "bg-warning" : isResolved ? "bg-success" : "bg-info"
                }`}
                style={{ 
                  boxShadow: isOpen ? "0 0 12px var(--color-warning)" : "none" 
                }}
              />

              {/* Left Section: Meta & Title */}
              <div className="flex-1 flex flex-col gap-3 p-6 pl-8">
                <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest font-bold text-surface-700">
                  <div className={`flex items-center gap-1.5 ${isOpen ? "text-warning" : "text-surface-600"}`}>
                    {HOLE_TYPE_ICONS[gap.holeType]}
                    <span>{gap.holeType.replace(/_/g, " ")}</span>
                  </div>
                  <span className="text-surface-400">|</span>
                  <span className={IMPACT_COLORS[gap.impact]}>{gap.impact} IMPACT</span>
                </div>
                
                <h3 className={`font-sans text-lg font-medium leading-snug pr-4 ${isResolved ? "text-surface-600" : "text-surface-900"}`}>
                  {gap.missingRelationship}
                </h3>
              </div>

              {/* Right Section: Entities & Status */}
              <div className="flex flex-col justify-between gap-4 p-6 bg-surface-0/20 md:w-1/3 border-t md:border-t-0 md:border-l border-surface-200/50">
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-surface-500 font-bold">Affected Nodes:</span>
                  <div className="flex flex-col gap-1.5">
                    {gap.affectedEntities.map(entity => (
                      <span key={entity} className="text-xs font-mono text-surface-700 truncate flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-surface-500 shrink-0" />
                        {entity}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-auto pt-2">
                  <Badge 
                    variant={isOpen ? "warning" : isResolved ? "success" : "info"} 
                    dot={!isResolved}
                    className={`font-mono text-[9px] uppercase tracking-widest border border-current/30 ${
                      isOpen ? "bg-warning/10 text-surface-900" : isResolved ? "bg-success/10 text-surface-900" : "bg-info/10 text-surface-900"
                    }`}
                  >
                    {gap.status.replace(/_/g, " ")}
                  </Badge>

                  {!isResolved && (
                    <span className="text-[9px] font-mono text-surface-500 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      Inspect <span aria-hidden>→</span>
                    </span>
                  )}
                </div>
              </div>

            </button>
          );
        })}
      </div>
    </div>
  );
}