import { z } from 'zod';

// ============================================================================
// Timestamp Schemas
//
// INDAGO distinguishes multiple temporal semantics.
// Do not confuse event time with ingestion time.
// ============================================================================

export const TimestampPrecisionSchema = z.enum([
  'exact',
  'minute',
  'hour',
  'day',
  'month',
  'year',
  'range',
  'approximate',
  'unknown',
]);
export type TimestampPrecision = z.infer<typeof TimestampPrecisionSchema>;

/**
 * When the domain event actually occurred in the real world.
 */
export const EventTimeSchema = z.object({
  value: z.string().describe('ISO 8601 timestamp or range'),
  precision: TimestampPrecisionSchema,
}).strict();
export type EventTime = z.infer<typeof EventTimeSchema>;

/**
 * When the source/reporting system recorded the event.
 */
export const ReportedTimeSchema = z.object({
  value: z.string().describe('ISO 8601 timestamp'),
  precision: TimestampPrecisionSchema,
}).strict();
export type ReportedTime = z.infer<typeof ReportedTimeSchema>;

/**
 * When INDAGO observed/recorded the data point.
 */
export const ObservedTimeSchema = z.object({
  value: z.string().describe('ISO 8601 timestamp'),
  precision: z.literal('exact'),
}).strict();
export type ObservedTime = z.infer<typeof ObservedTimeSchema>;

/**
 * When the data entered the INDAGO system.
 * Reserved for data ingestion — do not use for system-generated actions.
 */
export const IngestionTimeSchema = z.object({
  value: z.string().describe('ISO 8601 timestamp'),
  precision: z.literal('exact'),
}).strict();
export type IngestionTime = z.infer<typeof IngestionTimeSchema>;

/**
 * Database/transaction timestamp.
 */
export const TransactionTimeSchema = z.object({
  value: z.string().describe('ISO 8601 timestamp'),
  precision: z.literal('exact'),
}).strict();
export type TransactionTime = z.infer<typeof TransactionTimeSchema>;

/**
 * Generic temporal interval with semantics.
 */
export const TemporalIntervalSchema = z.object({
  validFrom: EventTimeSchema,
  validTo: EventTimeSchema.optional(),
  precision: TimestampPrecisionSchema,
  semantics: z.enum([
    'observed',
    'inferred',
    'hypothesized',
  ]).describe('Whether this interval is directly observed, inferred from evidence, or hypothesized'),
}).strict();
export type TemporalInterval = z.infer<typeof TemporalIntervalSchema>;

/**
 * Temporal assertion — the smallest durable record of a domain-validity claim
 * about a canonical relation (M-A12 amendments).
 *
 * Bi-temporal discipline (never "latest evidence wins"):
 *   - ORIGINAL assertions and AMENDMENT assertions COEXIST in an append-only
 *     array on the canonical Relation (`temporalAssertions` column). Amending
 *     NEVER overwrites or deletes an earlier assertion.
 *   - `kind` distinguishes the original claim from later corrections.
 *   - `validityInterval` is the DOMAIN-validity interval claimed by THIS
 *     assertion (a correction targets the real-world boundary, e.g. "A–B ended
 *     Feb 10", NOT the correction time).
 *   - `revisionAtVersionNumber` is the graph-revision (system axis) at which
 *     this assertion became known — the version boundary when the correction
 *     entered the authoritative revision chain.
 *   - `supersedesAssertionId` links a correction to its predecessor so the
 *     original → correction relationship is explicit and traversable.
 *   - `provenance` carries the source of the correction (which evidence /
 *     authority produced it), distinct from the domain validity itself.
 *
 * `validFrom == validTo` is legal (instantaneous); open-ended validTo is legal;
 * `validTo < validFrom` is INVALID (D5) — enforced by interval validation at
 * the authority boundary, never here.
 */
export const TemporalAssertionSchema = z.object({
  id: z.string().describe('Deterministic id of this assertion record'),
  relationId: z.string().describe('Canonical relation the assertion concerns'),
  kind: z.enum(['ORIGINAL', 'AMENDMENT'])
    .describe('ORIGINAL = first recorded claim; AMENDMENT = a later correction'),
  validityInterval: TemporalIntervalSchema
    .describe('Domain-validity interval claimed by this assertion (never the correction time)'),
  provenance: z.record(z.string(), z.unknown()).optional()
    .describe('Source/provenance of the claim (which evidence/authority produced it)'),
  supersedesAssertionId: z.string().optional()
    .describe('For AMENDMENT: the ORIGINAL (or prior amendment) id it corrects'),
  revisionAtVersionNumber: z.number().int().positive()
    .describe('Graph revision at which this assertion became known (system axis)'),
}).strict();
export type TemporalAssertion = z.infer<typeof TemporalAssertionSchema>;
