"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea, Select } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorDisplay } from "@/components/ui/error-display";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";
import { ProvenanceChip } from "@/components/ui/provenance-chip";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="border-b border-border-subtle pb-2">
        <h2 className="type-section text-text-muted">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Swatch({ name, value, className }: { name: string; value: string; className: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border-standard bg-surface-50 p-3">
      <span className={`h-10 w-14 shrink-0 rounded-md border border-border-subtle ${className}`} />
      <div className="min-w-0">
        <p className="type-mono-small">{name}</p>
        <p className="type-mono-small text-text-muted">{value}</p>
      </div>
    </div>
  );
}

const SURFACE_SWATCHES: [string, string, string][] = [
  ["surface-0", "#0c0a08", "bg-surface-0"],
  ["surface-50", "#11100d", "bg-surface-50"],
  ["surface-100", "#161411", "bg-surface-100"],
  ["surface-200", "#1e1b17", "bg-surface-200"],
  ["surface-300", "#282420", "bg-surface-300"],
  ["surface-400", "#3d3833", "bg-surface-400"],
  ["surface-500", "#5a534c", "bg-surface-500"],
  ["surface-600", "#7f776d", "bg-surface-600"],
  ["surface-700", "#aaa096", "bg-surface-700"],
  ["surface-800", "#d9d2c8", "bg-surface-800"],
  ["surface-900", "#efe9e0", "bg-surface-900"],
];

const ACCENT_SWATCHES: [string, string, string][] = [
  ["accent-rose", "#c98f8a", "bg-accent-rose"],
  ["accent-rose-subtle", "#c98f8a24", "bg-accent-rose-subtle"],
  ["accent-amber", "#b0906a", "bg-accent-amber"],
  ["accent-amber-subtle", "#b0906a24", "bg-accent-amber-subtle"],
];

const SEMANTIC_SWATCHES: [string, string, string][] = [
  ["success", "#4a7c59", "bg-success"],
  ["warning", "#8a7240", "bg-warning"],
  ["danger", "#8a4040", "bg-danger"],
  ["info", "#4a6078", "bg-info"],
];

export default function DesignLabPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-12 p-8 animate-fade-in">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="type-display text-text-primary">Design Lab</h1>
          <Badge variant="accent">Development Only</Badge>
        </div>
        <p className="type-body-muted mt-2">
          Visual verification surface for the INDAGO design system. Not a
          product route — the workspace is built in later F-PRs.
        </p>
      </div>

      {/* Typography */}
      <Section title="Typography">
        <div className="space-y-4 rounded-xl border border-border-standard bg-surface-50 p-6">
          <div className="space-y-1">
            <p className="type-label">type-display</p>
            <p className="type-display text-text-primary">A quiet instrument for dark rooms</p>
          </div>
          <div className="space-y-1">
            <p className="type-label">type-title</p>
            <p className="type-title text-text-primary">Investigation · case-042</p>
          </div>
          <div className="space-y-1">
            <p className="type-label">type-section</p>
            <p className="type-section text-text-muted">Recent Investigations</p>
          </div>
          <div className="space-y-1">
            <p className="type-label">type-body</p>
            <p className="type-body text-text-secondary">
              Observations extracted from the case pack, with provenance and strength.
            </p>
          </div>
          <div className="space-y-1">
            <p className="type-label">type-body-muted</p>
            <p className="type-body-muted">
              Muted body text for secondary context and helper copy.
            </p>
          </div>
          <div className="space-y-1">
            <p className="type-label">type-label</p>
            <p className="type-label">Source / Origin</p>
          </div>
          <div className="space-y-1">
            <p className="type-label">type-caption</p>
            <p className="type-caption">Updated 3 minutes ago</p>
          </div>
          <div className="space-y-1">
            <p className="type-label">type-mono</p>
            <p className="type-mono text-text-secondary">550e8400-e29b-41d4-a716-446655440000</p>
          </div>
          <div className="space-y-1">
            <p className="type-label">type-mono-small</p>
            <p className="type-mono-small">2026-08-27 20:15:32</p>
          </div>
        </div>
      </Section>

      {/* Color */}
      <Section title="Color Tokens">
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="type-label">Surface ramp</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {SURFACE_SWATCHES.map(([name, value, cls]) => (
                <Swatch key={name} name={name} value={value} className={cls} />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="type-label">Accent</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ACCENT_SWATCHES.map(([name, value, cls]) => (
                <Swatch key={name} name={name} value={value} className={cls} />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="type-label">Semantic</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SEMANTIC_SWATCHES.map(([name, value, cls]) => (
                <Swatch key={name} name={name} value={value} className={cls} />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="type-label">Background / text / border</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              <Swatch name="background-base" value="#0c0a08" className="bg-background-base" />
              <Swatch name="background-elevated" value="#11100d" className="bg-background-elevated" />
              <Swatch name="background-panel" value="#161411" className="bg-background-panel" />
              <Swatch name="text-primary" value="#d9d2c8" className="bg-text-primary" />
              <Swatch name="text-secondary" value="#aaa096" className="bg-text-secondary" />
              <Swatch name="text-muted" value="#7f776d" className="bg-text-muted" />
              <Swatch name="border-subtle" value="#efe9e014" className="bg-border-subtle" />
              <Swatch name="border-standard" value="#efe9e026" className="bg-border-standard" />
              <Swatch name="border-emphasis" value="#efe9e03d" className="bg-border-emphasis" />
            </div>
          </div>
        </div>
      </Section>

      {/* Buttons */}
      <Section title="Buttons">
        <div className="space-y-4 rounded-xl border border-border-standard bg-surface-50 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="quiet">Quiet</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button loading>Submitting</Button>
            <Button disabled>Disabled</Button>
            <Button variant="secondary" disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button className="focus-visible:outline-2 focus-visible:outline-accent-rose">
              Focus me (Tab)
            </Button>
            <Button variant="quiet" aria-label="Icon only action">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        </div>
      </Section>

      {/* Cards */}
      <Section title="Cards">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader className="mb-3">
              <CardTitle>Resting</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="type-body text-text-secondary">
                Default surface — background contrast and a subtle border, no shadow.
              </p>
            </CardContent>
          </Card>
          <Card interactive>
            <CardHeader className="mb-3">
              <CardTitle>Interactive</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="type-body text-text-secondary">
                Hover warms the surface slightly. No lift, no glow.
              </p>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* Badges */}
      <Section title="Badges / Status">
        <div className="space-y-3 rounded-xl border border-border-standard bg-surface-50 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Default</Badge>
            <Badge variant="muted">Muted</Badge>
            <Badge variant="accent">Accent</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
            <Badge variant="info">Info</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent" dot>Analyzing</Badge>
            <Badge variant="accent" dot dotPulse>Processing</Badge>
            <Badge variant="success" dot>Completed</Badge>
            <Badge variant="danger" dot>Failed</Badge>
          </div>
        </div>
      </Section>

      {/* Form */}
      <Section title="Inputs">
        <div className="grid gap-4 rounded-xl border border-border-standard bg-surface-50 p-6 sm:grid-cols-2">
          <Input label="Case ID" placeholder="case-042" />
          <Input label="Case ID" defaultValue="case-042" />
          <Input label="Source / Origin" placeholder="CDR export" error="A source is required." />
          <Input label="Disabled" defaultValue="frozen" disabled />
          <Textarea label="Notes" rows={3} placeholder="Context about this evidence..." className="sm:col-span-2" />
          <Select
            label="Evidence Type"
            options={[
              { value: "DOCUMENT", label: "Document" },
              { value: "FINANCIAL", label: "Financial" },
              { value: "COMMUNICATION", label: "Communication" },
            ]}
            placeholder="Select a type"
            className="sm:col-span-2"
          />
        </div>
      </Section>

      {/* States */}
      <Section title="Loading / Empty / Error">
        <div className="space-y-4 rounded-xl border border-border-standard bg-surface-50 p-6">
          <div className="flex items-center gap-6">
            <LoadingSpinner label="Processing" />
            <LoadingSpinner size="sm" label="Small" />
            <LoadingSpinner size="lg" />
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <StatusIndicator tone="idle" label="Idle" />
            <StatusIndicator tone="processing" label="Processing" />
            <StatusIndicator tone="success" label="Ready" />
            <StatusIndicator tone="warning" label="Review" />
            <StatusIndicator tone="danger" label="Failed" />
            <StatusIndicator tone="info" label="Ingesting" />
          </div>
          <EmptyState
            title="No observations yet"
            description="Observations appear here as evidence is processed. Nothing is wrong — this surface is simply waiting for the case pack."
            action={<Button size="sm">Add Evidence</Button>}
          />
          <ErrorDisplay
            title="Parser unreachable"
            message="The extraction service did not respond. Retry, or continue while other panels stay available."
            retry={() => undefined}
          />
        </div>
      </Section>

      {/* Semantic primitives */}
      <Section title="Semantic primitives">
        <div className="grid gap-4 rounded-xl border border-border-standard bg-surface-50 p-6 sm:grid-cols-2">
          <div className="space-y-4">
            <p className="type-label">Confidence (0–1, never probability, never animated)</p>
            <ConfidenceIndicator value={0.62} />
            <ConfidenceIndicator value={0.62} showBar />
            <ConfidenceIndicator value={0.31} showBar />
          </div>
          <div className="space-y-4">
            <p className="type-label">Provenance</p>
            <ProvenanceChip source="cdr-export-tel-a" />
            <ProvenanceChip source="fin-042" detail="rec-118" />
            <p className="type-caption">
              Static, technical, subordinate to the statement it annotates.
            </p>
          </div>
        </div>
      </Section>

      {/* Motion */}
      <Section title="Motion">
        <div className="space-y-4 rounded-xl border border-border-standard bg-surface-50 p-6">
          <div className="flex items-center gap-6">
            <span className="h-2 w-2 rounded-full bg-accent-amber animate-breathe" />
            <span className="type-caption">animate-breathe · activity</span>
            <span className="h-2 w-2 rounded-full bg-success animate-slow-pulse" />
            <span className="type-caption">animate-slow-pulse</span>
          </div>
          <div className="animate-fade-in">
            <p className="type-caption">animate-fade-in · entrance (plays once on mount)</p>
          </div>
          <p className="type-caption text-text-muted">
            Reduced motion: activate prefers-reduced-motion and grain stills, all
            non-essential animation collapses to its end state.
          </p>
        </div>
      </Section>

      {/* Grain */}
      <Section title="Grain">
        <div className="rounded-xl border border-border-standard bg-surface-50 p-6">
          <p className="type-body-muted">
            Film grain is applied globally via <span className="type-mono-small">body.grain</span> (SVG
            feTurbulence, overlay blend, pointer-events none). Felt, not seen.
          </p>
        </div>
      </Section>
    </div>
  );
}