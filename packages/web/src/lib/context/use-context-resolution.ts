// ============================================================================
// PR-3 — useContextResolution
//
// Resolves the current InvestigativeContext to current provider data through
// the ContextResolver, with a GENERATION TOKEN race guard: when the user
// selects A then quickly selects B, the eventual A response can never
// overwrite B. Every context change bumps the generation; a resolution only
// commits if its generation is still the latest handler.
//
// The hook returns a stable discriminated state: while a selection is being
// resolved `loading` is true; a resolved/unsupported/not-found/error value is
// delivered via `resolution`. Nothing is fabricated — unsupported and not-found
// are first-class states, distinct from "nothing selected".
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/lib/providers/workspace/context";
import { resolveContext, type ContextResolution } from "./context-resolver";
import type { InvestigativeContext } from "./investigative-context";

export interface ContextResolutionState {
  /** The selection this state describes (null = nothing selected). */
  readonly context: InvestigativeContext | null;
  /** Discriminated resolution of the current selection (null while loading). */
  readonly resolution: ContextResolution | null;
  /** True while the current selection is being resolved. */
  readonly loading: boolean;
}

export function useContextResolution(
  context: InvestigativeContext | null,
): ContextResolutionState {
  const workspace = useWorkspace();
  const generationRef = useRef(0);
  const [resolution, setResolution] = useState<ContextResolution | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const generation = ++generationRef.current;

    if (!context) {
      setLoading(false);
      setResolution(null);
      return;
    }

    setLoading(true);
    setResolution(null);

    let cancelled = false;
    resolveContext(workspace, context).then((res) => {
      // Race guard: a newer selection must win over this slower resolution.
      if (cancelled || generation !== generationRef.current) return;
      setResolution(res);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [workspace, context]);

  return { context, resolution, loading };
}