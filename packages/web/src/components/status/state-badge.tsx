"use client";

import { STATE_LABELS } from "@/lib/contracts/types";
import { Badge, type BadgeVariant } from "@/components/ui/badge";

interface StateBadgeProps {
  readonly state: string;
  readonly className?: string;
}

const TONE_MAP: Record<string, BadgeVariant> = {
  CREATED: "muted",
  INGESTING: "info",
  NORMALIZING: "warning",
  ANALYZING: "accent",
  DISCOVERING: "info",
  WAITING_FOR_EVIDENCE: "accent",
  REASSESSING: "warning",
  REVIEW_REQUIRED: "warning",
  COMPLETED: "success",
  FAILED: "danger",
  PAUSED: "muted",
};

// Only genuinely active pipeline stages "breathe". WAITING_FOR_EVIDENCE is a
// waiting/paused moment (it holds for input), not active processing — it is
// shown as a static accent state. CREATED is a queued/pending stage, also
// static.
const PROCESSING_STATES = new Set([
  "INGESTING",
  "NORMALIZING",
  "ANALYZING",
  "DISCOVERING",
  "REASSESSING",
]);

export function StateBadge({ state, className = "" }: StateBadgeProps) {
  const label = STATE_LABELS[state] ?? state;
  const variant = TONE_MAP[state] ?? "muted";
  const processing = PROCESSING_STATES.has(state);

  return (
    <Badge
      variant={variant}
      dot
      dotPulse={processing}
      className={className}
      data-testid="state-badge"
    >
      {label}
    </Badge>
  );
}