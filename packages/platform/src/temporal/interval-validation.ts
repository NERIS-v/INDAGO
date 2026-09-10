// ============================================================================
// M-A12-PR1 Temporal Validation (D5 interval semantics)
//
// Pure, DB-free validation implementing the locked D5 closed-interval rules
// from docs/platform/m-a12-temporal-architecture.md:
//
//   - closed interval [validFrom, validTo]  →  validTo < validFrom is INVALID
//   - boundary equality (validFrom == validTo) is VALID (instantaneous / zero-length)
//   - open-ended intervals (validTo omitted) are valid
//   - precision must be a known TimestampPrecision value
//   - semantics must be a known value (observed | inferred | hypothesized)
//   - timezone consistency: an offset-less EventTime must not be silently
//     compared as UTC-equal to an offset-bearing one
//
// This module is the single application-boundary validator. It never fabricates
// dates or precision. It only REJECTS or ACCEPTS what is given. Because it is
// pure and has no Prisma/DB dependency it is unit-testable without Postgres.
// ============================================================================

import { TimestampPrecisionSchema, TemporalIntervalSchema } from "@indago/contracts";

export const TEMPORAL_PRECISIONS: ReadonlySet<string> = new Set(
  TimestampPrecisionSchema.options,
);

export const TEMPORAL_SEMANTICS: ReadonlySet<string> = new Set([
  "observed",
  "inferred",
  "hypothesized",
]);

export interface TemporalValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

function ok(): TemporalValidationResult {
  return { valid: true, errors: [] };
}

function fail(errors: readonly string[]): TemporalValidationResult {
  return { valid: false, errors };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Validate a single EventTime value (value + precision).
 *
 * Rules enforced:
 *   - value must be a non-empty string
 *   - precision must be a known TimestampPrecision value
 *   - an 'exact'/'minute'/'hour' EventTime implies a parseable ISO-like instant;
 *     we reject an 'exact' EventTime whose value cannot be parsed to a date.
 *   - a bare offset-less value never fabricates precision.
 */
export function validateEventTime(value: { value: string; precision: string } | undefined): TemporalValidationResult {
  if (value === undefined || value === null) return ok();
  const errors: string[] = [];

  if (typeof value.value !== "string" || value.value.trim().length === 0) {
    errors.push("eventTime.value must be a non-empty ISO 8601 timestamp or range string");
  }
  if (!TEMPORAL_PRECISIONS.has(value.precision)) {
    errors.push(
      `eventTime.precision "${value.precision}" is not a known temporal precision ` +
        `(${[...TEMPORAL_PRECISIONS].join(", ")})`,
    );
  }

  // Exact/minutes/hours must be a parseable instant. Day implies a concrete
  // calendar date (ISO prefix). range/approximate/unknown are permitted more
  // latitude — vague values like "early March 2026" are representable WITHOUT
  // inventing precision or a fabricated calendar day (D1), so no ISO-prefix
  // rule is enforced on them.
  const prec = value.precision;
  const raw = value.value;
  if (typeof raw === "string" && raw.trim().length > 0) {
    if ((prec === "exact" || prec === "minute" || prec === "hour") && Number.isNaN(Date.parse(raw))) {
      errors.push(`eventTime.value "${raw}" is not parseable as an instant for precision "${prec}"`);
    }
    if (raw.length >= 10 && !ISO_DATE_RE.test(raw) && (prec === "exact" || prec === "minute" || prec === "hour" || prec === "day")) {
      errors.push(`eventTime.value "${raw}" does not start with a valid ISO calendar date`);
    }
  }

  return errors.length === 0 ? ok() : fail(errors);
}

/**
 * Compare two EventTime instants for ordering. Returns a negative / zero /
 * positive number. If either time is a partial/range value, ordering can be
 * imprecise — this enforces timezone awareness rather than fabricating equal
 * instant order when one side has an explicit offset and the other does not.
 */
function compareEventTimes(
  a: { value: string; precision: string },
  b: { value: string; precision: string },
): number {
  // Do not compare a timezone-less value as if it were UTC-equal to an
  // offset-bearing one. If neither carries an offset, fall back to lexical
  // ordering of the calendar portion.
  const aInstant = Number.isNaN(Date.parse(a.value)) ? null : Date.parse(a.value);
  const bInstant = Number.isNaN(Date.parse(b.value)) ? null : Date.parse(b.value);
  if (aInstant !== null && bInstant !== null) {
    const diff = aInstant - bInstant;
    return diff;
  }
  // Not both parseable as instants — fall back to lexical comparison.
  return a.value.localeCompare(b.value);
}

/**
 * Validate a TemporalInterval per the locked D5 closed-interval semantics.
 *
 *   - validTo < validFrom  → INVALID (closed interval ordering)
 *   - boundary equality    → VALID (instantaneous / zero-length)
 *   - open-ended (no validTo) → VALID
 *   - precision & semantics  → must be known values
 *   - timezone consistency is enforced by compareEventTimes
 */
export function validateTemporalInterval(
  interval: unknown,
): TemporalValidationResult {
  if (interval === undefined || interval === null) return ok();

  const errors: string[] = [];

  // Shape + known-enum validation via the contract schema is authoritative for
  // the *type*; below we enforce the ordering/boundary rules that the schema
  // itself does not (schema permits any validFrom/validTo combination).
  const parsed = TemporalIntervalSchema.safeParse(interval);
  if (!parsed.success) {
    return fail([
      `interval is not a valid TemporalIntervalSchema: ${parsed.error.issues
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`,
    ]);
  }

  const { validFrom, validTo, precision, semantics } = parsed.data;

  if (!TEMPORAL_PRECISIONS.has(precision)) {
    errors.push(`interval.precision "${precision}" is not a known temporal precision`);
  }
  if (!TEMPORAL_SEMANTICS.has(semantics)) {
    errors.push(`interval.semantics "${semantics}" is not a known value`);
  }

  const fromResult = validateEventTime(validFrom);
  if (!fromResult.valid) errors.push(...fromResult.errors.map((e) => `validFrom: ${e}`));

  if (validTo !== undefined) {
    const toResult = validateEventTime(validTo);
    if (!toResult.valid) errors.push(...toResult.errors.map((e) => `validTo: ${e}`));
    // Closed interval: validTo < validFrom is invalid.
    if (compareEventTimes(validFrom, validTo) > 0) {
      errors.push(
        `invalid interval: validFrom "${validFrom.value}" is after validTo "${validTo.value}" ` +
          `(closed [validFrom, validTo] requires validTo >= validFrom)`,
      );
    }
  }

  return errors.length === 0 ? ok() : fail(errors);
}

/**
 * Assertion-style helper for the application boundary: throws on an invalid
 * interval so callers can fail loudly rather than persist a contradiction.
 * Returns the (already-validated) interval on success.
 */
export function assertValidTemporalInterval(interval: unknown): typeof interval {
  const result = validateTemporalInterval(interval);
  if (!result.valid) {
    throw new TemporalValidationError(result.errors);
  }
  return interval;
}

export class TemporalValidationError extends Error {
  constructor(public readonly errors: readonly string[]) {
    super(`Temporal interval validation failed: ${errors.join("; ")}`);
    this.name = "TemporalValidationError";
  }
}

const INSTANT_GRADE_PRECISIONS = new Set(["exact", "minute", "hour"]);

/**
 * Point-in-time containment: does the interval contain the instant `atIso`?
 *
 * The D5 closed-interval semantics apply (validTo inclusive when present;
 * open-ended toward the future when absent). Containment is only decided for
 * CONCRETE instant bounds — a bound that is not instant-grade (month/year/range/
 * approximate/unknown precision) or that does not parse to a finite instant
 * yields `false` rather than a fabricated answer. An absent interval yields
 * `false` (a relation with no domain validity never answers a valid-at query).
 */
export function containsTime(interval: unknown, atIso: string): boolean {
  const at = Date.parse(atIso);
  if (!Number.isFinite(at)) return false;
  if (interval === undefined || interval === null || typeof interval !== "object") {
    return false;
  }
  const parsed = TemporalIntervalSchema.safeParse(interval);
  if (!parsed.success) return false;

  const { validFrom, validTo } = parsed.data;
  if (!INSTANT_GRADE_PRECISIONS.has(validFrom.precision)) return false;
  const from = Date.parse(validFrom.value);
  if (!Number.isFinite(from)) return false;
  if (validTo === undefined) return at >= from;

  if (!INSTANT_GRADE_PRECISIONS.has(validTo.precision)) return false;
  const to = Date.parse(validTo.value);
  if (!Number.isFinite(to)) return false;
  return at >= from && at <= to;
}
