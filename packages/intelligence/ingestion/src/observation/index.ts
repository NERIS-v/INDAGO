// ============================================================================
// M-A06 Observation Extraction — public surface
// ============================================================================

export {
  extractObservations,
  finalizeObservation,
  OBSERVATION_IDENTITY_DERIVATION,
} from './observation-extractor.js';
export type {
  ObservationDraft,
  ObservationExtractionResult,
  ObservationExtractionWarning,
  ObservationExtractorWarningCode,
  ObservationExtractorInput,
  ObservationFinalizeInput,
} from './observation-extractor.js';

export {
  OBSERVATION_EXTRACTOR_ID,
  OBSERVATION_EXTRACTOR_VERSION,
  OBSERVATION_EXTRACTOR_REF,
  STRUCTURED_STRENGTH_BASELINE,
  NARRATIVE_STRENGTH_BASELINE,
  RECONSTRUCTED_STRENGTH_BASELINE,
  OBSERVATION_BOUNDS,
  Y_TOLERANCE,
  mergeSameLineSpans,
} from './observation-rules.js';
export type { MergeableSpan, MergedSpan } from './observation-rules.js';
export {
  canonicalizeContent,
  isAssertiveContent,
  isMeaningfulLeafPath,
  extractCandidateMentions,
  detectObservedAt,
  inferObservationType,
  inferStructuredRelation,
  composeStructuredRow,
} from './observation-rules.js';

export {
  OBSERVATION_IDENTITY_NAMESPACE,
  OBSERVATION_IDENTITY_VERSION,
  buildObservationIdentityKey,
  deterministicObservationId,
  serializeSourceLocation,
} from './observation-id.js';
export type {
  ObservationIdentityInput,
  LocationStructureKind,
} from './observation-id.js';