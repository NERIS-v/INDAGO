"use client";

// A thin glowing line that travels across the top of the shell when the 
// system is actively processing evidence or computing a graph update.

export function ProcessingFilament({ isProcessing }: { isProcessing: boolean }) {
  if (!isProcessing) return null;
  
  return (
    <div className="fixed left-0 right-0 top-0 z-50 h-[2px] overflow-hidden pointer-events-none">
      <div className="relative h-full w-1/3 animate-filament">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent-rose/40 to-accent-rose blur-[1px]" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent-rose/80 to-surface-0 shadow-[0_0_10px_var(--color-accent-rose)]" />
      </div>
    </div>
  );
}

// A calm, slow-spinning ring shown during SSE reconnects, preventing panic.

export function RecoveryRing({ isReconnecting }: { isReconnecting: boolean }) {
  if (!isReconnecting) return null;

  return (
    <div className="flex items-center gap-2.5 animate-fade-in bg-surface-50/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-warning/20 shadow-lg">
      <div className="relative flex items-center justify-center">
        {/* Soft glowing background behind the spinner */}
        <div className="absolute inset-0 bg-warning/20 blur-sm rounded-full animate-slow-pulse" />
        <svg className="w-3.5 h-3.5 animate-spin-slow text-warning relative z-10" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="16 16" strokeLinecap="round" />
        </svg>
      </div>
      <span className="text-[9px] font-mono uppercase tracking-widest text-warning/90 mt-px">Reconnecting</span>
    </div>
  );
}