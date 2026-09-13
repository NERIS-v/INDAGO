// ============================================================================
// Structured output — schema validation (@indago/ai-agent-runtime)
//
// Validation uses the FEATURE package's zod schema (e.g. GraphHoleAnalysisV1
// defined by the consumer). The runtime NEVER defines domain output schemas
// and NEVER invents a second schema system.
//
// Invariant: a response is NOT "successfully structured" because the provider
// returned HTTP 200 — it must pass the supplied zod schema.
//
// Error safety: only issue PATHS (schema keys) are surfaced, never received
// values, so a hostile/echoing model response cannot leak secrets through the
// thrown error.
// ============================================================================

import type { z } from 'zod';

import { AiRuntimeError } from '../errors/ai-runtime-error.js';
import { parseJsonText } from './parse.js';

export function validateStructured<T>(parsed: unknown, schema: z.ZodType<T>): T {
  const result = schema.safeParse(parsed);
  if (result.success) return result.data;

  const paths = result.error.issues
    .slice(0, 12)
    .map((issue) => issue.path.join('.') || '(root)');
  const summary = paths.length > 0 ? `: ${paths.join(', ')}` : '';
  const message = `Structured output failed zod validation (${result.error.issues.length} issue(s)${summary})`;

  throw new AiRuntimeError('SCHEMA_VALIDATION_FAILED', message, {
    cause: new Error(`Schema issues at: ${summary.replace(/^: /, '') || 'unknown'}`),
  });
}

/** parse → validate → reject. The single structured-entry path used by the runtime. */
export function parseStructured<T>(raw: string, schema: z.ZodType<T>): T {
  const parsed = parseJsonText(raw);
  return validateStructured(parsed, schema);
}