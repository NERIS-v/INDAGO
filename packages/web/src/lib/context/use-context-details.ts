// ============================================================================
// PR-5 — useContextDetails
//
// Resolves the current InvestigativeContext into a composable bundle of
// provider-owned domain objects (hypotheses ↔ evidence ↔ observations ↔
// entities ↔ gaps ↔ leads ↔ foreign overlays) through context-details.ts.
//
// Shares the ContextResolver generation-token race guard: when the user
// selects A then quickly selects B, a slower A response can never overwrite
// B. `loading` is true only while a selection resolves; `details` is the
// discriminated result (resolved/unsupported/not-found/error).
//
// Slices that depend on an unavailable data source surface as null INSIDE the
// resolved bundle — the primary selection still resolves.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import {
  resolveContextDetails,
  type ContextDetailsResult,
} from "./context-details";
import type { InvestigativeContext } from "./investigative-context";

export interface ContextDetailsState {
  /** The selection these details describe (null = nothing selected). */
  readonly context: InvestigativeContext | null;
  /** Discriminated details of the current selection (null while loading). */
  readonly details: ContextDetailsResult | null;
  /** True while the current selection is being composed. */
  readonly loading: boolean;
}

export function useContextDetails(
  context: InvestigativeContext | null,
): ContextDetailsState {
  const workspace = useWorkspace();
  const generationRef = useRef(0);
  const [details, setDetails] = useState<ContextDetailsResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const generation = ++generationRef.current;

    if (!context) {
      setLoading(false);
      setDetails(null);
      return;
    }

    setLoading(true);
    setDetails(null);

    let cancelled = false;
    resolveContextDetails(workspace, context).then((res) => {
      // Race guard: a newer selection must win over this slower composition.
      if (cancelled || generation !== generationRef.current) return;
      setDetails(res);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [workspace, context]);

  return { context, details, loading };
}