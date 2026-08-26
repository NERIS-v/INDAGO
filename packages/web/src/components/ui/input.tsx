import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ label, error, className = "", id, ...props }, ref) {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium tracking-wide uppercase text-surface-500"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`block w-full rounded-lg border bg-surface-100 px-3.5 py-2.5 text-sm text-surface-800 placeholder:text-surface-400 transition-all duration-500 focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-30 ${error ? "border-danger/50 focus:border-danger focus:ring-danger/20" : "border-surface-200/60 hover:border-surface-300"} ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-danger/80">{error}</p>}
      </div>
    );
  },
);

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ label, error, className = "", id, ...props }, ref) {
    const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-xs font-medium tracking-wide uppercase text-surface-500"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`block w-full rounded-lg border bg-surface-100 px-3.5 py-2.5 text-sm text-surface-800 placeholder:text-surface-400 transition-all duration-500 focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-30 resize-none ${error ? "border-danger/50 focus:border-danger focus:ring-danger/20" : "border-surface-200/60 hover:border-surface-300"} ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-danger/80">{error}</p>}
      </div>
    );
  },
);

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { label, error, options, placeholder, className = "", id, ...props },
    ref,
  ) {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-medium tracking-wide uppercase text-surface-500"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`block w-full rounded-lg border bg-surface-100 px-3.5 py-2.5 text-sm text-surface-800 transition-all duration-500 focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-30 ${error ? "border-danger/50 focus:border-danger focus:ring-danger/20" : "border-surface-200/60 hover:border-surface-300"} ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-danger/80">{error}</p>}
      </div>
    );
  },
);
