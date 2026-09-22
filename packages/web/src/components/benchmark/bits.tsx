// ============================================================================
// Benchmark surface — shared editorial primitives.
// Visual contract: forensic research console x editorial scientific report x
// luxury black. Mono eyebrows, hairline rules, Cormorant numerals. No pills
// beyond the single state marker; no saturated color; rose is reserved for
// contradiction/adversarial semantics only.
// ============================================================================

import type { ReactNode } from "react";

export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-semantic-foreground-faint ${className}`}
    >
      {children}
    </span>
  );
}

export function Kicker({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Eyebrow>{children}</Eyebrow>
      <span className="h-px w-12 bg-semantic-border-subtle" aria-hidden="true" />
    </div>
  );
}

export function SectionHeader({
  index,
  eyebrow,
  title,
  right,
}: {
  index: string;
  eyebrow: string;
  title: ReactNode;
  right?: ReactNode;
}) {
  return (
    <HeaderRow index={index} eyebrow={eyebrow}>
      <div className="flex flex-1 flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <h2 className="font-display text-[2rem] font-light leading-tight tracking-[-0.015em] text-semantic-foreground">
          {title}
        </h2>
        {right}
      </div>
    </HeaderRow>
  );
}

export function HeaderRow({
  index,
  eyebrow,
  children,
}: {
  index: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-5">
      <span className="w-14 shrink-0 pt-1 font-mono text-[10px] tracking-[0.25em] text-surface-600" aria-hidden="true">
        {index}
      </span>
      <div className="flex-1">
        <Eyebrow>{eyebrow}</Eyebrow>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

export function HairRule({ className = "" }: { className?: string }) {
  return <div className={`border-t border-semantic-border-subtle ${className}`} aria-hidden="true" />;
}

export function NotAvailable({ reason = "NOT AVAILABLE" }: { reason?: string }) {
  return (
    <span className="font-mono text-[10px] tracking-[0.2em] text-surface-600 uppercase">{reason}</span>
  );
}

export type Tone = "warm" | "amber" | "rose" | "info";

export function ToneDot({ tone }: { tone: Tone }) {
  const map: Record<Tone, string> = {
    warm: "bg-semantic-foreground-muted",
    amber: "bg-semantic-warning",
    rose: "bg-semantic-contradiction",
    info: "bg-semantic-info",
  };
  return <span className={`h-1 w-1 rounded-full ${map[tone]}`} aria-hidden="true" />;
}

export function StateMarker({ children, tone }: { children: ReactNode; tone: Tone }) {
  const text: Record<Tone, string> = {
    warm: "text-semantic-foreground-muted",
    amber: "text-semantic-warning",
    rose: "text-semantic-contradiction",
    info: "text-semantic-info",
  };
  return (
    <span
      className={`inline-flex items-center gap-2 border border-semantic-border-subtle bg-semantic-surface-elevated px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] ${text[tone]}`}
    >
      <ToneDot tone={tone} />
      {children}
    </span>
  );
}

/** Editorial table shell — hairline grid, no rounded frosted panels. */
export function Table({
  headers,
  children,
}: {
  headers: readonly ReactNode[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-semantic-border">
            {headers.map((h, i) => (
              <th
                key={i}
                className={`pb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint ${
                  i === 0 ? "pr-6" : "px-6"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Cell({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const alignCls =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <td className={`border-b border-semantic-border-subtle px-6 py-3.5 align-middle ${alignCls} ${className}`}>
      {children}
    </td>
  );
}

export function RowNumber({ index }: { index: string }) {
  return (
    <span className="font-mono text-[10px] tracking-[0.2em] text-surface-600">{index}</span>
  );
}

/** Inter display numeral for the primary-result centerpiece. */
export function Monument({ children }: { children: ReactNode }) {
  return (
    <span className="font-display font-light leading-none tracking-[-0.02em] text-semantic-foreground">
      {children}
    </span>
  );
}

export function MonoValue({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={`font-mono text-sm tracking-[0.05em] ${
        muted ? "text-semantic-foreground-faint" : "text-semantic-foreground-muted"
      }`}
    >
      {children}
    </span>
  );
}