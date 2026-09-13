# AI Agent Runtime (`@indago/ai-agent-runtime`)

Shared LLM **execution** infrastructure for INDAGO.

> This package provides bounded LLM execution infrastructure. It does not make
> domain decisions and does not own domain prompts, schemas, canonical graph
> state, investigation state, or human authority.
>
> This package is separate from `@indago/semantic-retrieval` and does not
> replace or generalize the embedding provider.

## Purpose

INDAGO's analytical features (GraphHole AI, Ingestion AI, future
AI-assisted workflows) all talk to generative LLMs. Without a shared layer each
feature would re-implement provider SDKs, API-key handling, request
construction, structured-output handling, schema validation, timeouts, retry/
backoff, input/output bounds, execution metadata, typed errors and provider
selection — with subtle inconsistencies and secret-safety drift between them.

`@indago/ai-agent-runtime` is that shared layer. It answers **HOW INDAGO talks
to an LLM**, never **WHAT INDAGO believes or decides**.

## Scope

**In scope (V1):** bounded, structured LLM inference — `generate`,
`generateStructured`, `healthCheck`; Gemini + Ollama generation providers;
environment-backed configuration; zod schema validation; budgets; retry/
timeout; typed errors; execution metadata; secret safety.

**Out of scope (V1, hard):** web browsing, database tools, shell access,
filesystem tools, arbitrary function calling, agent loops, self-directed
planning, autonomous retries based on model decisions. No autonomous tools of
any kind.

## Provider abstraction

`createAiRuntime(config)` builds a small runtime around exactly one provider.

```ts
runtime.generate(request)            // plain text + metadata
runtime.generateStructured(request, zodSchema) // validated data + raw + metadata
runtime.healthCheck()                // reachability probe (never throws)
```

`AIProvider` is the single provider contract:

```
AIProvider
  ├─ capabilities       generate / generateStructured / healthCheck
  ├─ generate(request)  → LLMProviderResult (normalized text, usage, modelVersion)
  └─ healthCheck()      → AIProviderHealth (safe, never throws)
```

Provider selection is **deterministic**: `AI_PROVIDER=gemini|ollama`, built by
`createLLMProvider`. There is **no hidden fallback chain** — a Gemini outage
surfaces as a typed provider error; it is never silently served by Ollama (or
vice versa). A request that names a provider different from the runtime's is
rejected (`CONFIGURATION_ERROR`) rather than routed elsewhere.

Providers normalize their own HTTP semantics, response shapes, error formats
and usage reporting. Consumers contain **zero** `if provider === 'gemini'` /
`if provider === 'ollama'` execution branches. Provider-specific behavior lives
in `src/providers/gemini.ts` and `src/providers/ollama.ts`.

Provider-specific raw error objects never escape uncontrolled: every provider
failure becomes an `AiRuntimeError`; an unexpected raw error thrown inside the
retry loop is wrapped into `INVALID_PROVIDER_RESPONSE` with the original as
`cause`.

## Gemini provider

Implemented over the **current official Gemini REST API**:

```
POST {GEMINI_BASE_URL}/models/{model}:generateContent
```

Food for the transport choice: the repository uses native `fetch` everywhere
(no HTTP SDK dependencies, cf. the Ollama embedding provider), so Gemini uses
the same dependency-free transport — one timeout/retry/error path for all
providers. The official `@google/genai` SDK (current 2.x) is available but
would duplicate this provider's plumbing for no additional capability here.

- Auth: `x-goog-api-key` header only. The key never appears in URLs, logs,
  messages, errors, metadata or API results.
- Structured output: requested as a **JSON mode hint**
  (`responseMimeType: "application/json"`). Schema enforcement is done by the
  runtime with the caller's zod schema — never by provider-defined schemas.
- Model: configured (`GEMINI_DEFAULT_MODEL` / `AI_DEFAULT_MODEL` / per
  request). The runtime **never hardcodes a model**.
- Timeouts, retries, error mapping and `Retry-After` handling are shared
  reliability infrastructure, applied identically to Ollama.

## Ollama generation provider

A **separate** generation provider speaking the Ollama chat API:

```
POST {OLLAMA_BASE_URL}/api/chat    (stream: false)
GET  {OLLAMA_BASE_URL}/api/tags    (healthCheck)
```

This is **not** the `OllamaEmbeddingProvider` in `@indago/semantic-retrieval`.
Embeddings stay text→vector; this package is prompt/context→generative
response. The two never share implementation or abstractions. Structured output
uses Ollama's `format: "json"` mode as a hint; the runtime then enforces the
caller's zod schema.

Gemini and Ollama expose the same `generate` / `healthCheck` surface; a
consumer cannot tell which provider is behind a resolved runtime without
reading `metadata.provider`.

## Configuration

`loadAiConfig(env = process.env)` follows the repository config-loader pattern
(cf. `loadEmbeddingConfig`). Every value is **parsed, validated, bounded and
explicitly defaulted**; degenerate input (NaN, negatives, infinity, nonsense,
non-http URLs) is a hard `TypeError` at load time — never a silent fallback.

| Env var | Default | Meaning |
| --- | --- | --- |
| `AI_PROVIDER` | `ollama` | `gemini` \| `ollama`, explicit, no fallback |
| `AI_DEFAULT_MODEL` | (none) | global default model (never hardcoded) |
| `GEMINI_API_KEY` | `''` | required for `gemini`; factory refuses without it |
| `GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta` | Gemini REST base |
| `GEMINI_DEFAULT_MODEL` | from `AI_DEFAULT_MODEL` | per-provider default |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | local Ollama |
| `OLLAMA_DEFAULT_MODEL` | from `AI_DEFAULT_MODEL` | per-provider default |
| `AI_TIMEOUT_MS` | `60000` | request timeout ceiling |
| `AI_MAX_RETRIES` | `2` | bounded transient retries |
| `AI_RETRY_BASE_DELAY_MS` | `250` | exponential backoff base |
| `AI_MAX_RETRY_DELAY_MS` | `8000` | backoff ceiling |
| `AI_MAX_INPUT_CHARS` | `120000` | context bound (hard rejection) |
| `AI_MAX_OUTPUT_TOKENS` | `8192` | output bound |
| `AI_MAX_REQUEST_MESSAGES` | `32` | request message bound |

`.env.example` (platform package) documents placeholders only — never a real
key.

## Secret handling

Guaranteed: `GEMINI_API_KEY` never appears in logs, exceptions, metadata,
request traces, structured output, persisted records or API responses. Concretely:

- The key is sent **only** in the `x-goog-api-key` request header.
- Provider error payloads are **not read** into messages or causes — a hostile
  provider response that echoes a key back cannot leak it.
- Error messages mention status codes and safe provider/model identifiers only.
- Logging/observability events carry provider, model, latency, error code,
  retry count and usage — never prompts, context or responses.
- Full outbound request headers and full provider payloads are never logged by
  default.

The acceptance tests prove the key is absent from thrown errors, metadata,
serialized results, observability events and structured-output validation
errors.

## Structured output

Flow:

```
LLM → raw response → JSON recovery → zod validation → typed result
```

- Recovery is intentionally minimal and deterministic: try raw text; strip a
  markdown fence; slice the outermost `{...}` JSON region. No quote fixing, no
  character cleaning, no "make it fit" mutation. Truncated/empty/malformed
  output → `STRUCTURED_OUTPUT_INVALID`.
- Validation uses the **feature package's zod schema**. The runtime **never
  defines domain output schemas** and **never invents a second schema system**.
  Features define `GraphHoleAnalysisV1Schema`, `IngestionAnalysisV1Schema` etc.
  and hand them to `generateStructured`.
- **Invariant:** a response is not "successfully structured" because the
  provider returned HTTP 200 — it must pass zod `safeParse`.
- Unknown fields follow the feature schema's zod semantics (strip, or reject
  with `.strict()`).
- Validation errors surface issue **paths only**, never received values, so a
  model response can't leak secrets through a `SCHEMA_VALIDATION_FAILED`.

## Budgets

One versioned, shared policy (`AiBudgets`, tagged `AI_RUNTIME_POLICY_VERSION`).
The runtime **rejects** oversized requests before any provider call with typed
errors — it never silently truncates analytical context:

- `maxInputChars` (system + all messages) → `INPUT_TOO_LARGE`
- `maxRequestMessages` → `INPUT_TOO_LARGE`
- requested `maxOutputTokens` above the bound → `OUTPUT_LIMIT_EXCEEDED`

Feature packages learn the boundary from the typed error, not from silent data
loss.

## Retry / timeout

- Hard timeout per request (`ABORT_SIGNAL.timeout` combined with the caller's
  signal). Timeout → `REQUEST_TIMEOUT`; caller abort → `ABORTED`.
- **Bounded retry** (exponential backoff, capped) for **transient only**:
  `PROVIDER_UNAVAILABLE`, `RATE_LIMITED`, `REQUEST_TIMEOUT`.
- Never retried: invalid request, invalid/missing API key, unsupported model,
  permission errors, schema-invalid responses, configuration errors.
- Provider `Retry-After` hints are honored, **capped** at `maxRetryDelayMs`.
- No unbounded retries, no infinite loops, no recursive retries. Exhaustion →
  `RETRY_EXHAUSTED` with the last provider error as `cause` — a provider
  failure remains a provider failure.

## Execution metadata

Every successful execution returns `LLMExecutionMetadata`:

```
runtimePolicyVersion  v1 (shared policy version)
provider / model / modelVersion
promptVersion / schemaVersion / policyVersion   (feature-owned, recorded verbatim)
requestId (UUID)   startedAt / completedAt / latencyMs
inputTokens? / outputTokens? / totalTokens?     (only when the provider reports them)
finishReason   retryCount
```

Version dimensions are strictly separate: runtime policy ≠ provider ≠ model ≠
prompt ≠ schema versions. Token counts are **never fabricated**. `modelVersion`
is absent when a provider does not disclose it.

**Determinism metadata ≠ deterministic model output.** Identical
configuration+request+provider+model+prompt/schema/policy metadata makes an
execution *reproducibly identifiable*. It does NOT claim the LLM is
mathematically deterministic or that re-running yields byte-identical output
unless the provider actually guarantees it.

## Error taxonomy

`AiRuntimeError` with frozen codes:

```
CONFIGURATION_ERROR  PROVIDER_NOT_FOUND  PROVIDER_UNAVAILABLE
AUTHENTICATION_FAILED  RATE_LIMITED  REQUEST_TIMEOUT
INPUT_TOO_LARGE  OUTPUT_LIMIT_EXCEEDED
INVALID_PROVIDER_RESPONSE  STRUCTURED_OUTPUT_INVALID
SCHEMA_VALIDATION_FAILED  UNSUPPORTED_CAPABILITY
RETRY_EXHAUSTED  ABORTED
```

Transient set (retryable): `PROVIDER_UNAVAILABLE`, `RATE_LIMITED`,
`REQUEST_TIMEOUT`. Errors never embed secrets; provider raw errors never escape
as values.

## Authority boundary

The runtime is **execution-only**. It cannot create canonical entities or
relations, approve/reject hypotheses, modify the graph or evidence, change
investigation state, create leads, or perform any consequential human action.
It returns results; **the caller decides what a structured result means**.

## Non-goals

- Not an autonomous agent framework (no tools, no loops — V1).
- Not a prompt library (no `graph-hole-prompt.ts`, no `ingestion-prompt.ts`).
- Not a schema registry (features own their zod schemas).
- Not a replacement for / generalization of `@indago/semantic-retrieval`.
- Not a silent-switching provider router.
- Not an authorization layer for consequential actions.

## Consumer integration model

```
@indago/graph-hole (future)            @indago/ingestion (future)
   owns GraphHole system/user prompts      owns ingestion prompts/context
   owns GraphHoleAnalysisV1Schema          owns IngestionAnalysisV1Schema
        │                                        │
        └──────────────► @indago/ai-agent-runtime ◄──────────────┘
                          (executes, never decides)
```

A feature creates one runtime (from `loadAiConfig`), checks capabilities,
issues `generateStructured(request, itsOwnSchema)`, and interprets the typed
result under its own deterministic policy. Both features and future
workflows share one provider/secret/reliability/budget surface with zero
provider-specific logic in feature code.

## Verification

- Package: 81 unit tests pass (config, budgets, structured output, reliability,
  security, Gemini, Ollama, interchangeability, runtime), typecheck + build
  clean.
- `@indago/contracts`: 334 tests pass (regression after adding
  `AI_RUNTIME_POLICY_VERSION`).
- Recursive workspace typecheck and build pass; existing embedding
  infrastructure unchanged (no imports from or into semantic-retrieval).
- Public API smoke-import (workspace-aware): `pnpm --filter
  @indago/ai-agent-runtime exec node --input-type=module
  -e "import('@indago/ai-agent-runtime')..."` passes via Node package
  self-reference (`exports` → `dist/index.js`) from the package directory;
  all 17 public exports load. Bare-name import from the repo root fails with
  `ERR_MODULE_NOT_FOUND` for this package just as it does for the
  established `@indago/contracts` and `@indago/semantic-retrieval` — pnpm
  does not link unreferenced workspace packages at the root, so root-level
  bare-name resolution is not a valid smoke path.