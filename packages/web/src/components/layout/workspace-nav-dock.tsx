// ============================================================================
// PR-1 Workspace Navigation Dock
//
// Rendered within the investigation workspace shell (replaces the previous
// horizontal nav bar). Shows a detached horizontal navigation dock floating
// above the workspace: Brand, the full workspace destination set, a compact
// investigation context block (title / status / graph version, resolved
// through the provider seam — omitted silently when unavailable, e.g. live has
// no graph version endpoint), and the data-mode indicator.
//
// Consumes only the WorkspaceProviders bundle via useWorkspace — never imports
// Demo/Live and never branches on user-visible logic beyond active-route state.
// ============================================================================

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { investigationUrl } from "@/lib/workspace/url";
import {
  WORKSPACE_NAV,
  isNavEntryActive,
} from "@/lib/workspace/nav";
import type { Investigation } from "@indago/contracts";

export function WorkspaceNavDock() {
  const pathname = usePathname();
  const workspace = useWorkspace();

  const investigationId = workspace.investigationId;

  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [graphVersion, setGraphVersion] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    workspace.investigations
      .get(investigationId)
      .then((it) => {
        if (isMounted) setInvestigation(it);
      })
      .catch(() => {
        if (isMounted) setInvestigation(null);
      });
    workspace.graph
      .getVersion(investigationId)
      .then((v) => {
        if (isMounted) setGraphVersion(typeof v.versionNumber === "number" ? `v${v.versionNumber}` : null);
      })
      .catch(() => {
        if (isMounted) setGraphVersion(null);
      });
    return () => {
      isMounted = false;
    };
  }, [workspace, investigationId]);

  const modeLabel = workspace.mode === "demo" ? "Demo" : "Live";
  const modeDot = workspace.mode === "demo" ? "bg-brand-500" : "bg-success";

  return (
    <div className="px-6 pt-4">
      <nav
        aria-label="Investigation workspace"
        className="relative mx-auto flex max-w-fit flex-wrap items-center gap-1 rounded-xl border border-surface-200/60 bg-surface-50/80 px-3 py-2 shadow-xl backdrop-blur-xl"
      >
        <Link
          href="/"
          className="mr-2 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-normal ease-restrained focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="INDAGO Dashboard"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md border border-brand-500/20 bg-brand-500/15">
            <svg className="h-3 w-3 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </span>
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-surface-600">INDAGO</span>
        </Link>

        <span className="h-5 w-px bg-surface-300/70" aria-hidden />

        {WORKSPACE_NAV.map((entry) => {
          const href =
            entry.href === "/"
              ? "/"
              : investigationUrl(investigationId, workspace.caseId, entry.href || undefined);
          const isActive = isNavEntryActive(entry, pathname);
          return (
            <Link
              key={entry.label}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`rounded-md px-2.5 py-1.5 text-[13px] transition-colors duration-normal ease-restrained focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                isActive
                  ? "bg-brand-500/10 text-brand-500"
                  : "text-surface-500 hover:bg-surface-100 hover:text-surface-700"
              }`}
            >
              {entry.label}
            </Link>
          );
        })}

        <span className="h-5 w-px bg-surface-300/70" aria-hidden />

        <div className="flex items-center gap-2">
          {investigation && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-100 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-surface-500" title={investigation.title}>
              <span className="max-w-40 truncate">{investigation.title}</span>
              {investigation.status && (
                <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-success" aria-label={`Status ${investigation.status}`} />
              )}
            </span>
          )}
          {graphVersion && (
            <span className="rounded-full border border-border-subtle bg-surface-100 px-2.5 py-1 text-[10px] font-mono font-medium uppercase tracking-widest text-surface-500">
              {graphVersion}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-100 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-surface-500">
            <span className={`h-1.5 w-1.5 rounded-full ${modeDot}`} />
            {modeLabel}
          </span>
        </div>
      </nav>
    </div>
  );
}