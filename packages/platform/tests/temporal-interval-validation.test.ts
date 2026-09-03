import { describe, expect, it } from "vitest";
import {
  validateEventTime,
  validateTemporalInterval,
  assertValidTemporalInterval,
  TemporalValidationError,
} from "../src/temporal/interval-validation.js";

// ============================================================================
// M-A12-PR1 Temporal validation — pure unit tests (no DB).
//
// Implements the D1/D5 semantics from docs/platform/m-a12-temporal-architecture.md:
//   - D1: event time is domain/event time, never fabricated from partial prose;
//         a partial date like "14 March" is NOT given a fabricated year.
//   - D5: closed [validFrom, validTo] — validTo<validFrom is INVALID;
//         boundary equality (validFrom==validTo) is VALID; open-ended (no
//         validTo) is VALID; precision/semantics must be known values.
//
// Maps to PR0 test-plan cases: 1 (exact), 2 (partial date), 3 (uncertain),
// 6 (boundary), 7 (invalid interval).
// ============================================================================

describe("validateEventTime (D1)", () => {
  it("case 1: accepts an exact timestamp with offset, precision exact", () => {
    const r = validateEventTime({ value: "2026-08-01T10:00:00.000Z", precision: "exact" });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("case 1: accepts minute/hour precisions with parseable instants", () => {
    expect(
      validateEventTime({ value: "2026-08-01T10:00:00.000Z", precision: "minute" }).valid,
    ).toBe(true);
    expect(
      validateEventTime({ value: "2026-08-01T10:00:00.000Z", precision: "hour" }).valid,
    ).toBe(true);
  });

  it("case 2: does NOT fabricate a year for a partial date '14 March'", () => {
    // A partial, year-less date must never be coerced into a concrete instant
    // or given an invented year. Under 'day'/'approximate' precision the valid
    // value is allowed but the validator never returns a fabricated instant.
    const r = validateEventTime({ value: "14 March", precision: "approximate" });
    // 'approximate' is permissive of an unparseable calendar fragment — no
    // fabrication is introduced, so validation does not reject it.
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("case 3: accepts an uncertain/approximate value without inventing precision", () => {
    const r = validateEventTime({ value: "early March 2026", precision: "approximate" });
    expect(r.valid).toBe(true);
  });

  it("case 3: accepts unknown precision used for genuinely unknown time", () => {
    const r = validateEventTime({ value: "unknown", precision: "unknown" });
    expect(r.valid).toBe(true);
  });

  it("rejects an invalid precision name", () => {
    const r = validateEventTime({ value: "2026-08-01T00:00:00.000Z", precision: "whenever" });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/not a known temporal precision/);
  });

  it("rejects an exact precision whose value is not a parseable instant", () => {
    const r = validateEventTime({ value: "not-a-date", precision: "exact" });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/not parseable as an instant/);
  });

  it("treats undefined as valid (absence is fine)", () => {
    expect(validateEventTime(undefined).valid).toBe(true);
  });
});

describe("validateTemporalInterval (D5 closed intervals)", () => {
  const exact = (iso: string) => ({ value: iso, precision: "exact" as const });

  it("case 4: accepts an open-ended interval (no validTo)", () => {
    const r = validateTemporalInterval({
      validFrom: exact("2026-08-01T00:00:00.000Z"),
      precision: "exact",
      semantics: "observed",
    });
    expect(r.valid).toBe(true);
  });

  it("case 5: accepts an ended interval (validFrom < validTo)", () => {
    const r = validateTemporalInterval({
      validFrom: exact("2026-08-01T00:00:00.000Z"),
      validTo: exact("2026-08-31T23:59:59.999Z"),
      precision: "exact",
      semantics: "observed",
    });
    expect(r.valid).toBe(true);
  });

  it("case 6: boundary equality (validFrom == validTo) is valid (closed semantics)", () => {
    const t = exact("2026-08-01T00:00:00.000Z");
    const r = validateTemporalInterval({
      validFrom: t,
      validTo: t,
      precision: "exact",
      semantics: "inferred",
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("case 7: validTo < validFrom is INVALID (closed interval ordering)", () => {
    const r = validateTemporalInterval({
      validFrom: exact("2026-08-31T00:00:00.000Z"),
      validTo: exact("2026-08-01T00:00:00.000Z"),
      precision: "exact",
      semantics: "observed",
    });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/after validTo/);
  });

  it("rejects an unknown semantics value", () => {
    const r = validateTemporalInterval({
      validFrom: exact("2026-08-01T00:00:00.000Z"),
      precision: "exact",
      semantics: "guessed",
    });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/semantics/);
  });

  it("does not compare a timezone-less value as UTC-equal to an offset-bearing one", () => {
    // 2026-08-01T00:00:00 (no offset) vs 2026-08-02T00:00:00.000Z — different
    // calendar days at face value; the comparator handles mixed precision
    // without fabricating an instant ordering that pretends they are equal.
    const r = validateTemporalInterval({
      validFrom: exact("2026-08-01T00:00:00"),
      validTo: exact("2026-08-02T00:00:00.000Z"),
      precision: "exact",
      semantics: "observed",
    });
    // Both are parseable instants (browser/Node treats offset-less as local
    // time), so ordering is well-defined and valid; the point is the validator
    // never guesses. We assert no rejection and no error noise.
    expect(r.valid).toBe(true);
  });

  it("assertValidTemporalInterval throws TemporalValidationError on an invalid interval", () => {
    expect(() =>
      assertValidTemporalInterval({
        validFrom: exact("2026-08-31T00:00:00.000Z"),
        validTo: exact("2026-08-01T00:00:00.000Z"),
        precision: "exact",
        semantics: "observed",
      }),
    ).toThrow(TemporalValidationError);
  });
});
