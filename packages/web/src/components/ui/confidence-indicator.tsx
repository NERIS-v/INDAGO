interface ConfidenceIndicatorProps {
  /** Model confidence in the range [0, 1]. */
  value: number;
  /** Label shown above the value. Defaults to "Confidence". */
  label?: string;
  /** Renders a restrained, static support bar alongside the value. */
  showBar?: boolean;
  className?: string;
}

/**
 * Presents an analytical confidence value (0–1).
 *
 * Semantic rules:
 *  - NEVER label this as a probability.
 *  - Confidence is a model-output ranking signal, not a truth probability.
 *  - The value is static — it is an analytical value and must not be
 *    animated (no counting, no progress-style animation).
 */
export function ConfidenceIndicator({
  value,
  label = "Confidence",
  showBar = false,
  className = "",
}: ConfidenceIndicatorProps) {
  const clamped = Math.min(1, Math.max(0, value));
  const display = clamped.toFixed(2);
  const percent = Math.round(clamped * 100);

  return (
    <span
      className={`inline-flex items-center gap-2.5 ${className}`}
      role="img"
      aria-label={`${label}: ${display}, on a scale from zero to one; analytical confidence, not a probability`}
    >
      <span className="flex flex-col">
        <span className="type-label text-text-muted">{label}</span>
        <span className="type-mono text-text-secondary">{display}</span>
      </span>
      {showBar && (
        <span
          className="h-0.5 w-24 overflow-hidden rounded-full bg-surface-200"
          aria-hidden="true"
        >
          <span
            className="block h-full rounded-full bg-accent-rose/70"
            style={{ width: `${percent}%` }}
          />
        </span>
      )}
    </span>
  );
}