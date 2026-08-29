import { z } from 'zod';
import {
  IngestionAttemptIdSchema,
  ArtifactIdSchema,
  InvestigationIdSchema,
  CaseIdSchema,
} from '../common/ids.js';
import { AnalyticalConfidenceSchema } from '../common/confidence.js';

// ============================================================================
// Normalization Contracts (M-A05)
//
// M-A05 is the boundary between RAW MATERIAL and CANONICAL REPRESENTATION.
// It does NOT cross into semantic intelligence:
//   - NO Observation / Entity / Relation
//   - NO GraphNode / GraphEdge
//   - NO Lead / Hypothesis / Gap
//
// M-A05 answers: "WHAT IS THE DETERMINISTIC CANONICAL SHAPE OF THE MATERIAL,
// AND HOW CLEAN/COMPLETE IS IT?"
// M-A05 does NOT answer: "WHAT DOES THIS MATERIAL MEAN?"
//
// The RawExtraction (M-PR3) is immutable and never modified by normalization.
// Every normalized field remains traceable to its source in the raw material.
//
// HARD DETERMINISM: identical RawExtraction input (identical config) must
// always produce byte-identical output. No dependence on machine, time,
// locale, randomness, network, or AI.
// ============================================================================

// ============================================================================
// Normalization Status
// ============================================================================

/**
 * Per-field normalization status.
 *   NORMALIZED — transformed into canonical form with confidence
 *   UNCHANGED  — already in canonical form (or single canonical candidate)
 *   AMBIGUOUS  — multiple plausible canonical forms; value NOT guessed
 *   UNPARSED   — no parseable content in the raw value
 *   INVALID    — raw value does not match any canonical form
 */
export const NormalizationStatusSchema = z.enum([
  'NORMALIZED',
  'UNCHANGED',
  'AMBIGUOUS',
  'UNPARSED',
  'INVALID',
]);
export type NormalizationStatus = z.infer<typeof NormalizationStatusSchema>;

// ============================================================================
// Normalized Value Types
// ============================================================================

/**
 * Canonical type assignments produced by the normalizer.
 * 'other' is the conservative fallback for unrecognized types.
 */
export const NormalizedValueTypeSchema = z.enum([
  'string',
  'number',
  'integer',
  'date',
  'datetime',
  'uuid',
  'email',
  'phone',
  'url',
  'currency',
  'fraction',
  'ratio',
  'code',
  'other',
]);
export type NormalizedValueType = z.infer<typeof NormalizedValueTypeSchema>;

// ============================================================================
// Source Reference
//
// JSON-safe pointer to the origin material in the RawExtraction.
// Deliberately does NOT re-type the format-native SourceLocation union
// (which lives in @indago/intelligence/ingestion). Kind mirrors the
// source-location `kind` discriminant; detail is a JSON-safe mirror.
// ============================================================================

export const SourceReferenceKindSchema = z.enum([
  'pdf-page',
  'docx-block',
  'docx-table',
  'txt-line',
  'csv-cell',
  'json-root',
  'xml-root',
  'ocr-line',
]);
export type SourceReferenceKind = z.infer<typeof SourceReferenceKindSchema>;

export const SourceReferenceSchema = z.object({
  kind: SourceReferenceKindSchema
    .describe('Mirrors the RawExtraction source-location kind'),
  detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
    .describe('JSON-safe mirror of format-native provenance (page/line/row/column/block/path)'),
}).strict();
export type SourceReference = z.infer<typeof SourceReferenceSchema>;

// ============================================================================
// Normalized Field
//
// Every canonical field keeps its raw value, its canonical type, its
// normalization status, its confidence, and its source reference.
// normalizedValue is null when the value was NOT selected as canonical
// (AMBIGUOUS / UNPARSED / INVALID); rawValue is ALWAYS preserved.
// ============================================================================

export const NormalizedFieldSchema = z.object({
  rawValue: z.string().max(100000)
    .describe('Original value verbatim from the RawExtraction'),
  normalizedValue: z.string().max(100000).nullable()
    .describe('Canonical form, or null when not selected (AMBIGUOUS/UNPARSED/INVALID)'),
  type: NormalizedValueTypeSchema,
  normalizationStatus: NormalizationStatusSchema,
  confidence: AnalyticalConfidenceSchema
    .describe('Confidence in the canonical assignment. NOT a probability.'),
  sourceReference: SourceReferenceSchema,
}).strict();
export type NormalizedField = z.infer<typeof NormalizedFieldSchema>;

// ============================================================================
// Cleanliness Flags
//
// Deterministic flags describing which normalization transforms were applied.
// Presence (true) does not imply semantic importance — it is mechanical
// cleanliness metadata only.
// ============================================================================

export const CleanlinessFlagsSchema = z.object({
  whitespaceCollapsed: z.boolean().optional(),
  controlCharsRemoved: z.boolean().optional(),
  bomStripped: z.boolean().optional(),
  lineEndingsNormalized: z.boolean().optional(),
  unicodeNormalized: z.boolean().optional(),
  htmlEntitiesDecoded: z.boolean().optional(),
  trailingPunctuationTrimmed: z.boolean().optional(),
}).strict();
export type CleanlinessFlags = z.infer<typeof CleanlinessFlagsSchema>;

// ============================================================================
// OCR Quality Summary
//
// M-A05 never reruns OCR. When the RawExtraction was produced by OCR, its
// existing OCR confidence/provenance is summarized here unchanged.
// ============================================================================

export const OcrQualitySummarySchema = z.object({
  applied: z.boolean()
    .describe('Whether the raw material was OCR-derived'),
  provider: z.string().optional()
    .describe('OCR provider identity from the extraction'),
  meanConfidence: z.number().min(0).max(1).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  lineCount: z.number().int().nonnegative().optional(),
}).strict();
export type OcrQualitySummary = z.infer<typeof OcrQualitySummarySchema>;

// ============================================================================
// Warnings Digest
//
// Count + per-code breakdown of the raw extraction warnings. Original
// warnings are NEVER modified; this is a deterministic digest only.
// ============================================================================

export const WarningsDigestSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  byCode: z.record(z.string(), z.number().int().nonnegative())
    .describe('Warning code → occurrence count at extraction time'),
}).strict();
export type WarningsDigest = z.infer<typeof WarningsDigestSchema>;

// ============================================================================
// Language Metadata
//
// Quality/metadata ONLY. Deterministic heuristic detection.
// No translation, no semantics.
// ============================================================================

export const LanguageMetadataSchema = z.object({
  code: z.string().regex(/^[a-z]{2}(-[A-Za-z0-9]+)?$/)
    .describe('BCP-47-ish lowercase language tag'),
  confidence: AnalyticalConfidenceSchema,
}).strict();
export type LanguageMetadata = z.infer<typeof LanguageMetadataSchema>;

// ============================================================================
// Quality Metadata
//
// Descriptive quality of the canonical representation:
//   - completeness (0..1)
//   - per-field confidence (aligned, same order as canonicalFields)
//   - normalization status counts
//   - mechanical cleanliness flags
//   - OCR summary (when applicable)
//   - warnings digest
//   - optional detected language
//
// NOT investigative importance, NOT vanity metrics.
// ============================================================================

export const QualityMetadataSchema = z.object({
  completeness: z.number().min(0).max(1)
    .describe('Proportion of material successfully normalized'),
  statusCounts: z.object({
    normalized: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    ambiguous: z.number().int().nonnegative(),
    unparsed: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
  }).strict(),
  perFieldConfidence: z.array(z.number().min(0).max(1))
    .describe('Confidence per canonical field, same order as canonicalFields'),
  cleanliness: CleanlinessFlagsSchema,
  warnings: WarningsDigestSchema,
  ocr: OcrQualitySummarySchema.optional()
    .describe('Present only for OCR-derived raw material'),
  language: LanguageMetadataSchema.optional()
    .describe('Heuristic language metadata when confidently detected'),
}).strict();
export type QualityMetadata = z.infer<typeof QualityMetadataSchema>;

// ============================================================================
// Lexical Statistics
//
// Bounded, deterministic statistical features of the CONTENT.
// These are statistics about tokens — NOT "interesting terms", NOT a
// semantic assessment. Ordering is deterministic (descending count,
// tie-broken lexicographically). All collections are hard-capped so the
// output stays bounded for any input.
// ============================================================================

export const LexicalTokenEntrySchema = z.object({
  token: z.string().min(1),
  count: z.number().int().positive(),
}).strict();
export type LexicalTokenEntry = z.infer<typeof LexicalTokenEntrySchema>;

export const LexicalBigramEntrySchema = z.object({
  bigram: z.string().min(1)
    .describe('Space-joined lowercased token pair'),
  count: z.number().int().positive(),
}).strict();
export type LexicalBigramEntry = z.infer<typeof LexicalBigramEntrySchema>;

export const LexicalStatisticsSchema = z.object({
  tokenCount: z.number().int().nonnegative()
    .describe('Total tokens counted'),
  uniqueTokenCount: z.number().int().nonnegative()
    .describe('Distinct tokens'),
  averageTokenLength: z.number().min(0)
    .describe('Mean token character length (0 when empty)'),
  topTokens: z.array(LexicalTokenEntrySchema)
    .describe('Highest-frequency tokens (hard-capped, deterministic order)'),
  topBigrams: z.array(LexicalBigramEntrySchema)
    .describe('Highest-frequency token bigrams (hard-capped, deterministic order)'),
}).strict();
export type LexicalStatistics = z.infer<typeof LexicalStatisticsSchema>;

// ============================================================================
// Normalization Config
//
// Explicit, versionable policy. No hidden environment configuration.
// Changing a policy version is a version bump, not a silent behavior change.
// ============================================================================

export const NormalizationConfigSchema = z.object({
  policyVersion: z.string().min(1)
    .describe('Overall normalization policy version'),
  datePolicyVersion: z.string().min(1),
  numberPolicyVersion: z.string().min(1),
  unicodePolicyVersion: z.string().min(1),
  tokenHints: z.object({
    maxTokens: z.number().int().positive(),
    maxUniqueTokens: z.number().int().positive(),
    maxTopTokens: z.number().int().positive(),
    maxTopBigrams: z.number().int().positive(),
    maxTokenLength: z.number().int().positive()
      .describe('Tokens longer than this are truncated before counting'),
  }).strict(),
  bounds: z.object({
    maxFields: z.number().int().positive()
      .describe('Hard cap on canonicalFields produced'),
    maxFieldLength: z.number().int().positive()
      .describe('Raw values longer than this are truncated in canonicalFields'),
  }).strict(),
}).strict();
export type NormalizationConfig = z.infer<typeof NormalizationConfigSchema>;

export const DEFAULT_NORMALIZATION_CONFIG: NormalizationConfig = {
  policyVersion: 'indago-normalization-policy@1',
  datePolicyVersion: 'date-policy@1',
  numberPolicyVersion: 'number-policy@1',
  unicodePolicyVersion: 'unicode-policy@1',
  tokenHints: {
    maxTokens: 100000,
    maxUniqueTokens: 50000,
    maxTopTokens: 20,
    maxTopBigrams: 20,
    maxTokenLength: 128,
  },
  bounds: {
    maxFields: 5000,
    maxFieldLength: 100000,
  },
};

// ============================================================================
// Normalization Provenance
//
// Identity context attached when assembling a NormalizedExtraction.
// artifactId comes from the RawExtraction itself; attemptId, investigationId
// and caseId are supplied by the orchestrating worker.
// ============================================================================

export const NormalizationProvenanceSchema = z.object({
  attemptId: IngestionAttemptIdSchema,
  investigationId: InvestigationIdSchema,
  caseId: CaseIdSchema,
}).strict();
export type NormalizationProvenance = z.infer<typeof NormalizationProvenanceSchema>;

// ============================================================================
// Normalized Extraction
//
// The persisted, canonical representative of ONE ingestion attempt.
// attemptId is unique — at most one normalized row per attempt.
// ============================================================================

export const NormalizedExtractionSchema = z.object({
  attemptId: IngestionAttemptIdSchema,
  artifactId: ArtifactIdSchema,
  investigationId: InvestigationIdSchema,
  caseId: CaseIdSchema,
  normalizerId: z.string().min(1)
    .describe('Identity of the normalization engine'),
  normalizerVersion: z.string().min(1)
    .describe('Version of the normalization engine'),
  config: NormalizationConfigSchema,
  canonicalFields: z.array(NormalizedFieldSchema)
    .describe('Canonical fields, deterministic order, hard-capped by config bounds'),
  quality: QualityMetadataSchema,
  lexicalStatistics: LexicalStatisticsSchema,
}).strict();
export type NormalizedExtraction = z.infer<typeof NormalizedExtractionSchema>;