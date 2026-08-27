// ============================================================================
// F-PR2 Workspace Context
//
// Hands client components the server-created WorkspaceProviders bundle WITHOUT
// ever revealing DataMode or importing Demo/Live implementations. UI code calls
// a uniform provider interface regardless of whether it resolves to demo or
// live — the resolution happens once, server-side, in the page.
//
// `useWorkspace()` throws if used outside a <WorkspaceProvider>.
// ============================================================================

"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { WorkspaceProviders } from "../types";

const WorkspaceContext = createContext<WorkspaceProviders | null>(null);

export interface WorkspaceProviderProps {
  readonly providers: WorkspaceProviders;
  readonly children: ReactNode;
}

export function WorkspaceProvider({
  providers,
  children,
}: WorkspaceProviderProps) {
  const value = useMemo(() => providers, [providers]);
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceProviders {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error(
      "useWorkspace must be used within a <WorkspaceProvider>.",
    );
  }
  return ctx;
}
