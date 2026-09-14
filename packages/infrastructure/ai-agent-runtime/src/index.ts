// ============================================================================
// @indago/ai-agent-runtime — public surface
//
// Shared LLM EXECUTION infrastructure: HOW INDAGO talks to an LLM. It is NOT
// WHAT INDAGO believes or decides. The runtime owns no domain prompts, no
// domain schemas, no canonical state and no autonomous capabilities.
//
// Kept deliberately small: feature packages consume the runtime, the types,
// the errors and the provider factory — not implementation internals.
// ============================================================================

// ---- Runtime ----
export { createAiRuntime } from './core/runtime.js';
export type { AiRuntime, AiRuntimeOptions } from './core/runtime.js';

// ---- Core request/result types ----
export type {
  LLMRole,
  LLMResponseFormat,
  LLMMessage,
  LLMRequest,
  ResolvedLLMRequest,
  LLMFinishReason,
  LLMUsage,
  AiRuntimeEvent,
} from './core/types.js';

// ---- Capabilities ----
export type { AiRuntimeCapabilities } from './core/capabilities.js';
export { defaultCapabilities } from './core/capabilities.js';

// ---- Execution metadata ----
export type {
  LLMExecutionMetadata,
  LLMGenerationResult,
  LLMStructuredResult,
  ExecutionMetadataInput,
} from './metadata/execution.js';
export { buildExecutionMetadata } from './metadata/execution.js';

// ---- Configuration ----
export { loadAiConfig } from './config/load.js';
export type {
  AiConfig,
  AiProviderKind,
  BaseProviderConfig,
  GeminiProviderConfig,
  OllamaProviderConfig,
  AiRuntimePolicy,
} from './config/types.js';
export { AI_RUNTIME_POLICY } from './config/types.js';

// ---- Budgets ----
export type { AiBudgets } from './budgets/limits.js';
export { DEFAULT_AI_BUDGETS } from './budgets/limits.js';

// ---- Providers ----
export type {
  AIProvider,
  AIProviderHealth,
  LLMProviderResult,
  LlmProviderCapabilities,
  ProviderStructuredCapabilities,
} from './providers/types.js';
export { normalizeFinishReason } from './providers/types.js';
export { createLLMProvider } from './providers/factory.js';
export { GeminiProvider } from './providers/gemini.js';
export { OllamaGenerationProvider } from './providers/ollama.js';

// ---- Structured output (zod → native JSON Schema → parse → validate → reject) ----
export { parseJsonText } from './structured-output/parse.js';
export { validateStructured, parseStructured } from './structured-output/validate.js';
export { convertSchemaDocument } from './structured-output/schema.js';
export type {
  SchemaDocument,
  ConvertSchemaOptions,
} from './structured-output/schema.js';
export { MAX_SCHEMA_DEPTH, DEFAULT_MAX_SCHEMA_BYTES } from './structured-output/schema.js';

// ---- Errors ----
export { AiRuntimeError } from './errors/ai-runtime-error.js';
export type { AiRuntimeErrorCode } from './errors/ai-runtime-error.js';
export { TRANSIENT_AI_RUNTIME_ERROR_CODES, isTransientError, isAbortError } from './reliability/classification.js';