"use client";

// ============================================================================
// PR-2 PanelToggle — the single shared affordance for side-panel collapse and
// reopen.
//
//   Expanded panels render a compact collapse button inside their headers.
//   Collapsed panels render a narrow vertical strip (the only thing occupying
//   the reclaimed column) with a reopen button. Both states stay keyboard
//   reachable and expose their state via aria-expanded / aria-controls.
// ============================================================================

import type { Ref } from "react";

interface PanelToggleProps {
  open: boolean;
  onToggle: () => void;
  /** Human-readable panel name used in the accessible name. */
  label: string;
  /** Expanded label prefix for the collapse action. */
  expandedActionLabel: string;
  /** Id of the panel region this toggle controls. */
  controlsId: string;
  side: "left" | "right";
  /** Forwarded to the underlying button (used to move focus after collapse). */
  ref?: Ref<HTMLButtonElement>;
}

export function PanelToggle({
  open,
  onToggle,
  label,
  expandedActionLabel,
  controlsId,
  side,
  ref,
}: PanelToggleProps) {
  if (!open) {
    const glyph = side === "left" ? "›" : "‹";
    return (
      <button
        ref={ref}
        type="button"
        onClick={onToggle}
        aria-expanded="false"
        aria-controls={controlsId}
        aria-label={label}
        title={`Open ${label}`}
        className="flex h-full w-full items-center justify-center text-semantic-foreground-faint transition-colors hover:bg-semantic-surface-elevated hover:text-semantic-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus"
      >
        <span aria-hidden className="text-sm">{glyph}</span>
      </button>
    );
  }

  const glyph = side === "left" ? "‹" : "›";
  return (
    <button
      ref={ref}
      type="button"
      onClick={onToggle}
      aria-expanded="true"
      aria-controls={controlsId}
      aria-label={expandedActionLabel}
      title={expandedActionLabel}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-semantic-foreground-faint transition-colors hover:bg-semantic-surface-elevated hover:text-semantic-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-semantic-focus"
    >
      <span aria-hidden className="text-xs">{glyph}</span>
    </button>
  );
}