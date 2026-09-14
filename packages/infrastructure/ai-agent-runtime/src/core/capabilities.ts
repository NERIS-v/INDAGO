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
  /** Schema-backed structured generation: the provider must enforce the converted JSON Schema natively (structuredOutput AND nativeJsonSchema), then the result is parsed and zod-validated. No silent fallback. */
  readonly generateStructured: boolean;
  /** The currently configured provider can enforce structured output. */
  readonly structuredOutput: boolean;
  /** The currently configured provider accepts the runtime's JSON Schema verbatim. */
  readonly nativeJsonSchema: boolean;
  readonly healthCheck: boolean;
}

/** Friendly snapshot for feature packages deciding what to request. */
export function defaultCapabilities(): AiRuntimeCapabilities {
  return {
    generate: true,
    generateStructured: true,
    structuredOutput: true,
    nativeJsonSchema: true,
    healthCheck: true,
  };
}