// ============================================================================
// Provider HTTP helpers (@indago/ai-agent-runtime)
//
// Small shared helpers only. Providers keep their own endpoint/body/error
// semantics; this file avoids duplicating Retry-After parsing.
// ============================================================================

/** Parses an HTTP Retry-After header (seconds or HTTP-date) into ms. Undefined when absent/unparsable. */
export function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number.parseInt(value, 10);
  if (Number.isInteger(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, Number.MAX_SAFE_INTEGER);
  }
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : 0;
  }
  return undefined;
}