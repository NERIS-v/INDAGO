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
import type { GraphFilterState } from "@/lib/graph/graph-filter";
import { DEFAULT_GRAPH_FILTER, graphFilterIsActive } from "@/lib/graph/graph-filter";
import {
  NETWORK_FOCUS_PARAM,
  NETWORK_HIDEC_PARAM,
  NETWORK_SUPPORT_PARAM,
  NETWORK_VIEW_PARAM,
  networkFilterToParams,
  pathWithParams,
  readNetworkFilter,
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
  /** F-PR14: the workspace-wide readability filter (min support / hide
   *  contradicted). Shared by every representation; survives sub-route
   *  remounts and URL-syncs via ?support=/?hidec= (defaults are dropped). */
  readonly graphFilter: GraphFilterState;
  /** Replace the readability filter; serializes the URL. Default values are
   *  dropped so a fresh workspace URL stays clean. */
  setGraphFilter(filter: GraphFilterState): void;
  /** Reset view + focus + filter to defaults and drop their query params. */
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

function currentFilter(
  searchParams: ReturnType<typeof useSearchParams>,
): GraphFilterState {
  return readNetworkFilter(searchParams);
}

function filterKey(filter: GraphFilterState): string {
  return `${filter.minSupport}|${filter.hideContradicted ? "1" : "0"}`;
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
  const [graphFilter, setGraphFilterState] = useState<GraphFilterState>(() =>
    currentFilter(searchParams),
  );

  // Mirrors of the query-param state used to make setters no-op when the value
  // has not actually changed, so repeated calls (e.g. selection clears that do
  // not own a focus) never churn the URL / history.
  const viewRef = useRef(activeNetworkView);
  const focusRef = useRef(focusEntityId);
  const filterRef = useRef(graphFilter);

  // F-PR16 — coalesced URL-write buffer. Multiple setters firing within the
  // SAME synchronous tick (e.g. "Show on Graph" switching the view AND the
  // focus) must NOT each snapshot the pre-navigation searchParams: the second
  // write would rebuild from a URL that still carries ?view=pulse and
  // resurrect the param the first write just dropped — the "snap back" bug.
  // Writes accumulate from the LATEST intended params here and each still
  // issues a single router.replace of the cumulatively-correct URL; the
  // buffer is drained by the URL->state effect once a committed URL lands, so
  // the next tick naturally starts from fresh params.
  const pendingParamsRef = useRef<URLSearchParams | null>(null);

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
    const filter = currentFilter(searchParams);
    filterRef.current = filter;
    setGraphFilterState((prev) =>
      filterKey(filter) === filterKey(prev) ? prev : filter,
    );
    // The committed URL is now the source of truth; a fresh write tick must
    // start from these params, not whatever an earlier coalesced write staged.
    pendingParamsRef.current = null;
  }, [searchParams]);

  // State -> URL. Every mutation is a copy of the CURRENT params so ?caseId=
  // and every other present search param survive; default values are dropped.
  // Reads the coalesced buffer first so a second setter in the same tick
  // mutates the URL the FIRST setter just produced (bugfix for snap-back).
  const writeUrl = useCallback(
    (mutate: (params: URLSearchParams) => URLSearchParams) => {
      const base =
        pendingParamsRef.current ?? new URLSearchParams(searchParams.toString());
      const next = mutate(new URLSearchParams(base.toString()));
      pendingParamsRef.current = next;
      router.replace(pathWithParams(pathname, next), { scroll: false });
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

  const setGraphFilter = useCallback(
    (filter: GraphFilterState) => {
      if (filterKey(filterRef.current) === filterKey(filter)) return;
      filterRef.current = filter;
      setGraphFilterState(filter);
      writeUrl((params) => {
        let next = params;
        const entries = networkFilterToParams(filter);
        next = withoutSearchParam(next, NETWORK_SUPPORT_PARAM);
        next = withoutSearchParam(next, NETWORK_HIDEC_PARAM);
        for (const { key, value } of entries) {
          next = withSearchParam(next, key, value);
        }
        return next;
      });
    },
    [writeUrl],
  );

  const clearAnalyticalState = useCallback(() => {
    if (
      viewRef.current === DEFAULT_NETWORK_VIEW &&
      focusRef.current === null &&
      !graphFilterIsActive(filterRef.current)
    ) {
      return;
    }
    viewRef.current = DEFAULT_NETWORK_VIEW;
    focusRef.current = null;
    filterRef.current = DEFAULT_GRAPH_FILTER;
    setActiveNetworkViewState(DEFAULT_NETWORK_VIEW);
    setFocusEntityIdState(null);
    setGraphFilterState(DEFAULT_GRAPH_FILTER);
    writeUrl((params) =>
      withoutSearchParam(
        withoutSearchParam(
          withoutSearchParam(
            withoutSearchParam(params, NETWORK_VIEW_PARAM),
            NETWORK_FOCUS_PARAM,
          ),
          NETWORK_SUPPORT_PARAM,
        ),
        NETWORK_HIDEC_PARAM,
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
      graphFilter,
      setGraphFilter,
      clearAnalyticalState,
    }),
    [
      activeNetworkView,
      setActiveNetworkView,
      timeRange,
      setTimeRange,
      focusEntityId,
      setFocusEntityId,
      graphFilter,
      setGraphFilter,
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