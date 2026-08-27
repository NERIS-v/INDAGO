import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type Size = "sm" | "md" | "lg";

/**
 * Button hierarchy:
 *   primary   rare, strong, clear — the accent moment (dusty rose)
 *   secondary default operational action
 *   ghost     low emphasis
 *   danger    destructive / high-impact
 *   quiet     minimal, icon-friendly
 *
 * Hover is a subtle tonal movement — never scale, bounce, or glow.
 */
const variantStyles: Record<Variant, string> = {
  primary:
    "bg-accent-rose text-background-base border border-accent-rose hover:bg-accent-rose/90 hover:border-accent-rose active:bg-accent-rose/80",
  secondary:
    "bg-surface-100 text-text-secondary border border-border-standard hover:bg-surface-200 hover:border-border-emphasis hover:text-text-primary active:bg-surface-300",
  ghost:
    "text-text-secondary hover:bg-surface-100 hover:text-text-primary active:bg-surface-200",
  danger:
    "bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 hover:border-danger/30 active:bg-danger/30",
  quiet:
    "text-text-muted hover:bg-surface-100 hover:text-text-primary active:bg-surface-200",
};

const sizeStyles: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-md",
  md: "h-9 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-6 text-sm gap-2.5 rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      className = "",
      disabled,
      children,
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center font-medium transition-colors duration-fast ease-restrained disabled:opacity-40 disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {loading && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-current animate-breathe"
            aria-hidden="true"
          />
        )}
        {children}
      </button>
    );
  },
);