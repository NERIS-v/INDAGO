# Semantic Retrieval (Phase 5A-PR1.5)

## Scope

Foundation for semantic recall: persist canonical text units, embed them once
per provider identity, and answer deterministic nearest-neighbour queries with
strict case isolation and temporal filtering. PR1.5 delivers the FOUNDATION
only — no region expansion consumes it yet. PR2 will bridge semantic units to
graph nodes; nothing here ever resolves text to entities or treats embeddings
as evidence authority.

## Layers

| Layer | Home | Responsibility |
| --- | --- | --- |
| Contracts | `@indago/contracts` → `intelligence/semantic-retrieval.ts` | stable boundary: `SemanticRetrievalPort`, `SemanticTextUnit`, search/result schemas, provider identity, `EMBEDDING_POLICY_VERSION` |
| Engine (pure) | `@indago/semantic-retrieval` | canonicalization, hashing, vector validation, providers, pipeline, service. No I/O beyond the provider/repository interfaces |
| Persistence (platform) | `packages/platform` → `prisma/` + `src/persistence/` | pgvector tables, migration, deterministic-id stores, raw-SQL nearest neighbour |

## Contract invariants

- `SemanticTextUnit.normalizedText` is trimmed non-empty canonical text;
  `contentHash` = SHA-256 of canonicalized text (semantic-equivalent text →
  same unit hash, so unchanged content is never re-embedded).
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
- HNSW cosine index is managed ONLY inside the hand-written migration
  (`prisma/migrations/20240104000000_semantic_embedding_retrieval`) because
  Prisma cannot express indexes over `Unsupported("vector(768)")` columns. A
  future `prisma migrate dev` drift diff MUST NOT drop it; CI uses
  `migrate deploy`.
- Deterministic ids: unit id = UUID of sha256(`indago:semantic-text-unit:v1:
  caseId:sourceType:sourceId:contentHash`); embedding row id = UUID of sha256
  (`indago:semantic-embedding:v1:unitId:providerId:modelId:modelVersion:
  embeddingPolicyVersion`). Same convention as ingestion/entity-resolution.
- `@@unique([caseId, sourceType, sourceId])` = one unit per source object;
  changed source text upserts `contentHash` + `normalizedText` in place,
  which is what the pipeline staleness check keys on.
- Nearest-neighbour query (all in SQL, never in memory):
  - cosine distance `e."vector" <=> :query::vector`
  - `WHERE distance <= 1 - threshold`, `ORDER BY distance ASC, unit id ASC`
  - case isolation on BOTH `SemanticTextUnit.caseId` and
    `SemanticEmbedding.caseId`
  - freshness join `e.contentHash = u.contentHash` (never search stale text)
  - temporal overlap over `temporalScope` JSONB (missing endpoint = open
    bound; string comparisons are ISO-8601-safe)

## Failure + isolation guarantees

- Provider swap with no embeddings for the new identity ⇒ empty results
  (honest), never fallback to another provider or to stale vectors.
- Cross-case rows are unreadable by construction (all queries are `caseId`
  -scoped at the SQL boundary).
- Searches are memory-order-stable: identical request ⇒ identical result
  order (SQL-distinct ordering + no app-layer reordering).

## PR2 note (seam)

`graph-hole-region`'s `retrieveSemanticContext?` remains optional and returns
NODE ids. A conformance test (`tests/conformance/semantic-retrieval-seam.test.ts`,
test-only adapter) pins the shape contract: semantic unit → node mapping is
the ENTIRE future PR2 surface; PR1.5 ships NO production adapter.