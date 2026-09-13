// ============================================================================
// Runtime capability surface (@indago/ai-agent-runtime)
//
// Reflects what the currently configured provider/runtime can execute. Kept
// tiny and explicit: V1 offers ONLY bounded structured inference — no tools,
// no autonomous loops, no agent capabilities.
// ============================================================================

export interface AiRuntimeCapabilities {
  /** Bounded plain-text generation. */
  readonly generate: boolean;
  /** Bounded JSON-mode generation validated against a caller-supplied zod schema. */
  readonly generateStructured: boolean;
  readonly healthCheck: boolean;
}

/** Friendly snapshot for feature packages deciding what to request. */
export function defaultCapabilities(): AiRuntimeCapabilities {
  return { generate: true, generateStructured: true, healthCheck: true };
}