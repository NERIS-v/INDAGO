interface ProvenanceChipProps {
  /** Source identifier / label shown in mono. */
  source: string;
  /** Optional secondary detail (e.g. a reference id). */
  detail?: string;
  className?: string;
}

/**
 * Compact mono chip for provenance / source references.
 * Technical, static, and subordinate to the statement it annotates.
 */
export function ProvenanceChip({
  source,
  detail,
  className = "",
}: ProvenanceChipProps) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border border-border-standard bg-surface-100 px-2 py-0.5 ${className}`}
    >
      <svg
        className="h-3 w-3 shrink-0 text-text-muted"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
        />
      </svg>
      <span className="truncate type-mono-small text-text-secondary">
        {source}
      </span>
      {detail && (
        <span className="shrink-0 type-mono-small text-text-muted">
          · {detail}
        </span>
      )}
    </span>
  );
}