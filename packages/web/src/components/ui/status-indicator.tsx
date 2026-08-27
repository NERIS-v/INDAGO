import type { HTMLAttributes } from "react";

type StatusTone =
  | "idle"
  | "processing"
  | "success"
  | "warning"
  | "danger"
  | "info";

const toneStyles: Record<StatusTone, string> = {
  idle: "border border-text-muted bg-transparent",
  processing: "bg-accent-amber animate-breathe",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

interface StatusIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
  label?: string;
}

/**
 * A restrained status indicator: shape (dot) + text + color.
 * Never relies on color alone. Processing states breathe gently;
 * everything else is static.
 */
export function StatusIndicator({
  tone,
  label,
  className = "",
  ...props
}: StatusIndicatorProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      aria-label={label ?? tone}
      {...props}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${toneStyles[tone]}`}
        aria-hidden="true"
      />
      {label && (
        <span className="type-caption text-text-secondary">{label}</span>
      )}
    </span>
  );
}