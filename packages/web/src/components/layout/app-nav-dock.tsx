// ============================================================================
// PR-1 App-Level Navigation Dock
//
// Rendered at the application root (replaces the fixed left sidebar). Shows
// Brand + the app-level landing destination (Dashboard) as a detached
// horizontal dock. Hides itself on the cinematic Home route (which owns the
// root path with no chrome) and inside investigation workspace routes, where
// the WorkspaceNavDock (rendered by the workspace shell) takes over.
//
// "New Investigation" is intentionally NOT a primary dock destination; it
// remains reachable from the Dashboard page.
// ============================================================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isBenchmarkPathname,
  isHomePathname,
  isInvestigationWorkspacePathname,
} from "@/lib/workspace/nav";

export function AppNavDock() {
  const pathname = usePathname() ?? "/";

  if (isHomePathname(pathname)) return null;
  if (isInvestigationWorkspacePathname(pathname)) return null;

  const isDashboard = pathname === "/dashboard";
  const isBenchmark = isBenchmarkPathname(pathname);

  return (
    <div className={`px-6 pt-4 ${isDashboard ? "bg-semantic-surface" : ""}`}>
      <nav
        aria-label="Primary"
        className="cc-panel-floating relative mx-auto flex max-w-fit items-center gap-1 px-3 py-2"
      >
        <Link
          href="/"
          className="mr-2 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-normal ease-restrained focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus"
          aria-label="INDAGO Home"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md border border-brand-500/20 bg-brand-500/15">
            <svg className="h-3 w-3 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </span>
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-semantic-foreground-faint">INDAGO</span>
        </Link>

        <span className="h-5 w-px bg-semantic-border" aria-hidden />

        <Link
          href="/dashboard"
          aria-current={isDashboard ? "page" : undefined}
          className={`rounded-md px-2.5 py-1.5 text-[13px] transition-colors duration-normal ease-restrained focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus ${
            isDashboard
              ? "bg-semantic-surface-soft text-semantic-selection"
              : "text-semantic-foreground-muted hover:bg-semantic-surface-elevated hover:text-semantic-foreground"
          }`}
        >
          Dashboard
        </Link>

        <Link
          href="/benchmarks"
          aria-current={isBenchmark ? "page" : undefined}
          className={`rounded-md px-2.5 py-1.5 text-[13px] transition-colors duration-normal ease-restrained focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus ${
            isBenchmark
              ? "bg-semantic-surface-soft text-semantic-selection"
              : "text-semantic-foreground-muted hover:bg-semantic-surface-elevated hover:text-semantic-foreground"
          }`}
        >
          System benchmark
        </Link>
      </nav>
    </div>
  );
}