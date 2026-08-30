# INDAGO Future Capabilities Roadmap

> [!warning]
> **STATUS: FUTURE / NOT IMPLEMENTED**
>
> This document describes planned or exploratory architecture. It is not
> evidence that the capability currently exists in the repository.

This is the authoritative index for INDAGO's future capabilities and
architectural extensions. It consolidates intent already present in the
repository — code comments, contracts, phase trackers, plans, and
implementation reports — into one factual roadmap.

It does **not** change application behavior, and it does **not** invent
milestones, schemas, or algorithms that the repository does not define.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `IMPLEMENTED` | Code exists and is exercised by tests. |
| `PARTIALLY_IMPLEMENTED` | A real subset exists; the rest is documented intent or stub. |
| `EXPLICITLY_DEFERRED` | Referenced by docs and consciously pushed to a later phase. |
| `CONTRACT_ONLY` | A contract type exists; there are zero producers/consumers in code. |
| `DOCUMENTED_ONLY` | A document claims it; code does not implement it. |
| `NOT_FOUND` | No code or doc reference found. |
| `UNKNOWN` | Signal exists but intent is unresolved. |

Classification rule: if a document says a feature exists but code does not
implement it, it is `DOCUMENTED_ONLY` / `DOCUMENTED INTENT / NOT IMPLEMENTED`.
If code exists but docs are stale, it is `IMPLEMENTED / DOC STALE`. History
is never silently rewritten.

## Current Baseline

What exists today at `HEAD` (verified against `packages/contracts`,
`packages/intelligence`, `packages/platform`, `packages/web`, and the docs in
this `docs/` tree):

### Ingestion pipeline (platform + intelligence)
| Capability | Status | Evidence |
| --- | --- | --- |
| Artifact acquisition (M-PR1) | `IMPLEMENTED` | `packages/platform/src/ingest/acquisition-service.ts`, `fetcher/`, `hasher/`, `storage/`; contract `VerifiedArtifactSchema` |
| Classification / routing (M-PR2) | `IMPLEMENTED` | `packages/intelligence/ingestion/src/classify/route-artifact.ts`, content sniffing, deterministic routing |
| Raw extraction / OCR (M-PR3) | `IMPLEMENTED` (7 formats) | `packages/intelligence/ingestion/src/parser/` — TXT, CSV, JSON, XML, PDF (+ pdfjs OCR), DOCX, IMAGE; see `docs/platform/m-pr3-raw-extraction.md` |
| XLSX extraction | `DOCUMENTED_ONLY` (stub) | `parser/builtins/xlsx-parser.ts` returns `EXTRACTION_FAILED` / `XLSX_NOT_IMPLEMENTED`; explicitly deferred in `docs/platform/m-pr3-raw-extraction.md` §15 |
| Normalization (M-A05) | `IMPLEMENTED / FROZEN` | `normalize/` canonical fields, confidence, quality flags; `docs/platform/m-a05-normalization.md`; "no LLM/OCR reruns" rule |
| Observation extraction (M-A06) | `IMPLEMENTED` (deterministic) | `observation/observation-rules.ts`, `observation-extractor.ts`; provenance chain; `candidateMentions`; strength baselines; visual-line merge; `docs/platform/m-a06-observation-extraction.md` |

### Platform
| Capability | Status | Evidence |
| --- | --- | --- |
| Investigation lifecycle / state machine (G-A04) | `IMPLEMENTED` | `packages/platform/src/runs/`, `queue/ingest-evidence.ts`; states `CREATED…COMPLETED/FAILED/PAUSED/REVIEW_REQUIRED` |
| Queue + worker (BullMQ + Redis) | `IMPLEMENTED` | `queue/`, `worker/`; exactly-once job/attempt semantics |
| Checkpoint / resume / replay of stored rows (G-A05) | `IMPLEMENTED` (job-level) | `queue/ingest-evidence.ts` rehydrates stored rows; retry skips recompute |
| Evidence submission (hash-verified) | `IMPLEMENTED` | `api/routes.ts` `POST /investigations/:id/evidence`; `docs/reports/e2e-security-production.md` |
| Observation read API | `IMPLEMENTED` | `GET /investigations/:id/observations`; `observation-store.ts` |
| SSE realtime | `IMPLEMENTED` | `realtime/sse.ts` + `EventBus`; live frames incl. `OBSERVATION_EXTRACTED` (metadata only) |
| Case store + deletion | `IMPLEMENTED` | `case-store` (SQLite), `DELETE /investigations/:id` |
| Auth | `PARTIALLY_IMPLEMENTED` (dev-grade) | `verifyToken` seam; `demo-token` dev bypass; production JWT/OIDC is a documented migration path |
| Postgres persistence | `IMPLEMENTED` | Prisma schema, 12 models, migrations via `prisma generate` (DB is schema-sourced) |

### Intelligence artifacts
| Capability | Status | Evidence |
| --- | --- | --- |
| Entity / candidate / hypothesis contracts | `CONTRACT_ONLY` | `packages/contracts/src/domain/entity.ts`, `intelligence/entity-resolution.ts`; zero producers, zero persistence |
| Entity resolution / canonical entities | `NOT_FOUND` (contracts only) | no store, no API, no worker phase |
| Relations / hypotheses / graph | `NOT_FOUND` (contracts only) | `RelationTypeSchema`, `GraphNodeTypeSchema` are present; nothing runs them |
| Corroboration / semantic grouping | `NOT_FOUND` | not contracted; see `observation-corroboration.md` |
| Leads / gaps / robustness | `NOT_FOUND` in backend | phases exist on the tracker; only narrative/UI scaffolds exist |

### Frontend (`packages/web`)
| Capability | Status | Evidence |
| --- | --- | --- |
| Provider boundary (DEMO / LIVE / AUTO) | `IMPLEMENTED` | `src/lib/providers/*`; `docs/frontend/f-pr2-provider-architecture.md` |
| Case list, case detail, evidence, observations | `IMPLEMENTED` (UI) | realtime feed, status surfaces, evidence viewer |
| Graph / timeline / leads / gaps / review / robustness | `PARTIALLY_IMPLEMENTED` (scaffolds + demo) | GraphNode/GraphEdge demo fixtures, presentation rules; rendering deferred to F-PR4+ |
| Deterministic demo fixtures | `IMPLEMENTED` | `src/lib/providers/demo/*`, fixture builders pass schema validation |

## Core Intelligence Roadmap

The canonical pipeline ordering, per `docs/roadmap/phase-tracker.md`,
`docs/roadmap/development-plan.md`, and the M-A05/M-A06 reports:

```mermaid
flowchart TD
    A["Artifact"] --> B["RawExtraction"]
    B --> C["NormalizedExtraction"]
    C --> D["Observation"]
    D --> E["Entity Candidate"]
    E --> F["Entity Resolution"]
    F --> G["Canonical Entity"]
    D --> H["Corroboration / Claim Resolution"]
    G --> I["Relations"]
    H --> J["Hypotheses"]
    I --> K["Graph"]
    J --> K
    J --> L["Leads"]
```

### Per-component status (M-PR1 → Leads)

| # | Component | Status at HEAD | Next action |
| --- | --- | --- | --- |
| 1 | M-PR1 Artifact Acquisition | `IMPLEMENTED` | — |
| 2 | M-PR2 Classification / Routing | `IMPLEMENTED` | — |
| 3 | M-PR3 Raw Extraction / OCR | `IMPLEMENTED` (XLSX stub) | XLSX deferred, not needed current milestone |
| 4 | MA05 Normalization | `IMPLEMENTED / FROZEN` | version-migration is future, see §16 |
| 5 | MA06 Observation Extraction | `IMPLEMENTED` | semantic grouping is future, NOT M-A06 scope |
| 6 | MA07 Entity Candidate Generation | `DEFERRED / NEXT` | next milestone; archaeology complete, design pending (see §6 and `entity-resolution.md`) |
| 7 | Entity Resolution | `CONTRACT_ONLY` | blocked on M-A07 output; see `entity-resolution.md` |
| 8 | Observation corroboration | `NOT_FOUND` (future design) | see `observation-corroboration.md` |
| 9 | Observation contradiction / validation | `NOT_FOUND` (future design) | same doc |
| 10 | Relation extraction | `CONTRACT_ONLY` | TBD milestone |
| 11 | Hypothesis generation | `CONTRACT_ONLY` | TBD milestone |
| 12 | Graph projection | `CONTRACT_ONLY` (backend) / `PARTIALLY_IMPLEMENTED` (UI scaffolds) | blocked on entities + relations |
| 13 | Leads | `NOT_FOUND` | tracker Phase 4 |
| 14 | Claim grounding | `NOT_FOUND` | tracker Phase 6A |
| 15 | Robustness / counter-evidence | `PARTIALLY_IMPLEMENTED` (tracker 6B complete; UI narrative) | tracker Phase 6 |

## Entity / Resolution Roadmap

See `docs/roadmap/entity-resolution.md` for the full record.

Decisions already made (from the M-A07 contract archaeology — `packages/contracts/src/domain/entity.ts`, `intelligence/entity-resolution.ts`):

- Candidate generation must be **deterministic**.
- `candidateMentions` (`string[]`, 0–50, 1–200 chars) is the only mention artifact today, produced by `extractCandidateMentions`.
- There is **no EntityType taxonomy**; scattered schemas exist (`GraphNodeTypeSchema`, `NormalizedValueTypeSchema`, `PIIPatternTypeSchema`, `RelationTypeSchema`) and are unused for candidate typing.
- A pre-resolution, mention-derived, typed entity candidate is **not currently defined** in any contract.
- No canonical `EntityId` creation. No resolution, relations, or hypotheses.
- ML/LLM extraction is future and optional (`entity-candidate-ml-layer.md`).

Future capabilities (each with separate scope):

- richer mention spans (offset, dialect, source-grounded text) — TBD
- entity-type taxonomy — TBD (Architecture decision required)
- gazetteer / aliases — TBD
- candidate comparison — TBD
- entity resolution → canonical Entity — TBD (`entity-resolution.md`)
- external/source identifiers — TBD
- identity merge/split — TBD

## Evidence / Provenance Roadmap

Current state:
- `Source` → `Evidence` → `Observation` is a real, persisted provenance chain
  (Evidence `sha256`, `artifactRef`, page/span refs; Observation `identityKey`,
  `sourceRef`, `pageRef`, `spanRef`).
- Normalization confidence ≠ Observation strength ≠ ResolutionScore (naming enforced by contract).

Future ideas (discussed, not contracted):
- richer Evidence model / evidence review / evidence-for / evidence-against
- source administration / source catalog
- source-aware scoring
- human evidence review

Explicitly distinguish: current minimal Source/Evidence implementation vs.
future richer workflows. No milestones are fixed for these.

## Graph / Hypothesis Roadmap

- Backend: `GraphNodeTypeSchema` / `GraphEdgeTypeSchema` are `CONTRACT_ONLY`; no graph persistence, no projection, no graph API.
- Analysis-time synthetic graph exists only behind legacy `USE_MOCK_INGESTION`.
- Frontend: graph presentation scaffolds exist in demo fixtures; rendering is a future UI phase (F-PR4+ per `docs/frontend/frontend-development-plan.md`).
- Dependency chain `Observation → Entity/Relation → Graph` is preserved but unbuilt.

## Frontend Capability Progression

```mermaid
flowchart LR
    UI["Next.js UI"] --> P["Provider Boundary"]
    P --> D["DEMO"]
    P --> L["LIVE"]
    A["AUTO"] --> P

    L --> API["Real Backend APIs"]
    API --> DB["PostgreSQL"]

    D --> FIX["Deterministic fixtures"]
```

- `DEMO` = deterministic fixtures (must remain deterministic even as backend grows).
- `LIVE` = real backend; as backend capabilities become real (M-A07+), Live providers can consume them.
- `AUTO` = provider resolver only, never a fidelity guarantee.
- Backend advancement must not destroy frontend Demo functionality.

Future UI concepts (distinct from existing provider seams):
entity candidate review · entity resolution UI · evidence review · graph UI ·
timeline · leads · hypotheses · gaps · contradiction views · source administration.

These are surfaced as demo scaffolds / deferred tracker items (e.g. observations tab deferred until F-PR5, graph renderer until F-PR4). The provider seam exists today; the future UI capabilities do not.

## Platform / Infrastructure Roadmap

| Capability | Status | Notes |
| --- | --- | --- |
| Production auth (JWT/OIDC) | `EXPLICITLY_DEFERRED` | behind `verifyToken` single-function swap; `docs/reports/e2e-security-production.md` §22 |
| Secrets management | `EXPLICITLY_DEFERRED` | documented migration: Redis `requirepass`, Postgres creds from secret store, UploadThing server-side only |
| Distributed object storage (S3) | `UNKNOWN` | repository uses local filesystem `ARTIFACT_STORAGE_DIR`; no S3 signal |
| Production DB migrations | `DOCUMENTED_ONLY` | Prisma schema is the source of truth; no `migrations/` dir found |
| Browser E2E / Playwright | `NOT_FOUND` | not present |
| Production observability | `NOT_FOUND` | none |
| Queue monitoring / worker scaling | `NOT_FOUND` | BullMQ exists; dashboards/autoscaling are not |
| ML model security (if introduced) | `FUTURE` | see `entity-candidate-ml-layer.md` |

Environment hardening is distinct from core product capability; both are
tracked separately here.

## Ingestion Roadmap

- XLSX parser: `EXPLICITLY_DEFERRED` — stub returns `XLSX_NOT_IMPLEMENTED`; "not needed in current milestone".
- Additional parsers / OCR improvements: no committed plan. Improving OCR (language models, layout) is an open enhancement, not a current requirement.
- Source replay, extraction replay, normalization replay: partially served by job-level rehydrate/resume; a first-class cross-run replay/canonical-rebuild pipeline does not exist.
- Parser version migration: not defined.

## Security Roadmap

Current controls (implemented): hash-verified evidence submission, case-scoped dev auth, artifact content sniffing, deterministic-only extraction (no LLM in the ingestion loop today, which minimizes prompt-injection surface), PII treated as opaque text.

Future hardening (documented ideas, `docs/reports/e2e-security-production.md`, tracker Phase 9):
production identity (OIDC, RBAC) · source data confidentiality · model data leakage ·
prompt injection (only relevant once ML/LLM is introduced) · external AI provider controls ·
SSRF/egress · audit hardening · PII masking.

None of the future items is implemented at `HEAD`.

## Future ML/LLM Roadmap

`FUTURE / NOT IMPLEMENTED`. Deterministic M-A07 is the baseline; an optional
ML/LLM candidate extractor shares the same `EntityMentionCandidate` contract;
Entity Resolution consumes candidates. Model output is never an identity
authority. Full design: `docs/roadmap/entity-candidate-ml-layer.md`.

## Backlog by Priority

Priorities are derived from the repository's own phase ordering and documented
dependencies, not from feature preference.

### P0 — required for core next milestones / correctness
- M-A07 Entity Candidate Generation (deterministic baseline) — next milestone.
- Realtime replay endpoint decision (activity-feed replay vs PR open) — pending decision, potentially P0 for the frontend realtime story.

### P1 — important production/product capability
- Entity resolution (candidate → canonical) — blocked by M-A07 output.
- Relations + graph projection — blocked by resolution.
- Production auth (JWT/OIDC behind `verifyToken`).
- Production DB migration mechanism.
- Graph UI + entity-resolution review UI.

### P2 — later enhancement
- XLSX extraction.
- Observation corroboration / contradiction / claim grouping.
- Evidence review, source administration, source-aware scoring.
- Realtime event history / reconnect replay endpoint (if the pending decision chooses it).
- Observability / queue monitoring / secrets management.
- Robustness / counter-evidence surfacing (backend), leads (backend).

### P3 — exploratory / future research
- ML/LLM candidate extraction.
- Semantic embeddings / similarity beyond deterministic rules.
- Browser E2E / Playwright harness.
- PII masking and advanced audit hardening.

## Dependency Diagram

```mermaid
flowchart TD
    A["Artifact"] --> B["RawExtraction"]
    B --> C["NormalizedExtraction"]
    C --> D["Observation"]
    D --> E["Entity Candidate"]
    E --> F["Entity Resolution"]
    F --> G["Canonical Entity"]
    D --> H["Corroboration / Claim Resolution"]
    G --> I["Relations"]
    H --> J["Hypotheses"]
    I --> K["Graph"]
    J --> K
    J --> L["Leads"]
```

Only nodes supported by repository roadmap or current architecture are included.

## Explicitly Deferred Ideas

- XLSX parsing (`XLSX_NOT_IMPLEMENTED` stub).
- Production identity (JWT/OIDC) — single-function swap ready, not implemented.
- Entity resolution, relations, hypotheses, graph projection, corroboration — contracts only / not founded.
- ML/LLM candidate extraction — future research direction.
- Semantic corroboration tooling (embeddings, claim grouping) — future, must not replace evidence identity.
- Frontend graph/timeline/leads/gaps/review renderers — deferred tracker phases.

## Unknown / Needs Decision

1. M-A07 candidate contract: is the typed pre-resolution candidate a new schema, or an evolution of `EntityCandidateSchema`? (Note: two near-duplicate contracts exist today — `EntityCandidateSchema` and `EntityResolutionCandidateSchema`.) `Architecture decision required`.
2. Should `Observation.entityIds` / `candidateEntityHypothesisIds` be populated by M-A07? `Architecture decision required`.
3. **Realtime replay**: build an event-history endpoint (`GET /investigations/:id/events`) and hydrate on reconnect, or leave SSE as fire-and-forget notification? (Pending decision from the M-A06 wrap-up.)
4. Entity-type taxonomy owner and scope (analyze, then decide). `Architecture decision required`.
5. Entity identity model: digest-based (like SourceId/EvidenceId/ObservationId) vs. sequence-based. `Architecture decision required`.
6. Migration strategy: Prisma `db push` vs. versioned migration files.
7. Storage backend for production artifacts (local FS vs S3).
8. Whether M-A08–A10 (blocking, resolution) belong in the same milestone as M-A07 or are strictly downstream.

## Companion documents

- `docs/roadmap/entity-candidate-ml-layer.md` — future ML/LLM candidate generation.
- `docs/roadmap/entity-resolution.md` — entity resolution roadmap.
- `docs/roadmap/observation-corroboration.md` — corroboration vs. deduplication.
- `docs/roadmap/phase-tracker.md` — phase-by-phase progress (source of truth for milestones).
- `docs/roadmap/development-plan.md` — original architecture plan.

"Future-scope consolidation complete. The roadmap distinguishes current
implementation from planned and exploratory capabilities without changing
application behavior."