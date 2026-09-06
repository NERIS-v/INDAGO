"use client";

// ============================================================================
// PR-8 — Deep-Dive Bridges
//
// Renders the composed deep-link list for a resolved relation/entity context.
// Available bridges are REAL anchors built by deep-dive-links.ts (always
// preserve ?caseId=, never `href="#"`). Unavailable bridges (the underlying
// data slice is null in this mode) render as an honest greyed note — the link
// is never faked into a dead end.
// ============================================================================

import type { DeepDiveLink } from "@/lib/context/deep-dive-links";

interface DeepDiveBridgesProps {
  readonly links: readonly DeepDiveLink[];
}

export function DeepDiveBridges({ links }: DeepDiveBridgesProps) {
  const available = links.filter((l) => l.available);
  const unavailable = links.filter((l) => !l.available);

  return (
    <section
      data-testid="deep-dive-bridges"
      className="flex flex-col gap-2"
      aria-label="Deep-dive surfaces for this object"
    >
      <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
        Deep-dive
      </span>

      {available.length === 0 && (
        <p className="type-caption" data-testid="deep-dive-bridges-empty">
          No deep-dive surfaces are available for this object.
        </p>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        {available.map((link) => (
          <a
            key={link.id}
            href={link.href}
            data-testid={`deep-dive-link-${link.id}`}
            data-link-available="true"
            className="group rounded-md border border-transparent px-2 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus hover:border-semantic-border hover:bg-semantic-surface-elevated"
          >
            <span className="block text-[11px] font-medium uppercase tracking-wider text-semantic-foreground group-hover:text-semantic-selection">
              {link.label}
            </span>
            <span className="block truncate text-[10px] font-mono uppercase tracking-widest text-semantic-foreground-faint">
              {link.hint}
            </span>
          </a>
        ))}
        {unavailable.map((link) => (
          <div
            key={link.id}
            data-testid={`deep-dive-link-${link.id}`}
            data-link-available="false"
            title={link.note ?? "Unavailable in this data mode"}
            className="rounded-md border border-dashed border-semantic-border px-2 py-1.5 opacity-60"
          >
            <span className="block text-[11px] font-medium uppercase tracking-wider text-semantic-foreground-faint">
              {link.label}
            </span>
            <span className="block truncate text-[10px] font-mono uppercase tracking-widest text-semantic-foreground-faint">
              {link.note ?? link.hint}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}