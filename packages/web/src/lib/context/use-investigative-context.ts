// ============================================================================
// PR-3 — Investigative Context controller hook
//
// The shell-owned selection controller. All context state lives here (one
// useState), the owner component (GraphControlCenter) renders it, and panels
// communicate ONLY through the returned actions. There is no global event
// bus, no singleton, no third-party store.
//
// This hook is PROVIDER-AGNOSTIC: it stores the discriminated selection only,
// never domain data. Current provider data is resolved separately by the
// ContextResolver (context-resolver.ts) at render time.
// ============================================================================

import { useCallback, useState } from "react";
import {
  contextKey,
  type InvestigativeContext,
  type InvestigativeContextActions,
} from "./investigative-context";

export interface InvestigativeContextController extends InvestigativeContextActions {
  /** The currently selected context; null = nothing selected. */
  readonly context: InvestigativeContext | null;
  /** Standardized selection identity ("" when nothing selected). */
  readonly contextIdentity: string;
}

export function useInvestigativeContext(): InvestigativeContextController {
  const [context, setContext] = useState<InvestigativeContext | null>(null);

  const select = useCallback((next: InvestigativeContext | null) => setContext(next), []);
  const focus = useCallback((next: InvestigativeContext) => setContext(next), []);
  const reveal = useCallback((next: InvestigativeContext) => setContext(next), []);
  const clear = useCallback(() => setContext(null), []);

  return {
    context,
    contextIdentity: context ? contextKey(context) : "",
    select,
    focus,
    reveal,
    clear,
  };
}