// ============================================================================
// Structured output — JSON recovery (@indago/ai-agent-runtime)
//
// Providers do not always return clean JSON. We apply a SMALL, fully
// deterministic, documented recovery set BEFORE schema validation:
//   1. try the raw trimmed text
//   2. strip a ```lang / ``` markdown fence, if present
//   3. slice the outermost balanced-ish `{...}` region (handles extra prose
//      around a JSON object)
//
// That is ALL we do. There is NO arbitrary repair: no quote fixing, no
// character cleaning, no "make it fit" mutation of model output. Truncated,
// empty or malformed output → STRUCTURED_OUTPUT_INVALID. Parse → validate →
// reject, never guess → repair → accept.
// ============================================================================

import { AiRuntimeError } from '../errors/ai-runtime-error.js';

const MARKDOWN_FENCE = /^```[a-zA-Z0-9_+-]*\r?\n?([\s\S]*?)(?:```\s*)?$/u;

export function parseJsonText(raw: string): unknown {
  const trimmed = raw.trim();
  const candidates: string[] = [trimmed];

  const fenced = MARKDOWN_FENCE.exec(trimmed);
  if (fenced?.[1] !== undefined && fenced[1].trim() !== '') {
    candidates.push(fenced[1].trim());
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = trimmed.slice(firstBrace, lastBrace + 1);
    if (slice !== trimmed) candidates.push(slice);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try the next deterministic candidate form.
    }
  }

  throw new AiRuntimeError('STRUCTURED_OUTPUT_INVALID', 'Provider output did not contain parsable JSON');
}