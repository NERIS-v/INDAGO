"use client";

// ============================================================================
// F-PR14 — shared design system: StatChip
//
// The canonical telemetry/summary stat (label + value in mono type). Replaces
// ad-hoc inline stat rows across the workspace so every representation shares
// one deterministic visual grammar. Pure label/value (never a verdict).
// ============================================================================

/** F-PR14 shared `StatChip` — a label/value stat in the workstation mono
 *  grammar. `caption` is optional provenance/sense text. */
export function StatChip({
  label,
  value,
  caption,
  accent = "text-surface-900",
}: {
  readonly label: string;
  readonly value: number | string;
  readonly caption?: string;
  /** Tailwind accent for the value (e.g. `text-accent-rose`, default dark). */
  readonly accent?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center leading-none">
      <span className="text-[8px] font-mono text-surface-500 uppercase tracking-widest mb-1">
        {label}
      </span>
      <span className={`font-mono text-[11px] font-bold ${accent}`}>{value}</span>
      {caption && (
        <span className="text-[8px] font-mono text-surface-400 uppercase tracking-widest mt-0.5">
          {caption}
        </span>
      )}
    </div>
  );
}