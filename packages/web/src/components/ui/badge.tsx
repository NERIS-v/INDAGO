import type { HTMLAttributes } from "react";

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted"
  | "accent";

const variantStyles: Record<BadgeVariant, string> = {
  default:
    "bg-surface-100 text-text-secondary border border-border-standard",
  success: "bg-success/10 text-success border border-success/20",
  warning: "bg-warning/10 text-warning border border-warning/20",
  danger: "bg-danger/10 text-danger border border-danger/20",
  info: "bg-info/10 text-info border border-info/20",
  muted: "bg-surface-100 text-text-muted border border-border-subtle",
  accent:
    "bg-accent-rose/10 text-accent-rose border border-accent-rose/20",
};

const dotStyles: Record<BadgeVariant, string> = {
  default: "bg-text-secondary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  muted: "bg-text-muted",
  accent: "bg-accent-rose",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Leading status dot — status is conveyed by shape + text + color,
   *  never color alone. */
  dot?: boolean;
  /** Breathing dot for active/processing states. Only meaningful with `dot`. */
  dotPulse?: boolean;
}

export function Badge({
  variant = "default",
  dot = false,
  dotPulse = false,
  children,
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide uppercase ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`mr-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotStyles[variant]} ${
            dotPulse ? "animate-breathe" : ""
          }`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}