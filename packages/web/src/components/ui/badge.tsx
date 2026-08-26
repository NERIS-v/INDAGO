type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "muted";

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-surface-100 text-surface-600 border border-surface-200/60",
  success: "bg-success/10 text-success/90 border border-success/20",
  warning: "bg-warning/10 text-warning/90 border border-warning/20",
  danger: "bg-danger/10 text-danger/90 border border-danger/20",
  info: "bg-info/10 text-info/90 border border-info/20",
  muted: "bg-surface-100 text-surface-500 border border-surface-200/40",
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide uppercase ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
