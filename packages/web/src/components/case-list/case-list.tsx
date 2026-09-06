"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
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
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onToggle: (id: string) => void;
  readonly featured?: boolean;
}

function CaseCard({ caseItem, mode, selected, disabled, onToggle, featured }: CaseCardProps) {
  const badge = statusBadge(caseItem.status);
  const primaryInvestigation = caseItem.investigationIds[0];

  if (featured) {
    return (
      <li className="rounded-xl border border-semantic-border bg-semantic-surface transition-colors duration-fast">
        <div className="flex items-start justify-between gap-4 p-8 pb-0">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-[1.125rem] font-medium text-semantic-foreground leading-snug">
                {caseItem.title}
              </h3>
              <Badge variant={badge.variant} dot dotPulse={badge.pulse}>
                {caseItem.status}
              </Badge>
              {mode === "demo" && <Badge variant="default">Demo</Badge>}
            </div>
            {caseItem.description && (
              <p className="text-sm text-semantic-foreground-muted leading-relaxed max-w-2xl">
                {caseItem.description}
              </p>
            )}
          </div>
          <input
            type="checkbox"
            aria-label={`Select ${caseItem.title}`}
            checked={selected}
            disabled={disabled}
            onChange={() => onToggle(caseItem.id)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-semantic-border-subtle accent-accent-rose"
          />
        </div>

        <div className="mx-8 mt-6 grid grid-cols-2 gap-px bg-semantic-border-subtle rounded-lg overflow-hidden sm:grid-cols-4">
          <div className="bg-semantic-surface px-5 py-4 text-center">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
              Evidence
            </span>
            <p className="mt-1 font-mono text-lg font-light text-semantic-foreground">
              {String(caseItem.evidenceIds.length).padStart(2, "0")}
            </p>
          </div>
          <div className="bg-semantic-surface px-5 py-4 text-center">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
              Entities
            </span>
            <p className="mt-1 font-mono text-lg font-light text-semantic-foreground">
              {String(caseItem.entityIds.length).padStart(2, "0")}
            </p>
          </div>
          <div className="bg-semantic-surface px-5 py-4 text-center">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
              Investigations
            </span>
            <p className="mt-1 font-mono text-lg font-light text-semantic-foreground">
              {String(caseItem.investigationIds.length).padStart(2, "0")}
            </p>
          </div>
          <div className="bg-semantic-surface px-5 py-4 text-center">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
              Sources
            </span>
            <p className="mt-1 font-mono text-lg font-light text-semantic-foreground">
              {String(caseItem.sourceIds.length).padStart(2, "0")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-8 mt-5 font-mono text-[10px] text-semantic-foreground-faint">
          {caseItem.jurisdiction && (
            <span className="uppercase tracking-widest">Jurisdiction {caseItem.jurisdiction}</span>
          )}
          <span className="uppercase tracking-widest">Updated {formatUpdated(caseItem.updatedAt)}</span>
          {caseItem.labels && caseItem.labels.length > 0 && (
            <span className="uppercase tracking-widest">
              {caseItem.labels.map((l) => l.value).join(" · ")}
            </span>
          )}
        </div>

        <div className="mx-8 mt-5 pt-5 border-t border-semantic-border-subtle flex items-center justify-between">
          {primaryInvestigation ? (
            <Link
              href={investigationUrl(primaryInvestigation, caseItem.id)}
              className="group/link inline-flex items-center gap-2 text-xs font-medium text-accent-rose"
            >
              Open investigation
              <span className="transition-transform duration-fast group-hover/link:translate-x-0.5">→</span>
            </Link>
          ) : (
            <p className="type-caption text-semantic-foreground-faint">No investigations yet.</p>
          )}
          <span className="font-mono text-[10px] text-semantic-foreground-faint">
            {caseItem.id.slice(0, 8)}
          </span>
        </div>
      </li>
    );
  }

  return (
    <li className="group rounded-xl border border-semantic-border bg-semantic-surface p-5 transition-colors duration-fast hover:border-semantic-border hover:bg-semantic-surface-elevated">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-semantic-foreground">
              {caseItem.title}
            </h3>
            {mode === "demo" && <Badge variant="default">Demo</Badge>}
          </div>
          {caseItem.description && (
            <p className="mt-1 line-clamp-2 text-xs text-semantic-foreground-muted leading-relaxed">
              {caseItem.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label={`Select ${caseItem.title}`}
            checked={selected}
            disabled={disabled}
            onChange={() => onToggle(caseItem.id)}
            className="h-4 w-4 rounded border-semantic-border-subtle accent-accent-rose"
          />
          <Badge variant={badge.variant} dot dotPulse={badge.pulse}>
            {caseItem.status}
          </Badge>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-semantic-foreground-faint">
        <span>{caseItem.evidenceIds.length} evidence</span>
        <span className="text-semantic-border-subtle">·</span>
        <span>{caseItem.entityIds.length} entities</span>
        <span className="text-semantic-border-subtle">·</span>
        <span>{caseItem.investigationIds.length} investigation{caseItem.investigationIds.length === 1 ? "" : "s"}</span>
        {caseItem.jurisdiction && (
          <>
            <span className="text-semantic-border-subtle">·</span>
            <span>{caseItem.jurisdiction}</span>
          </>
        )}
        <span className="ml-auto uppercase tracking-widest">
          Updated {formatUpdated(caseItem.updatedAt)}
        </span>
      </div>

      <div className="mt-3 pt-3 border-t border-semantic-border-subtle">
        {primaryInvestigation ? (
          <Link
            href={investigationUrl(primaryInvestigation, caseItem.id)}
            className="group/link inline-flex items-center gap-2 text-xs font-medium text-accent-rose"
          >
            Open investigation
            <span className="transition-transform duration-fast group-hover/link:translate-x-0.5">→</span>
          </Link>
        ) : (
          <p className="type-caption text-semantic-foreground-faint">No investigations yet.</p>
        )}
      </div>
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

  const [selected, setSelected] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<"selected" | "all" | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.length === items!.length ? [] : items!.map((c) => c.id),
    );
  }, [items]);

  const runDelete = useCallback(
    async (ids: string[]) => {
      setDeleting(true);
      setDeleteError(null);
      let failed = false;
      for (const id of ids) {
        try {
          await cases.remove(id);
        } catch (err) {
          const pe = toProviderError(err);
          if (pe.code !== "NOT_FOUND") {
            setDeleteError(pe.message);
            failed = true;
            break;
          }
        }
      }
      if (!failed) {
        setPendingDelete(null);
        setSelected([]);
      }
      setDeleting(false);
      await load();
    },
    [cases, load],
  );

  const confirmDelete = useCallback(async () => {
    if (!items) return;
    const ids = pendingDelete === "all" ? items.map((c) => c.id) : selected;
    await runDelete(ids);
  }, [items, pendingDelete, selected, runDelete]);

  const isEmpty = !loading && !error && !unavailable && items !== null && items.length === 0;
  const allSelected = items !== null && items.length > 0 && selected.length === items.length;

  const aggregates = useMemo(() => {
    if (!items || items.length === 0) return null;
    const evidence = items.reduce((n, c) => n + c.evidenceIds.length, 0);
    const entities = items.reduce((n, c) => n + c.entityIds.length, 0);
    const investigations = items.reduce((n, c) => n + c.investigationIds.length, 0);
    const statusCounts: Record<string, number> = {};
    for (const c of items) {
      statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
    }
    return { evidence, entities, investigations, total: items.length, statusCounts };
  }, [items]);

  const featured = items && items.length === 1 ? items[0] : null;
  const recentItems = useMemo(() => {
    if (!items || items.length <= 1) return [];
    return [...items]
      .sort((a, b) => new Date(b.updatedAt.value).getTime() - new Date(a.updatedAt.value).getTime())
      .slice(0, 3);
  }, [items]);

  return (
    <div className="space-y-8">
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
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner label="Loading cases" />
        </div>
      ) : isEmpty ? (
        <EmptyState title="No cases" description="There are no cases to display in this catalogue." />
      ) : items ? (
        <>
          {/* Aggregate KPI strip */}
          {aggregates && (
            <div className="grid grid-cols-2 gap-px bg-semantic-border-subtle rounded-xl overflow-hidden sm:grid-cols-4">
              <div className="bg-semantic-surface px-5 py-4">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
                  Investigations
                </span>
                <p className="mt-1.5 font-mono text-2xl font-light text-semantic-foreground">
                  {String(aggregates.total).padStart(2, "0")}
                </p>
                <div className="mt-2 flex gap-2">
                  {aggregates.statusCounts.ACTIVE && (
                    <span className="font-mono text-[9px] uppercase tracking-widest text-accent-amber">
                      {aggregates.statusCounts.ACTIVE} active
                    </span>
                  )}
                  {aggregates.statusCounts.OPEN && (
                    <span className="font-mono text-[9px] uppercase tracking-widest text-info">
                      {aggregates.statusCounts.OPEN} open
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-semantic-surface px-5 py-4">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
                  Evidence Items
                </span>
                <p className="mt-1.5 font-mono text-2xl font-light text-semantic-foreground">
                  {String(aggregates.evidence).padStart(2, "0")}
                </p>
              </div>
              <div className="bg-semantic-surface px-5 py-4">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
                  Entities
                </span>
                <p className="mt-1.5 font-mono text-2xl font-light text-semantic-foreground">
                  {String(aggregates.entities).padStart(2, "0")}
                </p>
              </div>
              <div className="bg-semantic-surface px-5 py-4">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
                  Active Investigations
                </span>
                <p className="mt-1.5 font-mono text-2xl font-light text-semantic-foreground">
                  {String(aggregates.investigations).padStart(2, "0")}
                </p>
              </div>
            </div>
          )}

          {/* Investigations section */}
          <div>
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
                My investigations
              </span>
              <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
              <label className="inline-flex items-center gap-2 text-[11px] font-mono text-semantic-foreground-faint">
                <input
                  type="checkbox"
                  aria-label="Select all cases"
                  checked={allSelected}
                  disabled={deleting}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 rounded border-semantic-border-subtle accent-accent-rose"
                />
                {items.length} case{items.length === 1 ? "" : "s"}
              </label>
              <div className="flex items-center gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={selected.length === 0 || deleting}
                  onClick={() => setPendingDelete("selected")}
                >
                  Delete selected
                  {selected.length > 0 ? ` (${selected.length})` : ""}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={deleting}
                  onClick={() => setPendingDelete("all")}
                >
                  Delete all cases
                </Button>
              </div>
            </div>

            {deleteError && (
              <ErrorDisplay title="Could not delete case" message={deleteError} />
            )}

            {pendingDelete && (
              <div
                role="alert"
                className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3"
              >
                <p className="text-xs text-semantic-foreground-muted">
                  {pendingDelete === "all"
                    ? `Delete all ${items.length} case${items.length === 1 ? "" : "s"}?`
                    : `Delete ${selected.length} selected case${selected.length === 1 ? "" : "s"}?`}{" "}
                  This cannot be undone.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deleting}
                    onClick={() => setPendingDelete(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={deleting}
                    onClick={() => void confirmDelete()}
                  >
                    Confirm delete
                  </Button>
                </div>
              </div>
            )}

            {featured ? (
              <ul>
                <CaseCard
                  key={featured.id}
                  caseItem={featured}
                  mode={mode}
                  selected={selected.includes(featured.id)}
                  disabled={deleting}
                  onToggle={toggleSelected}
                  featured
                />
              </ul>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {items.map((c) => (
                  <CaseCard
                    key={c.id}
                    caseItem={c}
                    mode={mode}
                    selected={selected.includes(c.id)}
                    disabled={deleting}
                    onToggle={toggleSelected}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Recent activity — only when enough cases to benefit from recency */}
          {recentItems.length > 0 && items.length > 3 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-semantic-foreground-faint">
                  Recently updated
                </span>
                <span className="h-px flex-1 bg-semantic-border-subtle" aria-hidden="true" />
              </div>
              <div className="space-y-px rounded-xl border border-semantic-border-subtle overflow-hidden">
                {recentItems.map((c) => {
                  const inv = c.investigationIds[0];
                  return inv ? (
                    <Link
                      key={c.id}
                      href={investigationUrl(inv, c.id)}
                      className="flex items-center justify-between gap-4 bg-semantic-surface px-5 py-3.5 transition-colors duration-fast hover:bg-semantic-surface-elevated"
                    >
                      <div className="min-w-0">
                        <span className="text-sm text-semantic-foreground">
                          {c.title}
                        </span>
                        <span className="ml-3 font-mono text-[10px] text-semantic-foreground-faint uppercase tracking-widest">
                          {c.status}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-semantic-foreground-faint uppercase tracking-widest">
                        {formatUpdated(c.updatedAt)}
                      </span>
                    </Link>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}