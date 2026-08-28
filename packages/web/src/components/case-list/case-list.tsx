"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Case } from "@indago/contracts";
import type { CaseProvider, AppDataMode } from "@/lib/providers";
import { toProviderError } from "@/lib/providers";
import { investigationUrl } from "@/lib/workspace/url";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

function statusBadge(status: Case["status"]): {
  variant: BadgeVariant;
  pulse: boolean;
} {
  switch (status) {
    case "OPEN":
      return { variant: "info", pulse: true };
    case "ACTIVE":
      return { variant: "accent", pulse: true };
    case "CLOSED":
      return { variant: "muted", pulse: false };
    case "ARCHIVED":
      return { variant: "muted", pulse: false };
  }
}

function formatUpdated(value: Case["updatedAt"]): string {
  const d = new Date(value.value);
  if (Number.isNaN(d.getTime())) return value.value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface CaseCardProps {
  readonly caseItem: Case;
  readonly mode: AppDataMode;
}

function CaseCard({ caseItem, mode }: CaseCardProps) {
  const badge = statusBadge(caseItem.status);
  const primaryInvestigation = caseItem.investigationIds[0];

  return (
    <li className="group rounded-xl border border-border-standard bg-surface-50 p-4 transition-colors duration-fast hover:border-border-emphasis">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-text-strong">
              {caseItem.title}
            </h3>
            {mode === "demo" && <Badge variant="default">Demo</Badge>}
          </div>
          {caseItem.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">
              {caseItem.description}
            </p>
          )}
        </div>
        <Badge variant={badge.variant} dot dotPulse={badge.pulse}>
          {caseItem.status}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
        <span>{caseItem.evidenceIds.length} evidence</span>
        <span>{caseItem.entityIds.length} entities</span>
        <span>{caseItem.investigationIds.length} investigation
          {caseItem.investigationIds.length === 1 ? "" : "s"}</span>
        {caseItem.jurisdiction && <span>{caseItem.jurisdiction}</span>}
        <span className="type-mono-small ml-auto">
          Updated {formatUpdated(caseItem.updatedAt)}
        </span>
      </div>

      {primaryInvestigation ? (
        <Link
          href={investigationUrl(primaryInvestigation, caseItem.id)}
          className="group/link mt-4 inline-flex items-center gap-2 text-xs font-medium text-accent-rose"
        >
          Open investigation
          <span className="transition-transform duration-fast group-hover/link:translate-x-0.5">
            →
          </span>
        </Link>
      ) : (
        <p className="mt-4 type-caption text-text-muted">
          No investigations yet.
        </p>
      )}
    </li>
  );
}

interface CaseListProps {
  readonly cases: CaseProvider;
  readonly mode: AppDataMode;
}

export function CaseList({ cases, mode }: CaseListProps) {
  const [items, setItems] = useState<Case[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const page = await cases.list({ pageSize: 100 });
      setItems(page.items);
    } catch (err) {
      const pe = toProviderError(err);
      if (pe.code === "UNSUPPORTED") {
        setUnavailable(true);
        setItems([]);
      } else {
        setError(pe.message);
      }
    } finally {
      setLoading(false);
    }
  }, [cases]);

  useEffect(() => {
    void load();
  }, [load]);

  const isEmpty = !loading && !error && !unavailable && items !== null && items.length === 0;

  return (
    <div className="space-y-4">
      {unavailable ? (
        <EmptyState
          title="Case catalog not available in live mode"
          description="The connected platform does not expose a case-list endpoint yet. Try demo mode to see the authored case catalog."
          action={<Button variant="ghost" size="sm" onClick={() => void load()}>Retry</Button>}
        />
      ) : error ? (
        <ErrorDisplay
          title="Could not load cases"
          message={error}
          retry={() => void load()}
        />
      ) : loading && items === null ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner label="Loading cases" />
        </div>
      ) : isEmpty ? (
        <EmptyState title="No cases" description="There are no cases to display in this catalogue." />
      ) : items ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {items.map((c) => (
            <CaseCard key={c.id} caseItem={c} mode={mode} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}