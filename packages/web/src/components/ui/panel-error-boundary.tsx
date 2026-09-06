"use client";

// ============================================================================
// PR-10 — small, isolated error boundary for provider-driven panel regions.
//
// A failure inside one surface (activity feed, versions panel, authority panel,
// deep-dive bridges, contextual panel, intelligence panel) must degrade that
// surface alone — never the whole graph control center. Deliberately NOT an
// app-wide catch: it renders an honest, compact fallback and lets the rest of
// the shell keep working.
// ============================================================================

import { Component, type ErrorInfo, type ReactNode } from "react";

interface PanelErrorBoundaryProps {
  /** Human-readable surface name for the fallback ("Activity feed", …). */
  readonly label: string;
  readonly children: ReactNode;
}

interface PanelErrorBoundaryState {
  readonly failed: boolean;
}

export class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  state: PanelErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): PanelErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfaces stay isolated: the error is contained here and never rethrown
    // into the shell. Consoles the same way the rest of the app surfaces
    // provider failures — never swallowed silently.
    // eslint-disable-next-line no-console
    console.error(`[${this.props.label}] render failure`, error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          role="alert"
          className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-[11px] text-danger/80"
          data-testid={`error-boundary-${this.props.label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {this.props.label} is temporarily unavailable. The rest of the graph
          control center is unaffected.
        </div>
      );
    }
    return this.props.children;
  }
}