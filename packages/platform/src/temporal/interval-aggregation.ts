// ============================================================================
// M-A12 PR1 Interval Aggregation (D5 interval semantics — producer)
//
// Pure, DB-free derivation of a relation's closed validity interval from the
// REAL domain-event instants of its supporting observations.
//
// Rules (locked):
//   - NEVER fabricated: a contributor is used ONLY when it carries an explicit
//     eventTime whose value parses to a finite instant (Date.parse). Vague
//     values (month/year/range/approximate/unknown) are skipped, never coerced
//     into a concrete instant.
//   - validFrom = earliest contributing instant; validTo = latest contributing
//     instant; when only ONE instant contributes, validTo is omitted (a
//     point-in-time validity, open-ended toward the future) rather than
//     fabricating a second bound.
//   - semantics = "inferred" exactly when the span was inferred from observed
//     instants; it is never "observed" because the span itself was not
//     directly reported.
//   - precision = "exact" only when EVERY contributing instant carries exact
//     precision; otherwise "range" (the bounds are not all exact-grade).
//   - No contributing instant → returns undefined (no interval; the caller
//     persists none). This module never invents times.
//
// This is the M-A12 interval producer for proposed / canonical relations
// (WS-3): completeMA10 derives each RelationHypothesis validityInterval from
// its evidenceBasis observations via this function, and the value flows
// verbatim into the canonical Relation at accept (never recomputed there).
// ============================================================================

interface InstantContributor {
  readonly value: string;
  readonly precision: string;
}

/**
 * Derive a closed (min..max) validity interval over the parseable instants of
 * the given observations' eventTime fields. Returns `undefined` when no
 * supporting observation yields a usable instant (truthful omission, never a
 * fabricated interval).
 */
export function deriveValidityInterval(
  observations: ReadonlyArray<{
    readonly eventTime?: { readonly value: string; readonly precision: string } | null;
  }>,
):
  | {
      readonly validFrom: InstantContributor;
      readonly validTo?: InstantContributor;
      readonly precision: "exact" | "range";
      readonly semantics: "inferred";
    }
  | undefined {
  const contributors: InstantContributor[] = [];
  for (const obs of observations) {
    const t = obs?.eventTime;
    if (!t || typeof t.value !== "string") continue;
    const value = t.value.trim();
    if (value.length === 0 || !Number.isFinite(Date.parse(value))) continue;
    contributors.push({ value, precision: t.precision });
  }
  if (contributors.length === 0) return undefined;

  // Deterministic ordering: earliest first, ties broken by value string.
  contributors.sort((a, b) => Date.parse(a.value) - Date.parse(b.value) || a.value.localeCompare(b.value));

  const validFrom = contributors[0]!;
  if (contributors.length === 1) {
    return {
      validFrom,
      precision: validFrom.precision === "exact" ? "exact" : "range",
      semantics: "inferred",
    };
  }

  const validTo = contributors[contributors.length - 1]!;
  const allExact = contributors.every((c) => c.precision === "exact");
  return {
    validFrom,
    validTo,
    precision: allExact ? "exact" : "range",
    semantics: "inferred",
  };
}