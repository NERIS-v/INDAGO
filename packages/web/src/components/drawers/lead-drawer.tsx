"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface LeadDrawerProps {
  leadId: string;
  onClose: () => void;
}

export function LeadDrawer({ onClose }: LeadDrawerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Mock data fetching based on leadId would happen here
  
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-surface-0/60 backdrop-blur-sm transition-opacity duration-slow ${mounted ? "opacity-100" : "opacity-0"}`} 
        onClick={onClose} 
      />
      
      {/* Drawer Surface */}
      <div 
        className={`relative flex w-full max-w-lg flex-col border-l border-surface-200/40 bg-surface-100 shadow-2xl transition-transform duration-normal ease-restrained ${mounted ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-surface-200/30 px-6 py-4">
          <Badge variant="muted">Investigative Lead</Badge>
          <Button variant="quiet" size="sm" onClick={onClose}>Close</Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* CLAIM */}
          <div className="p-6">
            <h2 className="text-lg font-medium text-surface-900 leading-snug">
              Victor Aldridge exercises covert ownership of Meridian Transit via intermediary accounts.
            </h2>
          </div>

          <div className="divide-y divide-surface-200/30 border-y border-surface-200/30">
            {/* CONFIDENCE */}
            <div className="flex flex-col gap-2 p-6">
              <span className="text-[11px] uppercase tracking-widest text-surface-500">Confidence Analysis</span>
              <div className="grid grid-cols-2 gap-4 font-mono text-sm text-surface-800">
                <div>
                  <div className="text-surface-500">Structural Signal</div>
                  <div className="text-brand-500">HIGH</div>
                </div>
                <div>
                  <div className="text-surface-500">Missingness Stability</div>
                  <div>87 / 100</div>
                </div>
              </div>
            </div>

            {/* FOR AND AGAINST (Equal Visual Weight) */}
            <div className="grid grid-cols-2 divide-x divide-surface-200/30 bg-surface-50">
              <div className="p-6">
                <span className="mb-3 block text-[11px] uppercase tracking-widest text-surface-500">Evidence For</span>
                <ul className="flex flex-col gap-3 text-sm text-surface-700">
                  <li className="flex gap-2">
                    <span className="text-brand-500">→</span>
                    4 communication observations
                  </li>
                  <li className="flex gap-2">
                    <span className="text-brand-500">→</span>
                    2 transaction observations
                  </li>
                </ul>
              </div>
              <div className="p-6">
                <span className="mb-3 block text-[11px] uppercase tracking-widest text-surface-500">Evidence Against</span>
                <ul className="flex flex-col gap-3 text-sm text-surface-700">
                  <li className="flex gap-2">
                    <span className="text-surface-400">→</span>
                    Conflicting location observation on 12-Apr
                  </li>
                </ul>
              </div>
            </div>

            {/* ALTERNATIVES */}
            <div className="p-6">
              <span className="mb-3 block text-[11px] uppercase tracking-widest text-surface-500">Alternative Explanations</span>
              <p className="text-sm text-surface-700">Legitimate shared intermediary handling standard logistics.</p>
            </div>

            {/* GAPS & NEXT BEST EVIDENCE */}
            <div className="bg-brand-500/5 p-6">
              <span className="mb-3 block text-[11px] uppercase tracking-widest text-brand-500/80">Identified Gap</span>
              <p className="mb-4 text-sm text-surface-800">Direct ownership of Account Y remains unresolved.</p>
              <Button className="w-full justify-center bg-surface-200 text-brand-500 hover:bg-surface-300">
                Request Account Y Ownership Record
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}