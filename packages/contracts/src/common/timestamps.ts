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
