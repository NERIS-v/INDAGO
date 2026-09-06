"use client";

// ============================================================================
// F-PR14 — shared design system: SectionHeading
//
// The canonical editorial section header: mono overline + title + an optional
// trailing action/status slot. One grammar for every workshop surface
// (graph, matrix, flow, pulse, ledger, review) instead of ad-hoc h2/p/h3.
// ============================================================================

import type { ReactNode } from "react";

/** F-PR14 shared `SectionHeading` — overline + title + optional right slot.
 *  `id` wires `aria-labelledby` when a section uses it. */
export function SectionHeading({
  overline,
  title,
  action,
  id,
}: {
  readonly overline: string;
  readonly title: string;
  readonly action?: ReactNode;
  readonly id?: string;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-surface-500">
          {overline}
        </span>
        <h3
          id={id}
          className="truncate font-mono text-[11px] font-bold uppercase tracking-widest text-surface-800"
        >
          {title}
        </h3>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}