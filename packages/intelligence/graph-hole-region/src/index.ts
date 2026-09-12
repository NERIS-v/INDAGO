// ============================================================================
// @indago/graph-hole-region — public surface
//
// Deterministic candidate-region builder (Phase 5A-PR1).
// ============================================================================

// ---- Types ----
export type {
  BuildRegionInput,
  SeedObservation,
  ObservationResolver,
  GraphExpansionRequest,
  GraphExpansionResult,
  IncidentEdgesRequest,
  GraphExpansionProvider,
  RegionExpansionContextProvider,
  RegionBuildDependencies,
  SemanticExpansionDependency,
  GraphHoleRegion,
  RegionExpansionRoundRecord,
  RegionBuildErrorCode,
  RegionBuilder,
} from './types.js';

export {
  REGION_LIMITATION_CODES,
  REGION_TRUNCATING_LIMITATIONS,
  RegionBuildError,
} from './types.js';

export type { RegionLimitationCode } from './types.js';

// ---- Region identity + hashing ----
export { computeRegionId, hashRegionIdentity, buildRegionIdentity, sortedUnique } from './region-identity.js';
export type { RegionIdentityInput } from './region-identity.js';
export { sha256Hex } from './sha256.js';

// ---- Bounds ----
export { applyBudget } from './region-bounds.js';
export type { BoundedSelection } from './region-bounds.js';

// ---- Saturation ----
export {
  noveltyRatio,
  isRoundSatisfying,
  saturationStatusOf,
  SaturationTracker,
  SATURATION_DEFINITION_V1,
} from './calculate-saturation.js';
export type { SaturationDefinition, RoundNoveltyInput, SaturationStatus } from './calculate-saturation.js';

// ---- Seed observation → graph node resolution ----
export { resolveSeedNodeIds } from './resolve-observation-nodes.js';
export type { ObservationNodeResolution, SeedNodeResolution } from './resolve-observation-nodes.js';

// ---- Graph expansion primitives ----
export { expandGraphSteps, incidentEdgesOf, intervalOverlapsContext } from './expand-region.js';

// ---- Projected graph provider (M-A13 adapter) ----
export { ProjectedGraphExpansionProvider } from './graph-expansion-provider.js';

// ---- Semantic region expansion (PR2) ----
export { AuthoritativeSemanticNodeAdapter } from './semantic-node-adapter.js';
export type { SemanticNodeAdapter, SemanticNodeMappingContext } from './semantic-node-adapter.js';
export { buildRegionSemanticQuery } from './semantic-query.js';
export type {
  SemanticContextItem,
  RegionSemanticContextRequest,
  RegionSemanticContextResolver,
} from './semantic-query.js';

// ---- Orchestrator ----
export { buildRegion, createRegionBuilder } from './build-region.js';