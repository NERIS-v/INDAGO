# Semantic Retrieval (Phase 5A — PR1.5 + PR2)

## Scope

Foundation for semantic recall: persist canonical text units, embed them once
per provider identity, and answer deterministic nearest-neighbour queries with
strict case isolation and temporal filtering. PR1.5 delivers the FOUNDATION.
PR2 (13, semantic region expansion) bridges semantic units to graph nodes via
an authoritative adapter in `graph-hole-region`; nothing here ever resolves
text to entities by similarity or treats embeddings as evidence authority.

## Layers

| Layer | Home | Responsibility |
| --- | --- | --- |
| Contracts | `@indago/contracts` → `intelligence/semantic-retrieval.ts` | stable boundary: `SemanticRetrievalPort`, `SemanticTextUnit`, search/result schemas, provider identity, `EMBEDDING_POLICY_VERSION` |
| Engine (pure) | `@indago/semantic-retrieval` | canonicalization, hashing, vector validation, providers, pipeline, service. No I/O beyond the provider/repository interfaces |
| Persistence (platform) | `packages/platform` → `prisma/` + `src/persistence/` | pgvector tables, migration, deterministic-id stores, raw-SQL nearest neighbour |

## Contract invariants

- SemanticTextUnit IDENTITY = `caseId + sourceType + sourceId`; a MUTABLE
  CURRENT RETRIEVAL PROJECTION (updated in place when source text changes, no
  version history). `contentHash` = SHA-256 of canonicalized text = the
  CURRENT TEXT VERSION; unchanged content is never re-embedded.
- Embedding freshness rule: `embedding.contentHash === semanticTextUnit.contentHash`
  ⇒ current (searchable); anything else ⇒ stale (excluded by the freshness join).
- `SemanticTextUnit.normalizedText` is trimmed non-empty canonical text.
- `EmbeddingProviderIdentity` = providerId + modelId + modelVersion +
  dimensions + embeddingPolicyVersion. One embedding row per unit per
  identity slot; a provider swap never mixes vectors; a policy bump yields a
  new version instead of overwriting history.
- `SemanticRetrievalResult` always carries the query hash and both policy
  versions so consumers detect stale indexes across policy bumps.
- The port is dependency-inverted: the engine's `SemanticSearchService`
  implements it; PR1's region seam stays OPTIONAL and region/graph-node-typed.

## Engine rules

- Canonical text: collapse ASCII whitespace, trim, no case folding, no
  punctuation stripping. Query and documents share the SAME canonicalization.
- Embedding failure taxonomy is typed; only
  UNAVAILABLE/TIMEOUT/RATE_LIMITED are retried (bounded);
  DIMENSION_MISMATCH / PROVIDER_INVALID_RESPONSE / MODEL_UNSUPPORTED are
  dead-ends. A provider failure NEVER becomes an empty vector or empty result.
- Pipeline is idempotent: re-embedding a fully-current case makes ZERO
  provider calls. Whitespace-collapsed-empty units are skipped (counted).
- Deterministic query hash = SHA-256 of `{caseId, canonicalQuery,
  temporalContext}` — no timestamps, no random ids.

## Provider matrix

| Provider | Kind | Notes |
| --- | --- | --- |
| `OllamaEmbeddingProvider` | production | `POST /api/embed`, model `nomic-embed-text:latest` (768-dim, `nomic-bert`) — verified via `/api/tags`. Batched, order-preserved |
| `DeterministicEmbeddingProvider` | test-only | SHA-256 trigram projection (unit-magnitude, meaningful cosine). Powers unit/integration tests offline |
| Cloud (`CLOUD_EMBEDDING_*`) | documented slot | NOT implemented; no automatic fallback from Ollama |

Env contract (engine `config.ts`): `EMBEDDING_PROVIDER` (ollama default),
`EMBEDDING_DIMENSIONS` (768), `OLLAMA_BASE_URL`, `OLLAMA_EMBEDDING_MODEL`,
`OLLAMA_TIMEOUT_MS` (30000), `EMBEDDING_BATCH_SIZE` (16),
`EMBEDDING_CONCURRENCY` (2), `EMBEDDING_MAX_RETRIES` (2),
`EMBEDDING_RETRY_BASE_DELAY_MS` (250).

## Platform / pgvector

- Database must ship the `vector` extension: CI service image
  `pgvector/pgvector:pg16`; Neon provides it natively.
- V1 SHIPS **NO ANN INDEX**. A global HNSW index over vectors belonging to
  multiple cases/providers/models/policies can produce INCOMPLETE filtered
  retrieval because ANN candidate generation is not scoped to the required
  semantic identity. V1 uses EXACT cosine distance ordering only
  (`ORDER BY distance ASC, unit id ASC`). ANN/HNSW is deliberately deferred
  until dataset scale and an identity-aware filtering/index strategy justify
  it.
- V1 DIMENSION CONSTRAINT: storage is FIXED at `vector(768)` because the active
  Ollama production provider is `nomic-embed-text:latest`. Future cloud
  providers MUST use 768-dimensional embeddings until a future storage
  migration introduces dimension-specific storage. The provider identity keeps
  carrying dimensions so incompatible vectors are still rejected.
- SemanticTextUnit IDENTITY = `caseId + sourceType + sourceId` (mutable current
  retrieval projection, updated IN PLACE, no version history); current text
  version = `contentHash`; embedding freshness =
  `embedding.contentHash === semanticTextUnit.contentHash`.
- Deterministic row ids: unit id = UUID of sha256(`indago:semantic-text-unit:
  v1:caseId:sourceType:sourceId:contentHash`) at first upsert (never recomputed
  on later updates; NOT part of the identity contract); embedding row id = UUID
  of sha256(`indago:semantic-embedding:v1:unitId:providerId:modelId:modelVersion:
  embeddingPolicyVersion`). Same convention as ingestion/entity-resolution.
- `@@unique([caseId, sourceType, sourceId])` = one unit per source object;
  changed source text upserts `contentHash` + `normalizedText` in place,
  which is what the pipeline staleness check keys on.
- Nearest-neighbour query (all in SQL, never in memory):
  - cosine distance `e."vector" <=> :query::vector`
  - `WHERE distance <= 1 - threshold`, `ORDER BY distance ASC, unit id ASC`
  - case isolation on BOTH `SemanticTextUnit.caseId` and
    `SemanticEmbedding.caseId`
  - provider/model/policy isolation on the embedding identity columns
  - freshness join `e.contentHash = u.contentHash` (never search stale text)
  - TRUE closed-interval temporal overlap over `temporalScope` JSONB for stored
    interval A and query window B: `NOT (A.validFrom > B.validTo OR
    B.validFrom > A.validTo)`, missing endpoint (stored or query) = open bound,
    `temporalScope = NULL` pass-through. All predicates parameterized.

## Failure + isolation guarantees

- Provider swap with no embeddings for the new identity ⇒ empty results
  (honest), never fallback to another provider or to stale vectors.
- Cross-case rows are unreadable by construction (all queries are `caseId`
  -scoped at the SQL boundary).
- Searches are memory-order-stable: identical request ⇒ identical result
  order (SQL-distinct ordering + no app-layer reordering).

## PR2 note (semantic region expansion)

PR2 replaces the PR1.5 seam (`retrieveSemanticContext?` on
`GraphExpansionProvider`) with a builder-level dependency:

- `RegionBuildDependencies.semanticExpansion` = `SemanticRetrievalPort` +
  `SemanticNodeAdapter` + case-scoped `resolveSourceEntities`. With no
  dependency a region builds normally and reports `status DISABLED` (PR1 path).
- The ONLY production bridge is `AuthoritativeSemanticNodeAdapter`:
  hit → source → M-A09/M-A10 entity → M-A13 node, authoritatively. Never
  similarity/text/name matching; no fabricated nodes; `UNRESOLVED` (no entity)
  and `NON_NODE_SOURCE` (not in this graph version) are counted + reason-tagged.
- Query per round = `regionSemanticQueryOf(nodeIds)` (canonical join of the
  sorted region membership) — queries depend only on membership, so no
  semantic feedback loop can form. Budgets come from `@indago/contracts`
  (`MAX_SEMANTIC_RESULTS_PER_ROUND` 20, `MAX_TOTAL_SEMANTIC_RESULTS` 50,
  `MAX_SEMANTIC_NODES_ADDED` 50) and semantic nodes share the region-node budget.
- Outcome is traced on `GraphHoleRegion.semanticExpansion`
  (`SemanticExpansionTraceSchema`, frozen contracts; deliberately NOT part of
  the region identity). Statuses: DISABLED / SUCCESS / EMPTY / PARTIAL /
  DEGRADED / LIMITED. A port/adapter failure DEGRADES the region — never a
  fake empty.