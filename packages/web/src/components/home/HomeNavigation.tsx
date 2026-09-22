// ============================================================================
// INDAGO Home — fixed navigation. Overlays the cinematic stage; the brand is
// the closable door home (the value prop is the CTA, so both links point at
// the workspace). Safe-area insets keep the bar clear of device encodings.
// ============================================================================

import Link from "next/link";

export function HomeNavigation() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between py-5 pl-[max(env(safe-area-inset-left),1.5rem)] pr-[max(env(safe-area-inset-right),1.5rem)] pt-[max(env(safe-area-inset-top),1.25rem)] sm:pl-[max(env(safe-area-inset-left),2.5rem)] sm:pr-[max(env(safe-area-inset-right),2.5rem)]">
      <Link
        href="/dashboard"
        className="font-cormorant text-xl font-semibold tracking-[0.14em] text-surface-800 transition-colors hover:text-surface-900"
        aria-label="INDAGO — open the workspace"
      >
        INDAGO
      </Link>
      <Link
        href="/dashboard"
        className="text-[0.78rem] font-medium tracking-[0.04em] text-surface-400 transition-colors hover:text-surface-700"
      >
        Enter the workspace
      </Link>
    </header>
  );
}