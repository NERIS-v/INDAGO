# PR7 — Structured Graph-Hole AI Analyst: Design, Status & Deferred Boundaries

**Phase 5A-PR7** · `packages/intelligence/graph-hole-analysis` (`@indago/graph-hole-analysis`)

Authoritative design/status note for PR7: the feature-owned analyst that converts
one already-qualified graph-hole candidate plus its bounded context into a
**strict, machine-usable `GraphHoleAnalysisV1`** through the AI runtime
(`@indago/ai-agent-runtime`). It records the implemented surface and — explicitly —
the boundaries that are intentionally NOT covered today.

> **PR7 status:** PR7 is complete for its current shape: deterministic bounded
> context assembly, a versioned epistemic system prompt, a strict zod schema,
> narrow runtime integration (one `generateStructured` call per analysis), and a
> 40-test verification suite. The items below are explicit
> `DEPENDENCY`/`DEFERRED`/`FORWARD-COMPATIBILITY` boundaries, not defects.

---

## Implementation surface (summary)

- **Read-only, closed-world analyst.** PR7 reasons ONLY over the caller-supplied
  package (qualified candidate + region + PR3 hypothesis context + in-scope
  graph nodes/edges + observations). No database retrieval, no semantic search,
  no graph traversal, no tool calls, no autonomous loops.
- **Determinism.** Identical authoritative input ⇒ identical context package
  (stable ordering, sorted id arrays, no clock/random ids), canonical
  serialization (sorted keys, arrays untouched, `undefined → null`), and a
  `contextSha256` identity digest computed BEFORE the LLM call.
- **No verdict.** The output is an INVESTIGATIVE UNCERTAINTY assessment over
  open enums (`STRUCTURALLY_PLAUSIBLE`, `CONTRADICTED`, …). No criminality, no
  guilt, no intent, no concealment claims; contradictions and provenance are
  preserved, never resolved by PR7.
- **Strict schema.** `GraphHoleAnalysisV1Schema` is zod-strict (unknown fields
  rejected — repository policy) and stays in the shared provider-conversion
  subset (no `$ref`/`$defs`, no pattern/regex, no top-level unions, no tuples).
- **Identity stamped by the feature.** `candidateId`, `caseId`, `graphVersionId`,
  `regionId`, versions, and `contextSha256` are stamped by PR7, never echoed or
  invented by the model. Execution metadata mirrors the runtime's safe envelope
  (provider, model, versions, latency, retry count, tokens — no secrets).
- **One LLM touchpoint, no feature-level retry.** `analyzeGraphHole` builds one
  request and performs one `generateStructured` call. Runtime-provider failures
  (`UNSUPPORTED_CAPABILITY`, `RATE_LIMITED`, `REQUEST_TIMEOUT`, …) propagate as
  `AiRuntimeError` unchanged; feature errors cover only pre/post-call
  prerequisites PR7 owns.
- **Verification:** 40 tests across 6 suites (context 16, schema 8, prompt 6,
  architecture 5, security 3, analyst+runtime E2E 2); package typecheck +
  build green; runtime request shape (system prompt → context user message,
  provider-native JSON Schema with `additionalProperties:false`, no `$ref`/models
  leaking) verified against a stubbed Ollama transport.

---

## 1. What PR7 is and is not

PR7 is the qualitative layer PR5 deliberately does not provide: PR5 produces
heuristic qualification scores; **PR7 owns the structured AI reasoning over that
qualified candidate** (see `pr5-graph-hole-qualification.md` §PR7). It is the
successor of PR6's explicit non-goal (see `pr6-graph-hole-persistence.md`:
"PR7 LLM/AI analysis, Ollama, agent").

The epistemic contract is encoded in the versioned system prompt
(`src/prompts/system-prompt.ts`, `GRAPH_HOLE_ANALYSIS_PROMPT_VERSION =
'graph-hole-analysis-v1'`):

- Allowed evidence is the supplied bounded context only; outside knowledge may
  be used only to organise/qualify/connect supplied items. IDs, dates, provenance
  are never fabricated.
- Assertions are classified into exactly one of
  OBSERVED_FACT / HYPOTHESIS / CONTRADICTION / STRUCTURAL_SIGNAL /
  INFERENCE; the INFERENCE label is mandatory for analyst interpretation.
- No asserted criminality/guilt/intent/concealment, no "absence of evidence is
  evidence of concealment", no inflation of confidence (LOW/MEDIUM/HIGH/CRITICAL
  from the schema only).
- The prompt is a STATIC string — no clock, no provider-specific formatting, no
  random content. Identical policy/version constants ⇒ identical prompt.

## 2. Closed-world input & authority boundary

`buildGraphHoleAnalysisContext(input: GraphHoleAnalysisInput)` is the only door
into PR7. The input (`src/contracts/analysis-input.ts`) uses the repository's
authoritative types — `QualifiedGraphHoleCandidate` (PR5), `GraphHoleRegion`
(PR1), `HypothesisContext` (PR3), `GraphNode`/`GraphEdge`/`Observation` (contracts),
optionally `CommunityMembershipInput` (M-A13) — never re-created shapes.

`enforceAuthority` fails fast (plain `Error('INPUT_*')`, deterministic):

- `INPUT_UNQUALIFIED_CANDIDATE` — `qualified !== true`.
- `INPUT_AUTHORITY_MISMATCH` — `caseId`/`graphVersionId`/`regionId` disagreement
  between headline, region identity, and candidate raw record.
- `INPUT_BOUND_INVALID` — a caller bounds override is non-positive, non-finite,
  or above the frozen policy ceiling.
- `INPUT_CONTEXT_INCONSISTENT` — a must-cover reference (candidate
  supporting/contradicting observations, candidate node ids, supporting atomic
  derivedIds) is absent from the supplied input. The builder never silently
  omits something the candidate claims.

## 3. Deterministic context assembly

Selection is priority-ordered and then capped by the effective (narrowed) bounds:

- **Atomic hypotheses / groups:** must-cover groups (those containing any
  candidate `supportingHypothesisId`) first, then the rest, in PR3's group
  order; a flat atomic cap (`maxHypotheses`) with explicit overflow.
- **Observations:** candidate refs first, then included-atomics' refs, then the
  remainder by id, capped (`maxObservations`).
- **Nodes / edges:** candidate refs first, then the remainder by id, capped
  (`maxNodes` / `maxEdges`).

`deriveCompleteness` is a faithful OBSERVED-FACT record, never inferred from
list lengths: `semanticRetrievalTruncated` (region `providerTruncated` or
`SEMANTIC_RESULTS_TRUNCATED`), `regionLimited` (region truncated / LIMITED /
DEGRADED), `observationContextLimited` / `hypothesisContextLimited` (an overflow
was OBSERVED), `hypothesisGroupingTruncated` (PR3 `accounting.truncatedGroups`),
`temporalContextLimited` (candidate temporal scope outside declared temporal
context), `contextBudgetLimited` (reserved; currently a hard failure instead).

`counts` records exact effective numbers (supplied vs included vs excluded,
`serializedContextChars` patched after serialization) so downstream code knows
precisely what the model actually saw.

## 4. Canonical serialization & identity

`serializeGraphHoleAnalysisProfile` (`src/context/serialize.ts`) emits the
model-facing package with byte-stability guarantees: object keys always sorted
ascending (recursively), arrays never re-sorted (builder order is canonical),
`undefined → null` before stringification (fixed key positions), and
Non-Finite numbers refused (`INPUT_CONTEXT_INCONSISTENT`).

- `contextSha256` = SHA-256 hex of the canonical string, computed before the
  LLM call and passed through untouched into the result.
- The character budget (`maxSerializedContextChars`, default 100 000) is a
  **hard cap**: exceeding it is an honest `GraphHoleAnalysisError` with
  `code === 'CONTEXT_TOO_LARGE` (serializer never silently truncates the package
  it promises to furnish).

## 5. LLM request & runtime integration

`buildAnalysisRequest(serializedContext)` (`src/analyst/request.ts`) produces the
`LLMRequest`: `[{role:'system', content:SYSTEM_PROMPT}, {role:'user',
content:serializedContext}]`, carrying the feature's three version fields
(`promptVersion`, `schemaVersion`, `policyVersion`). Provider and model are
RUNTIME-resolved from the caller's `AiConfig` — PR7 never names a provider.

`analyzeGraphHole` (`src/analyst/analyze.ts`) is deliberately narrow: build the
one request → `runtime.generateStructured(request, GraphHoleAnalysisV1Schema)`
→ stamp identity/execution → return `GraphHoleAnalysisResult`. Provider errors
propagate as-is (no retry/fallback at the feature). Verified request shape
against a fetch-stubbed Ollama transport: `POST {baseUrl}/api/chat` with
`model` from the config `defaultModel`, `stream:false`, the two messages above,
and `format` = provider-native JSON Schema (no `$ref`/`$defs`/`definitions`,
`type:object`, `additionalProperties:false`).

## 6. Output schema & result envelope

`GraphHoleAnalysisV1Schema` (`src/contracts/analysis-v1.ts`) favours enums and
constrained values: `candidateAssessment` (5), `missingRelationship.assessment`
(4), `direction` (4), reasoning-step `kind` (6), `uncertainty.rating` (4), and a
closed `warnings` vocabulary (7 codes). Every reference field is an ID into the
supplied context (observation UUIDs, atomic `derivedId`s, content-addressed
`groupId`), and the model-authorable surface has no free-form "analysis" blob —
every claim is an atomized `ReasoningStep` with explicit refs.

- Reference-id schemas are FACTORY functions so the zod→JSON-Schema converter
  never reuses instances into `$ref` (provider subset forbids `$ref`).
- `analysisPolicyVersion`, `schemaVersion`, `analysisPolicyVersion`,
  `candidateId`, `caseId`, `graphVersionId`, `regionId`, `contextSha256` are
  FEATURE-stamped in `GraphHoleAnalysisResult`; execution metadata maps the
  runtime's safe `LLMExecutionMetadata` (secrets never appear).

## 7. Versions & bounds

PR7 owns three feature-scoped identifiers (`src/contracts/analysis-policy.ts`):
`analysisPolicyVersion 'v1'`, `schemaVersion 'graph-hole-analysis-v1'`, `promptVersion
'graph-hole-analysis-v1'`. It never re-declares shared identifiers: the global
bounds are consumed from the frozen `GRAPH_HOLE_POLICY_V1` in `@indago/contracts`
(single source of truth). Defaults derived there: `maxObservations =
min(MAX_CONTEXT_OBSERVATIONS, aiContext.maxEvidencePerAiPackage)`,
`maxHypotheses = MAX_HYPOTHESES_IN_CONTEXT`, `maxNodes = MAX_REGION_NODES`,
`maxEdges = MAX_REGION_EDGES`, `maxSerializedContextChars = 100_000`. Callers may
only NARROW (`resolveAnalysisBounds`); the analyst never expands frozen bounds.

## 8. Boundaries & explicit non-goals

- **`INVALID_ANALYSIS_REFERENCE` is declared but unwired.**
  **Label: `DEPENDENCY`** — PR8 owns deterministic post-LLM claim validation
  (every reference actually exists in the supplied context). PR7 performs only
  schema-level reference-shape validation and relies on the prompt's hard
  "every id you reference MUST exist in the supplied context" contract. The error
  code exists so PR8 can reuse the typed surface without changing PR7's errors.
- **No canonical mutation / lead lifecycle / judge surface.**
  **Label: `DEFERRED`** — PR7 is explicitly NOT a judge, lead generator,
  canonical-mutation system, or autonomous agent (prompt §Role; enforced by the
  security suite: no `createLead`/`approveHypothesis`/`saveObservation`-family
  APIs, no tool-call mechanism, no `createAiRuntime` at the feature layer).
- **Feature owns no retries, timeouts, or provider config.**
  **Label: `DEPENDENCY`** — all runtime concerns live in `@indago/ai-agent-runtime`
  (policy `'v2'`, recorded in execution metadata, never re-declared here).
- **`contextBudgetLimited` flag reserved.**
  **Label: `FORWARD-COMPATIBILITY`** — currently the serialized-context char bound
  is a hard `CONTEXT_TOO_LARGE` failure. A future over-provisioning path could set
  this completeness flag instead; the flag is already part of the frozen context
  type and prompt surface.
- **Frontend / persistence wiring.**
  **Label: `DEFERRED`** — PR7 produces the structured analysis; surfacing it in
  the web layer and persisting/replaying `GraphHoleAnalysisResult` records is
  outside this slice (see `pr6-graph-hole-persistence.md`).