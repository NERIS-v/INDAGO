// ============================================================================
// F-PR5 — Network Workspace State Provider + Hook
//
// One shared owner for the Network workspace's divergable analytical state:
//   - activeNetworkView  which representation is active (graph = default)
//   - timeRange          workspace-wide temporal scope (shared with the zones)
//   - focusEntityId      durable deep-link focus target (the graph camera
//                        target a user explicitly focused; SELECT ≠ FOCUS)
//
// The provider is mounted at the workspace boundary (inside
// <WorkspaceProvider>, wrapping <WorkspaceShell>), so state SURVIVES sub-route
// remounts (Overview -> Graph -> Observations -> ... keeps timeRange, unlike
// the previous page-local useState).
//
// Two-way URL sync:
//   - view/focus are available as ?view= / ?focus= query params so the
//     analytical position survives copy/share, refresh and back/forward.
//   - ?caseId= is ALWAYS preserved (mutations go through lib/workspace/url).
//   - The default representation "graph" is REST-ful: param is dropped rather
//     than serialized, so a fresh workspace URL has no ?view= noise.
//   - timeRange is intentionally NOT URL-serialized (domain-dependent, and the
//     previous Graph behavior did not serialize it either).
//
// Sync model (ping-pong-safe):
//   - Setters write state then the URL. When the router replaces the URL, the
//     URL->state effect re-reads the params and sets state to the SAME value,
//     which React bails out of — no loop.
//   - Back/forward / manual URL edits flow URL -> state through the same
//     effect: values that differ from current state are applied.
// ============================================================================

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_NETWORK_VIEW,
  type NetworkTimeRange,
  type NetworkView,
} from "./network-workspace";
import {
  NETWORK_FOCUS_PARAM,
  NETWORK_VIEW_PARAM,
  pathWithParams,
  readNetworkFocus,
  readNetworkView,
  withoutSearchParam,
  withSearchParam,
} from "@/lib/workspace/url";

export interface NetworkWorkspaceValue {
  /** Active Zone 2 representation. Defaults to "graph". */
  readonly activeNetworkView: NetworkView;
  /** Replace the active representation; serializes ?view= (dropped when the
   *  value is the default "graph"). */
  setActiveNetworkView(view: NetworkView): void;
  /** The workspace-wide temporal scope. Shared, NOT URL-serialized. */
  readonly timeRange: NetworkTimeRange;
  setTimeRange(range: NetworkTimeRange): void;
  /** Durable deep-link focus target (null = none). */
  readonly focusEntityId: string | null;
  /** Set/replace the focus target; serializes ?focus=. null clears it. */
  setFocusEntityId(entityId: string | null): void;
  /** Reset view + focus to defaults and drop their query params. */
  clearAnalyticalState(): void;
}

const NetworkWorkspaceContext = createContext<NetworkWorkspaceValue | null>(
  null,
);

function currentView(
  searchParams: ReturnType<typeof useSearchParams>,
): NetworkView {
  return readNetworkView(searchParams) ?? DEFAULT_NETWORK_VIEW;
}

function currentFocus(
  searchParams: ReturnType<typeof useSearchParams>,
): string | null {
  return readNetworkFocus(searchParams);
}

export function NetworkWorkspaceProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [activeNetworkView, setActiveNetworkViewState] = useState<NetworkView>(
    () => currentView(searchParams),
  );
  const [timeRange, setTimeRange] = useState<NetworkTimeRange>(null);
  const [focusEntityId, setFocusEntityIdState] = useState<string | null>(() =>
    currentFocus(searchParams),
  );

  // Mirrors of the query-param state used to make setters no-op when the value
  // has not actually changed, so repeated calls (e.g. selection clears that do
  // not own a focus) never churn the URL / history.
  const viewRef = useRef(activeNetworkView);
  const focusRef = useRef(focusEntityId);

  // URL -> state (back/forward, manual edits, direct nav).
  useEffect(() => {
    const view = currentView(searchParams);
    viewRef.current = view;
    setActiveNetworkViewState((prev) =>
      view === prev ? prev : view,
    );
    const focus = currentFocus(searchParams);
    focusRef.current = focus;
    setFocusEntityIdState((prev) => (focus === prev ? prev : focus));
  }, [searchParams]);

  // State -> URL. Every mutation is a copy of the CURRENT params so ?caseId=
  // and every other present search param survive; default values are dropped.
  const writeUrl = useCallback(
    (mutate: (params: URLSearchParams) => URLSearchParams) => {
      const base = new URLSearchParams(searchParams.toString());
      router.replace(pathWithParams(pathname, mutate(base)), {
        scroll: false,
      });
    },
    [router, pathname, searchParams],
  );

  const setActiveNetworkView = useCallback(
    (view: NetworkView) => {
      if (viewRef.current === view) return;
      viewRef.current = view;
      setActiveNetworkViewState(view);
      writeUrl((params) =>
        view === DEFAULT_NETWORK_VIEW
          ? withoutSearchParam(params, NETWORK_VIEW_PARAM)
          : withSearchParam(params, NETWORK_VIEW_PARAM, view),
      );
    },
    [writeUrl],
  );

  const setFocusEntityId = useCallback(
    (entityId: string | null) => {
      if (focusRef.current === entityId) return;
      focusRef.current = entityId;
      setFocusEntityIdState(entityId);
      writeUrl((params) =>
        entityId
          ? withSearchParam(params, NETWORK_FOCUS_PARAM, entityId)
          : withoutSearchParam(params, NETWORK_FOCUS_PARAM),
      );
    },
    [writeUrl],
  );

  const clearAnalyticalState = useCallback(() => {
    if (
      viewRef.current === DEFAULT_NETWORK_VIEW &&
      focusRef.current === null
    ) {
      return;
    }
    viewRef.current = DEFAULT_NETWORK_VIEW;
    focusRef.current = null;
    setActiveNetworkViewState(DEFAULT_NETWORK_VIEW);
    setFocusEntityIdState(null);
    writeUrl((params) =>
      withoutSearchParam(
        withoutSearchParam(params, NETWORK_VIEW_PARAM),
        NETWORK_FOCUS_PARAM,
      ),
    );
  }, [writeUrl]);

  const value = useMemo<NetworkWorkspaceValue>(
    () => ({
      activeNetworkView,
      setActiveNetworkView,
      timeRange,
      setTimeRange,
      focusEntityId,
      setFocusEntityId,
      clearAnalyticalState,
    }),
    [
      activeNetworkView,
      setActiveNetworkView,
      timeRange,
      setTimeRange,
      focusEntityId,
      setFocusEntityId,
      clearAnalyticalState,
    ],
  );

  return (
    <NetworkWorkspaceContext.Provider value={value}>
      {children}
    </NetworkWorkspaceContext.Provider>
  );
}

export function useNetworkWorkspace(): NetworkWorkspaceValue {
  const ctx = useContext(NetworkWorkspaceContext);
  if (!ctx) {
    throw new Error(
      "useNetworkWorkspace must be used within a <NetworkWorkspaceProvider>.",
    );
  }
  return ctx;
}