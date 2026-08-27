// ============================================================================
// F-PR2 Provider Architecture — Public API
//
// Single entry point for the provider layer. Consumers import types and the
// workspace context from here; the concrete Demo/Live implementations live in
// submodules and are only reached via the factory (never imported by UI).
// ============================================================================

export type {
  DataMode,
  DataModeConfig,
  AppDataMode,
  ProviderErrorCode,
  ProviderErrorCategory,
  ProviderErrorOptions,
  ProviderQuery,
  Paginated,
  RealtimeStatus,
  ProviderEvent,
  TimelineBand,
  TimelineItem,
  InvestigationTimeline,
  InvestigationProvider,
  EvidenceProvider,
  ObservationProvider,
  EntityProvider,
  GraphProvider,
  TimelineProvider,
  LeadProvider,
  GapProvider,
  ReviewProvider,
  RobustnessProvider,
  CrossCaseProvider,
  RealtimeProvider,
  WorkspaceIdentity,
  WorkspaceProviders,
} from "./types";
export {
  ProviderError,
  toProviderError,
} from "./types";

export {
  resolveDataModeForWorkspace,
  assertNoImplicitFallback,
  getDataModeConfig,
  parseDataMode,
  DEMO_CASE_ID_ENV,
  DATA_MODE_ENV,
  TIMING_SCALE_ENV,
} from "./config";

export {
  createWorkspaceProviders,
  resolveAppDataMode,
} from "./factory";
