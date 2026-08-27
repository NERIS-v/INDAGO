import { Button } from "@/components/ui/button";

interface ErrorDisplayProps {
  title?: string;
  message: string;
  retry?: () => void;
  className?: string;
}

export function ErrorDisplay({
  title = "Error",
  message,
  retry,
  className = "",
}: ErrorDisplayProps) {
  return (
    <div
      className={`rounded-lg border border-danger/15 bg-danger/5 p-4 text-sm ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-danger/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-danger/90">{title}</p>
          <p className="mt-1 text-danger/70">{message}</p>
        </div>
        {retry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={retry}
            className="shrink-0 text-danger/70 hover:bg-danger/10 hover:text-danger"
          >
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}