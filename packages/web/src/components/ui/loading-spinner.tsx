interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

const dotSizeMap = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
  lg: "h-2.5 w-2.5",
};

/**
 * INDAGO activity indicator — three gently breathing dots.
 * Replaces the generic spinning wheel as the default loading language.
 */
export function LoadingSpinner({
  size = "md",
  label,
  className = "",
}: LoadingSpinnerProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="flex items-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`${dotSizeMap[size]} rounded-full bg-current animate-breathe`}
            style={{ animationDelay: `${i * 180}ms` }}
          />
        ))}
      </span>
      {label && <span className="type-caption text-text-muted">{label}</span>}
    </span>
  );
}