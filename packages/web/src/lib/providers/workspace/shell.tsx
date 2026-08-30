// ============================================================================
// F-PR2 Workspace Shell / Navigation
//
// Rendered within the investigation workspace layout. Shows a navigation bar
// for the workspace's views (Graph / Timeline / Observations / Leads / Gaps /
// Evidence / Cross-Case / Ledger / Robustness / Review) plus a data-mode
// indicator. Consumes only the WorkspaceProviders bundle via useWorkspace —
// never imports Demo/Live and never branches on user-visible logic.
// ============================================================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspace } from "./context";
import { investigationUrl } from "@/lib/workspace/url";

interface NavEntry {
  readonly label: string;
  readonly href: string;
  /** Set true for scaffolded views rendered on the same route. */
  readonly scaffolded?: boolean;
}

const NAV: NavEntry[] = [
  { label: "Overview", href: "" },
  { label: "Graph", href: "graph" },
  { label: "Timeline", href: "timeline" },
  { label: "Observations", href: "observations" },
  { label: "Leads", href: "leads" },
  { label: "Gaps", href: "gaps" },
  { label: "Evidence", href: "evidence" },
  { label: "Cross-Case", href: "cross-case", scaffolded: true },
  { label: "Ledger", href: "ledger", scaffolded: true },
  { label: "Robustness", href: "robustness", scaffolded: true },
  { label: "Review", href: "review", scaffolded: true },
];

export function WorkspaceShell({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const pathname = usePathname();
  const workspace = useWorkspace();

  // Paths are like /investigations/:id or /investigations/:id/graph
  const segments = pathname.split("/").filter(Boolean);
  const investigationId = segments[1] ?? "";
  const current = segments[2] ?? "";

  const modeLabel = workspace.mode === "demo" ? "Demo" : "Live";
  const modeDot =
    workspace.mode === "demo" ? "bg-brand-500" : "bg-success";

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="border-b border-surface-200/40 bg-surface-50/60 px-6">
        <div className="flex flex-wrap items-center gap-1 py-3">
          {NAV.map((entry) => {
            // Always preserve the case boundary in the URL.
            const href = investigationUrl(
              investigationId,
              workspace.caseId,
              entry.href || undefined,
            );
            const isActive = entry.href === current;
            return (
              <Link
                key={entry.label}
                href={href}
                className={`rounded-md px-2.5 py-1.5 text-[13px] transition-colors duration-normal ease-restrained ${
                  isActive
                    ? "bg-brand-500/10 text-brand-500"
                    : "text-surface-500 hover:bg-surface-100 hover:text-surface-700"
                }`}
              >
                {entry.label}
              </Link>
            );
          })}
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-100 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-surface-500">
            <span className={`h-1.5 w-1.5 rounded-full ${modeDot}`} />
            {modeLabel}
          </span>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}
