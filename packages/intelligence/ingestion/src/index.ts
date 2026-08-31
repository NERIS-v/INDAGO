// ============================================================================
// @indago/ingestion — MA01 Intelligence Ingestion Skeleton
//
// Source-agnostic ingestion boundary for INDAGO V7.
// All source adapters plug into this boundary.
//
// This package does NOT:
//   - Normalize source data (MA05)
//   - Extract entities/relations/observations (MA06+)
//   - Build graphs or run analytics
//   - Own investigation lifecycle or orchestration
//
// Re-exports from @indago/contracts are NOT duplicated here.
// Import contracts directly from @indago/contracts.
// ============================================================================

export type {
  SourceAdapter,
  IngestionContext,
  IngestionInput,
  IngestionResult,
} from './adapters/source-adapter.js';

export {
  AdapterRegistry,
  AdapterRegistryError,
} from './registry/adapter-registry.js';

export type {
  ArtifactStorage,
  StorageWriteResult,
} from './storage/artifact-storage.js';

export { InMemoryArtifactStorage } from './storage/artifact-storage.js';
export { FilesystemArtifactStorage } from './storage/filesystem-artifact-storage.js';

export {
  IngestionService,
} from './service/ingestion-service.js';
export type {
  IngestionServiceConfig,
} from './service/ingestion-service.js';

// M-PR1 Artifact Acquisition
export {
  HttpArtifactFetcher,
  HttpError,
  FetchFailedError,
  FetchTimeoutError,
  ArtifactTooLargeError,
  InvalidReferenceError,
  ArtifactAcquisitionService,
  computeContentHash,
  deterministicArtifactId,
  deterministicSourceId,
  detectMimeType,
  bytesToUuid4,
} from './acquisition/index.js';
export type {
  ArtifactFetcher,
  ArtifactFetchPolicy,
  FetchOptions,
  FetchedArtifact,
  MimeTypeResult,
  ArtifactAcquisitionConfig,
  VerifiedArtifact,
  ArtifactAcquisitionResult,
  AcquisitionContext,
  ArtifactAcquisitionServiceConfig,
} from './acquisition/index.js';

// M-PR2 Artifact Classification
export {
  ARTIFACT_FORMATS,
  ARTIFACT_FAMILIES,
  ENCODING_TYPES,
  mimeToFormat,
  formatToFamily,
  extractExtension,
  extensionToFormat,
  detectEncoding,
  classifyArtifact,
} from './classification/index.js';
export type {
  ArtifactFormat,
  ArtifactFamily,
  EncodingType,
  ClassificationMethod,
  ClassificationConfidence,
  ArtifactClassification,
} from './classification/index.js';

// M-PR2 Parser Routing
export {
  ParserRegistry,
  selectParser,
  createDefaultParserRegistry,
} from './parser/index.js';
export type {
  ParserCapability,
  ParserRoute,
  ParserRouteResult,
  ArtifactParser,
} from './parser/index.js';

// M-PR3 Raw Extraction
export {
  ExtractionService,
  createTesseractOcrProvider,
} from './extraction/index.js';
export type {
  ExtractionWarningCode,
  ExtractionWarning,
  SourceLocation,
  ExtractionMethod,
  ParserContext,
  ParserLimits,
  ParseResult,
  ExtractionResult,
  PdfSourceLocation,
  PdfSpan,
  PdfPage,
  PdfExtraction,
  DocxSourceLocation,
  DocxParagraph,
  DocxHeading,
  DocxTableCell,
  DocxTableRow,
  DocxTable,
  DocxSection,
  DocxExtraction,
  TxtSourceLocation,
  TxtLine,
  TxtExtraction,
  CsvSourceLocation,
  CsvCell,
  CsvRecord,
  CsvExtraction,
  JsonSourceLocation,
  JsonExtraction,
  XmlSourceLocation,
  XmlNode,
  XmlExtraction,
  ImageExtraction,
  RawExtractionBase,
  RawExtraction,
  OcrBoundingBox,
  OcrWord,
  OcrLine,
  OcrProvider,
  OcrInput,
  OcrResult,
  ExtractionServiceConfig,
  TesseractOcrConfig,
} from './extraction/index.js';

// M-A05 Normalization
export {
  NormalizationService,
  NORMALIZER_ID,
  NORMALIZER_VERSION,
  parseStoredRawExtraction,
  RawExtractionBodySchema,
  PersistedRawExtractionRowSchema,
} from './normalization/index.js';

// M-A06 Observation Extraction
export {
  extractObservations,
  finalizeObservation,
  OBSERVATION_IDENTITY_DERIVATION,
  OBSERVATION_EXTRACTOR_ID,
  OBSERVATION_EXTRACTOR_VERSION,
  OBSERVATION_EXTRACTOR_REF,
  STRUCTURED_STRENGTH_BASELINE,
  NARRATIVE_STRENGTH_BASELINE,
  RECONSTRUCTED_STRENGTH_BASELINE,
  OBSERVATION_BOUNDS,
  OBSERVATION_IDENTITY_NAMESPACE,
  OBSERVATION_IDENTITY_VERSION,
  buildObservationIdentityKey,
  deterministicObservationId,
  serializeSourceLocation,
} from './observation/index.js';
export type {
  ObservationDraft,
  ObservationExtractionResult,
  ObservationExtractionWarning,
  ObservationExtractorWarningCode,
  ObservationExtractorInput,
  ObservationFinalizeInput,
  ObservationIdentityInput,
  LocationStructureKind,
} from './observation/index.js';

// M-A07 Entity Mention Candidate
export {
  extractEntityMentions,
  finalizeEntityMention,
  ENTITY_MENTION_IDENTITY_DERIVATION,
  ENTITY_MENTION_IDENTITY_NAMESPACE,
  ENTITY_MENTION_IDENTITY_VERSION,
  buildEntityMentionIdentityKey,
  deterministicEntityMentionId,
  ENTITY_PATTERN_RULES,
  matchTypedPatterns,
  CAPITALIZED_NAME_RE,
  createGazetteer,
  EMPTY_GAZETTEER,
  CONTEXTUAL_RULES,
  classifyByContext,
  isContextStopword,
  HEURISTIC_METHOD,
  isPlausibleEntityToken,
  ENTITY_MENTION_BOUNDS,
} from './entity-mention/index.js';
export type {
  EntityMentionExtractorConfig,
  EntityMentionIdentityInput,
  EntityPatternRule,
  Gazetteer,
  GazetteerEntry,
  ContextualRule,
  EntityMentionDraft,
  EntityMentionExtractionResult,
} from './entity-mention/index.js';

// M-A08 Candidate Pair / Multi-pass Blocking
export {
  blockCandidates,
} from './blocking/index.js';
export {
  finalizeCandidatePair,
} from './blocking/index.js';
export {
  CANDIDATE_PAIR_IDENTITY_NAMESPACE,
  CANDIDATE_PAIR_IDENTITY_VERSION,
  buildCandidatePairIdentityKey,
  canonicalizePairIds,
  deterministicCandidatePairId,
} from './blocking/index.js';
export type { CandidatePairIdentityInput } from './blocking/index.js';
export {
  areTypesCompatible,
  deriveSurnameInitial,
} from './blocking/index.js';
export {
  CANDIDATE_PAIR_BOUNDS,
} from './blocking/index.js';
export type {
  BlockingCandidate,
  BlockingConfig,
  BlockingMetrics,
  BlockingResult,
  CandidatePairDraft,
} from './blocking/index.js';

