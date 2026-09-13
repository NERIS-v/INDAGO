// ============================================================================
// Runtime budget policy (@indago/ai-agent-runtime)
//
// ONE versioned, shared policy for all context/output bounds. The runtime
// REJECTS requests outside these bounds BEFORE any provider call — analytical
// context is never silently truncated. Feature packages learn that their
// context exceeds the boundary via the typed INPUT_TOO_LARGE /
// OUTPUT_LIMIT_EXCEEDED errors.
//
// These bounds are part of the runtime policy contract: a bump re-identifies
// execution semantics via AI_RUNTIME_POLICY_VERSION (see contracts) without
// touching provider/model/prompt/schema versioning.
// ============================================================================

export interface AiBudgets {
  /** Max total input characters (systemPrompt + all message content). Hard rejection, never truncation. */
  readonly maxInputChars: number;
  /** Max output tokens the runtime will request. Requests above it are rejected. */
  readonly maxOutputTokens: number;
  /** Max request messages (system message counts as one). */
  readonly maxRequestMessages: number;
  /** Default/ceiling request timeout in ms. */
  readonly timeoutMs: number;
  /** Max retries for transient failures. */
  readonly maxRetries: number;
  /** Exponential backoff base in ms. */
  readonly retryBaseDelayMs: number;
  /** Ceiling for any single backoff delay (incl. provider Retry-After hints) in ms. */
  readonly maxRetryDelayMs: number;
}

export const DEFAULT_AI_BUDGETS: AiBudgets = {
  maxInputChars: 120_000,
  maxOutputTokens: 8_192,
  maxRequestMessages: 32,
  timeoutMs: 60_000,
  maxRetries: 2,
  retryBaseDelayMs: 250,
  maxRetryDelayMs: 8_000,
};