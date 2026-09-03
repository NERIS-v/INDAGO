"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface GapDrawerProps {
  gapId: string;
  onClose: () => void;
}

export function GapDrawer({ onClose }: GapDrawerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-500 ease-out ${mounted ? "opacity-100" : "opacity-0"}`} 
        onClick={onClose} 
      />
      
      {/* The Drawer Panel */}
      <div 
        className={`relative flex w-full max-w-xl flex-col border-l border-surface-300/50 glass-panel !rounded-none shadow-2xl transition-transform duration-500 ease-out ${mounted ? "translate-x-0" : "translate-x-full"}`}
      >
        
        {/* TACTICAL HEADER */}
        <div className="flex items-center justify-between border-b border-surface-200/50 bg-surface-50/80 backdrop-blur-md px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-6 h-6 rounded bg-warning/10 border border-warning/30">
              <span className="w-2 h-2 rounded-full bg-warning animate-pulse shadow-[0_0_8px_var(--color-warning)]" />
            </div>
            <span className="font-mono text-[11px] text-surface-900 uppercase tracking-widest font-bold">
              Vulnerability Details
            </span>
          </div>
          <button 
            type="button"
            className="flex items-center gap-2 text-[10px] font-mono text-surface-500 hover:text-surface-900 transition-colors uppercase tracking-widest focus-visible:outline-none"
            onClick={onClose}
          >
            <span>Close</span>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          
          <div className="bg-surface-0/60 shadow-[inset_0_4px_20px_rgba(0,0,0,0.6)] border-b border-black/60 p-8 relative overflow-hidden">
            {/* Background Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:16px_16px] pointer-events-none" />
            
            <div className="relative z-10">
              <span className="mb-3 inline-block rounded bg-warning/10 border border-warning/30 px-2 py-1 text-[9px] font-mono uppercase tracking-widest text-warning font-bold">
                Topology Error: Isolated Node
              </span>
              <h2 className="text-xl font-light text-surface-900 leading-relaxed tracking-tight">
                Meridian Transit Pvt Ltd has no resolved ownership record — beneficial owner unconfirmed.
              </h2>
            </div>
          </div>

          <div className="p-8 space-y-10 flex-1 bg-surface-50/20">
            
            {/* PRIMARY DIAGNOSIS */}
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-surface-700 font-bold border-b border-surface-200/50 pb-2">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                Primary Diagnosis
              </h3>
              <p className="text-sm text-surface-700 leading-relaxed font-sans">
                Corporate registry data for the Panama jurisdiction was not included in the initial evidence ingestion payload, leaving this node structurally disconnected from potential parent companies.
              </p>
            </div>

            {/* ALTERNATIVE HYPOTHESES */}
            <div className="space-y-4">
              <h3 className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-surface-700 font-bold border-b border-surface-200/50 pb-2">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M9 12l2 2 4-4"/></svg>
                Alternative Hypotheses
              </h3>
              <ul className="flex flex-col gap-3">
                <li className="flex gap-3 items-start bg-surface-100/50 border border-surface-200/50 p-3 rounded-lg">
                  <span className="text-surface-400 mt-0.5">↳</span>
                  <p className="text-sm text-surface-700 leading-relaxed">
                    Entity uses nominee directors to mask ultimate beneficial ownership (Concealment-consistent pattern).
                  </p>
                </li>
                <li className="flex gap-3 items-start bg-surface-100/50 border border-surface-200/50 p-3 rounded-lg">
                  <span className="text-surface-400 mt-0.5">↳</span>
                  <p className="text-sm text-surface-700 leading-relaxed">
                    Identity resolution failed to merge a known owner due to transliteration differences in localized records.
                  </p>
                </li>
              </ul>
            </div>
          </div>

          {/* ACTION FOOTER: Resolution Evidence */}
          <div className="bg-surface-100/80 border-t border-surface-200/60 p-6 backdrop-blur-xl">
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-accent-blue font-bold mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />
              Target Resolution Vector
            </h3>
            
            <div className="flex flex-col gap-4 glass-panel border border-surface-300 p-5 rounded-xl shadow-lg bg-surface-50/50">
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <div className="font-mono text-[10px] text-surface-500 uppercase tracking-widest">Document Type</div>
                  <div className="font-sans text-base font-medium text-surface-900">ROC / MCA Corporate Filing</div>
                </div>
                <Badge variant="info" className="bg-accent-blue/10 text-accent-blue border-accent-blue/30 font-mono text-[9px] uppercase tracking-widest">
                  Gain Ratio: 0.85
                </Badge>
              </div>
              
              <Button 
                className="w-full justify-center bg-accent-blue text-surface-0 hover:bg-accent-blue/80 font-mono text-[10px] uppercase tracking-widest h-10 shadow-[0_0_15px_var(--color-accent-blue-subtle)] transition-all"
              >
                Draft Evidence Request
              </Button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}