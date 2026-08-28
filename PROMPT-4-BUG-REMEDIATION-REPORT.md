# PROMPT 4/4 — BUG SCAN REMEDIATION REPORT

Repository: `INDAGO` — Packages: `platform`, `contracts`, `ingestion`, `web`
Date: 2026-08-28

---

## 1. Executive Summary

The read-only bug scan surfaced five findings (two P0, three P1). **All five are remediated,
tested, and regression-proven against the REAL Postgres + Redis + BullMQ stack.** The
canonical ingestion path remains byte-for-byte compatible (raw-extraction output boundary),
and no out-of-scope area was rewritten.

| # | Severity | Finding | Verdict |
|---|---|---|---|
| P0-1 | Critical | SSE stream endpoint leaked evidence outside case scope | **FIXED** — route-level `verifyCaseAccess` guard, real-stack proven |
| P0-2 | Critical | Production could accept the shared `demo-token` credential | **FIXED** — prod rejects the credential server-side and client-side fail-fast |
| P1-3 | High | UploadThing callback skipped case boundary + could drop the audit | **FIXED** — principal-bound `verifyCaseAccess`, awaited audit, no fabricated identity |
| P1-4 | High | Artifact fetch had no SSRF guard and no body-read timeout | **FIXED** — fetch policy (https, allowlist, private-host blocks) + deadline watchdog |
| P1-5 | High | Retry-after-success / unique-constraint race wedged runs permanently | **FIXED** — terminal-run guard + re-entrancy gate + collision-tolerant extraction insert |

Build & test evidence (all executed this session):

| Package | Unit/Provider tests | Real-integration tests | Typecheck |
|---|---|---|---|
| `@indago/platform` | **88 passed** (5 files) | **19/19** (3 files, real Postgres `indago_test` + Redis `requirepass` + BullMQ) | clean |
| `@indago/intelligence/ingestion` | **301/301** (26 files; fetcher suite 28) | — | clean |
| `@indago/web` | **203/203** (27 files) | — | see §9 (pre-existing debt, untouched) |
| `@indago/contracts` | unchanged this session (114/114 at Prompt 3) | — | — |

## 2. Scope & Exit Criteria

In scope: remediate the five findings, add targeted tests (mocked + real integration), re-run
the same read-only scan proving each fix is wired at every call site, and deliver this report
with the MA05 verdict (§11).

Out of scope (unchanged, per prompt): demo/live/auto provider architecture, fixtures,
provider interfaces, UI components, evidence wizard internals, and
normalization/observation/entity/graph/lead domains. The platform still does **not** create
domain-model rows — `RawExtraction` remains the output boundary.

## 3. Environment

Reused the Prompt-3 Docker stack:

| Component | Container | Notes |
|---|---|---|
| Postgres | `indago-postgres` (5432) | DBs `indago` (dev) + `indago_test` (dedicated integration DB; schema in sync) |
| Redis | `indago-redis` (6379) | `requirepass` set via command args; suite runs export `REDIS_URL` with the credential in-memory |

Verification runs target `TEST_DATABASE_URL=postgresql://…@localhost:5432/indago_test` and
authenticated `REDIS_URL=redis://:…@localhost:6379`. No secrets or credentials are printed in
this report or were echoed during the session; container credentials were only ever held in
memory from `docker inspect`.

## 4. Held Lines (what the scan did not disturb)

Re-confirmed while fixing the five findings — unchanged in this prompt:

- `transitions.ts`: `transitionRunToIngesting` / `transitionRunToNormalizing` are skip-if-past
  safe; the orchestrator has **no** FAILED transition (audits only), so the new `RUN_TERMINAL`
  guard throws `UnrecoverableError` without needing a state transition.
- `verifyCaseAccess` (`auth.ts:53`) and `requireCaseAccess` (`auth.ts:143`) remain the single
  authorization boundary for case-scoped reads/writes.
- Canonical contracts (`@indago/contracts`) are untouched; `IngestionJobPayload`,
  `UploadedFileReferenceSchema` unchanged.
- Fetcher redirect cap, scheme/allowlist strings (“Unsupported URL scheme: …”,
  “Destination host not permitted: …”, “Too many redirects (max …)”) are exact and asserted.

## 5. Fix Detail per Finding

### 5.1 P0-1 — SSE evidence stream was not case-scoped

**Before:** the stream route handed `req.params.investigationId` straight to the SSE handler —
any authenticated caller could open a live evidence stream for an investigation without ever
proving that investigation belonged to their case.

**After** (`platform/src/api/routes.ts:205`): the stream route now resolves the run, then
enforces, in order:

1. `requireAuth` → unauthenticated `401`;
2. run missing → `404`; `caseId` absent on run → `400`;
3. `verifyCaseAccess(req.user, run.caseId)` → cross-case caller gets `403`;
4. only after the guard: `res.locals.caseId` / `res.locals.runId` are set and the SSE handler
   binds to **those**, never to raw params.

The web proxy route (`packages/web/src/app/api/sse/[investigationId]/route.ts`) stays
server-only (comment-documented): it fetches the platform with the server-side token and
still forwards the platform’s 401/403/404 — no client-side credential is ever exposed.
Status/evidence query routes (`routes.ts:54,85`) were already case-guarded and remain so.

**Tests:** `platform/tests/stream-auth.test.ts` (6, real express + real routes.ts, mocked
prisma/SSE/logger): unauthenticated → 401, denied → 403, malformed id → 400, missing run →
404, run without caseId → 400, authorized → 200 with canonical `caseId` on `res.locals`.
Real proof: `real-stack.e2e.test.ts` — real unauthenticated 401, malformed 400, nonexistent
404, and the happy path asserts SSE frames mid-flight for the correct case only.

### 5.2 P0-2 — `demo-token` was acceptable in production

**Before:** `verifyToken` accepted `Bearer demo-token` unconditionally; dev access leaked to
any `NODE_ENV`. The web server client would present whatever `AUTH_TOKEN` was configured,
including the demo credential, in production.

**After:**

- `platform/src/api/auth.ts:36` — `verifyToken` returns the demo identity **only**
  when `NODE_ENV !== "production"`; production rejects every token.
- `platform/src/api/auth.ts:57` — `verifyCaseAccess` returns `true` only outside production
  (no cross-case bypass can survive a prod deploy even if a token slips through).
- `web/src/lib/api/server.ts:33` — `getAuthToken` fail-closed: throws before any fetch when
  `NODE_ENV === "production" && token === "demo-token"`.

**Tests:** `upload-producer.test.ts` “PRODUCTION LOCK (P0-2)” (restores original `NODE_ENV` in
`afterEach`): demo-token → null principal in prod; real identity still case-scoped in prod;
`resolveUploadAuth` rejects `Bearer demo-token` in prod; anonymous UT-signed uploads remain
authorized with a null user (no fabricated identity, §5.3). `web/tests/api-client.test.ts`
“Production demo-credential guard (P0-2)”: `getHealth`/`submitEvidence` reject the demo
credential in prod **without issuing a fetch**; a non-demo token is still sent with `Bearer`;
the demo credential remains usable in development.

### 5.3 P1-3 — UploadThing callback skipped the case boundary and could swallow the audit

**Before:** `handleUploadComplete` verified the uploader token but not that the target
investigation belonged to the uploader’s case, and the `EVIDENCE_UPLOADED` audit was
best-effort — a failure could silently drop the trail.

**After** (`platform/src/api/uploadthing.ts:74`):

- principal-only path: run resolved by `investigationId`, then
  `verifyCaseAccess(uploader, run.caseId)` → wrong case throws (`UploadThingError`) with
  **no audit**;
- missing run / run without caseId → throw, no audit;
- anonymous (UT-signed) uploads: actor `UPLOAD_CLIENT`, `commitType: "deferred"` —
  confirmed as submitted but explicitly **not** marked ingested; identity is never
  fabricated;
- audit awaited — an audit failure propagates to the caller instead of being swallowed.

**Tests:** `platform/tests/upload-complete.test.ts` (6): authorized → `EVIDENCE_UPLOADED`
recorded for the principal; denied → throws with no audit row; nonexistent run → throws, no
audit; run without caseId → throws, no audit; anonymous → `UPLOAD_CLIENT` actor, deferred,
`verifyCaseAccess` **not** called for the anonymous path; audit failure propagates.

### 5.4 P1-4 — Artifact fetch: no SSRF guard, no body-read timeout

**Before:** payload URLs were fetched with only a connect/settle timeout — metadata/private
destinations were reachable and a slow-drip body could hold a worker open indefinitely.

**After** (`packages/intelligence/ingestion/src/acquisition/artifact-fetcher.ts`):

- exported `ArtifactFetchPolicy` + `assertSafeFetchUrl` (`:96`, `:204`) — every custom
  handler and test must go through the same guard as the fetcher;
- **https-only by default**; `http` only via explicit opt-in;
- optional comma-separated **positive origin allowlist** (e.g. `utfs.io`, the UploadThing CDN
  host) — when set, ONLY those origins are fetchable;
- private/loopback/link-local/CGNAT/ULA addresses, reserved hostnames, and cloud-metadata
  destinations rejected with “Destination host not permitted: …”; IPv6 bracket + trailing-dot
  normalization applied before `net.isIP` (`:168`), closing the `[::1]`/`1.2.3.4.` bypass;
- manual redirect loop re-validating **every hop** against the same policy (`:292`, cap 5 →
  “Too many redirects (max …)”);
- `withDeadline` watchdog stays armed **during body reads** (`:376`) so a slow body cannot
  outlive the fetch deadline.

Wired in production code only through `platform/src/queue/ingest-deps.ts:60-73` via env:
`ARTIFACT_ALLOWED_ORIGINS`, `ARTIFACT_ALLOW_HTTP`, and `ARTIFACT_ALLOW_PRIVATE_HOSTS` —
the last is a **TEST-ONLY** escape hatch documented as “MUST NOT be set in production”; both
real e2e suites set it in `beforeAll` (before dynamic imports) so their `http://127.0.0.1`
fixture servers are fetchable while the production default stays strict.

**Tests:** `artifact-fetcher.test.ts` 28 passed — scheme rejection, http opt-in, private
hosts, reserved hostnames, allowlist + subdomain, redirect-to-disallowed rejection,
redirect-within-allowlist, redirect cap (6 fetches max), slow-body timeout. Real proof: the
real-stack suite fetches `http://127.0.0.1` fixtures through the real `HttpArtifactFetcher`.

### 5.5 P1-5 — Retry-after-success and unique-constraint race wedged runs

**Before:** a failure after the RawExtraction insert (transition/audit) caused BullMQ to
retry; the retry re-ran acquisition/extraction, and the duplicate `RawExtraction.insert`
threw `P2002`, keeping the run INGESTING forever with a SUCCEEDED attempt never recorded.

**After** (`platform/src/persistence/ingestion-store.ts` + `platform/src/queue/ingest-evidence.ts`):

- `INGESTION_JOB_FAILED`-grade **terminal guard** (`TERMINAL_RUN_STATUSES` =
  FAILED/CANCELLED/COMPLETED, `:64`): a new job for a terminal run throws
  `UnrecoverableError("RUN_TERMINAL: …", :136)` **before** any attempt write or lock —
  no more work touches a dead run;
- **re-entrancy gate** after the idempotent RUNNING upsert (`:172`): if a previous pass
  already persisted the RawExtraction, transition to NORMALIZING and return — the retry is
  recognized as the same completed attempt;
- `ensureRawExtraction` (`ingestion-store.ts:225`): pre-check → insert → `P2002` catch →
  re-query, so a genuine re-entrant collision converges instead of wedging;
- step-8 SUCCEEDED upsert reuses the captured `attempt` (no redeclaration), and the
  completion transition stays a safe no-op for runs already past INGESTING.

**Tests:** `worker-stub.test.ts` (23): new “Re-entrant completion (P1-5)” (already-NORMALIZING
asserts the RUNNING upsert happens exactly once and no SUCCEEDED is overwritten; duplicate
completion converges via the gate) and “Terminal-run guard (P1-5)” (FAILED, CANCELLED,
COMPLETED each throw `RUN_TERMINAL` with no attempt row written) suites; P2002-race case uses
the exact `[null, null, rx-1]` findUnique/insert-collision sequence. Real proof: real-stack
“job processed once” dedup and pipeline “attempts = 1” under real Postgres.

## 6. Test Evidence: Full Matrix

| Command | Result |
|---|---|
| `platform`: `npx vitest run --no-file-parallelism` (with `TEST_DATABASE_URL` + `REDIS_URL`) | **8 files / 107 passed** — integration real |
| `platform`: unit files standalone | worker-stub 23, upload-complete 6, stream-auth 6, recovery 3, upload-producer 50 = **88 passed** |
| `platform`: `tests/integration/*` real (indago_test + Redis auth) | **19/19** (store 6, pipeline 7, real-stack 6) |
| `platform`: `npx tsc --noEmit` | clean |
| `ingestion`: `npx vitest run` | **26 files / 301 passed** |
| `ingestion`: `npx tsc --noEmit` | clean |
| `web`: `npx vitest run` | **27 files / 203 passed** (incl. new prod-credential guard tests) |
| `web`: `npx tsc --noEmit` | 8 pre-existing errors in **untracked** files (§9) — none introduced by this work |

## 7. Real-Integration Coverage

`tests/integration/` runs against the real Postgres (`indago_test`, schema in sync) and the
auth-required Redis container:

- **real-stack.e2e.test.ts (6)** — REAL express API → BullMQ → REAL worker → REAL acquisition/
  extraction → Postgres → SSE; producer dedup (same idempotencyKey processed once); real 503
  retry → permanent FAILED with exactly-once `INGESTION_JOB_FAILED` audit (polled, then
  re-verified it does not double); API security 401/403/400; **P0-1 real stream** (401/404/400).
- **ingestion-pipeline.e2e.test.ts (7)** — real worker driven directly against real
  Postgres: run → NORMALIZING; artifact row with content hash + caseId; SUCCEEDED attempt
  with parser provenance; immutable RawExtraction with real text; checkpoint + audit trail;
  content-addressed dedup (two jobs, one artifact row, one attempt); caseId-mismatch rejected
  with run untouched.
- **ingestion-store.test.ts (6)** — store boundary incl. `ensureRawExtraction` collision path.

## 8. Read-Only Regression Scan (proves wiring, not just tests)

Re-run at the end of the session over `platform/src`, `web/src`, `ingestion/src`:

- `verifyCaseAccess` present on **all three** case-guarded read paths (`routes.ts:54,85,205`)
  and the UploadThing callback (`uploadthing.ts:74`);
- auth boundary: `auth.ts:36` prod demo-token rejection; `auth.ts:57` prod case guard.
- ingest-deps policy wiring: allowlist, http opt-in, test-only private-hosts knob all plumbed
  into `HttpArtifactFetcher` (`ingest-deps.ts:48-66`);
- no remaining direct `insertRawExtraction` callsite outside `ensureRawExtraction`
  (`ingestion-store.ts:241`); `TERMINAL_RUN_STATUSES` guard in place (`ingest-evidence.ts:136`);
- web `server.ts:33` prod fail-fast.

## 9. Known Residuals (out of scope this prompt)

1. ~~Web typecheck has 8 pre-existing errors in untracked files~~ — **RESOLVED** in the
   follow-up (see §13.4). Root cause was `noUncheckedIndexedAccess: true` in
   `tsconfig.base.json` (record/array index access widening to `| undefined`) plus missing
   barrel exports. Web `tsc --noEmit` is now clean.
2. **Auth stays dev-grade** but fully **fail-closed**: production rejects the demo token on the
   platform AND in the web client. JWT/OIDC + secret store remains the migration path (§25.3 of
   the Prompt-3 report), unchanged.
3. **UploadThing live handshake** still unit-tested only (needs a live UT secret + browser) —
   unchanged residual from Prompt 3.
4. List/metadata endpoints remain `UNSUPPORTED` projections (Prompt 3 §25.2), unchanged.

## 10. Boundary Compliance

- **No second auth / storage / idempotency / error abstraction was introduced** — the fixes
  reuse `verifyCaseAccess`, `logAuditEvent`, `IngestionStore`, BullMQ `UnrecoverableError`,
  and the existing transitions.
- Canonical contracts unmodified. No observation/entity/lead/graph writes.
- Demo/Live/Auto providers, fixtures, provider interfaces, UI components, wizard internals:
  untouched.
- The only new env surface is the fetcher-policy knobs (`ingest-deps.ts`) with a documented
  TEST-ONLY escape hatch; production defaults are strict.
- Both e2e suites set their fetch-policy escape hatches in `beforeAll`, before dynamic
  imports, so no production code path ever self-degrades.

## 11. MA05 Readiness Gate (§49 update)

Constraints adopted: still **structurally READY (YES)** — and this prompt hardened the gates
around it.

| Prompt-3 gate | Status now |
|---|---|
| `RawExtraction` durable, immutable (`attemptId @unique`) | yes — collision-tolerant `ensureRawExtraction` (P1-5) closes the wedge that could strand it |
| Queryable store boundary, strict types | yes, unchanged |
| Provenance preserved (artifactId, parserId/version, format, attemptNumber, investigationId, extractedAt) | yes, unchanged |
| Raw tier writes no domain rows | yes, unchanged |
| Production auth boundary | **now fail-closed** — prod rejects `demo-token` platform + client (P0-2) |
| Case scope on all evidence surfaces (API reads/writes, SSE, UploadThing callback) | **now complete** (P0-1, P1-3) |
| Egress from ingestion | **now policy-locked** — https/allowlist, private-blocked, redirect-hops re-validated, body deadline (P1-4) |
| Real Postgres + Redis + BullMQ regression | **green, 19/19** this session |

**Gate verdict: READY (YES) — hardened.** MA05 (normalization, analytics) remains the next
prompt’s scope and must not modify `RawExtraction`. The pre-existing web typecheck debt in
untracked UI/provider files (§9.1) is a separate workstream and should be resolved before MA05
UI wiring, but does not block ingestion readiness.

## 12. Run Instructions (reproduce)

```powershell
docker start indago-postgres indago-redis

# platform real verification (indago_test; <password> filled locally, never printed)
Set-Location packages/platform
$env:TEST_DATABASE_URL = "postgresql://indago:<password>@localhost:5432/indago_test"
$env:REDIS_URL = "redis://:<redis-password>@localhost:6379"
npx vitest run --no-file-parallelism tests/integration      # 19/19
npx vitest run --no-file-parallelism                         # 9 files / 115 (incl. integration)

# ingestion + web + typechecks
Set-Location packages/intelligence/ingestion; npx vitest run; npx tsc --noEmit
Set-Location packages/web; npx vitest run                    # 203/203
```

---

## 13. Follow-Up Remediation (user directives)

### 13.1 Production evidence fetch pinned to approved origins (task 1) + DNS-rebinding closure (task 2)

New module `packages/platform/src/queue/artifact-fetch-policy.ts`:
`artifactFetchPolicyFromEnv(env, isProduction)` and exported as type-only
`ArtifactFetchPolicy` through `@indago/ingestion`.

- **Production is fail-closed at boot**: `NODE_ENV=production` **requires**
  `ARTIFACT_ALLOWED_ORIGINS` (a fixed list of approved UploadThing CDN hostnames);
  otherwise module init throws and the API cannot start. No default/silent open policy.
- **Test escapes are refused in production**: `ARTIFACT_ALLOW_HTTP=true` and
  `ARTIFACT_ALLOW_PRIVATE_HOSTS=true` are rejected when `NODE_ENV=production`, so a
  misconfigured prod can never regress to raw http / private-host fetching.
- **DNS-rebinding closed by design**: attackers can only rebind hostnames *they* control,
  and attacker-controlled hostnames can never enter an operator-pinned allowlist; the
  allowlist is therefore inherently rebinding-safe. Defense in depth retained: the fetcher
  still blocks private/metadata ranges and re-validates every redirect hop against the
  permissive/test policy (Prompt-4 P1-4).
- Wired at the **single assembly point** `ingest-deps.ts` (`isProduction =
  process.env.NODE_ENV === "production"`) — the only place `HttpArtifactFetcher` is built.
- Tests: `packages/platform/tests/artifact-fetch-policy.test.ts` (8) — unit suite + full
  platform run green. Integration suites are unaffected (vitest runs `NODE_ENV=test`, so the
  production mandate never trips them).

### 13.2 Anonymous UploadThing uploads: staging semantics — no case-scoped audit (task 3)

Decision adopted: an **anonymous** UploadThing upload is a *provider-upload staging* action.
`handleUploadComplete` returns early for the anonymous principal branch with **no**
`EVIDENCE_UPLOADED` audit (`uploadthing.ts:80`), so no case is associated with an
unauthenticated upload. Only an authenticated principal that passed `verifyCaseAccess`
records the awaited, durable audit. The case-scoped evidence trail is created by the
authorized evidence submission (`EVIDENCE_INGESTED` via BullMQ), not by file staging.
`upload-complete.test.ts` anonymous test now asserts `logAuditEvent` is **not** called.

### 13.3 Bug scanner re-run results (task 4)

Re-ran the read-only wiring sweep against the post-remediation tree. Confirmed, all
attributed to the prompt-4 fixes:

- `verifyCaseAccess` on every evidence surface (`routes.ts` 54/85/205, `uploadthing.ts:85`);
  anon `uploadthing.ts:80` returns before any audit.
- Demo-token production guard (`auth.ts:36/57`) — prod rejects `demo-token` client-side too.
- `HttpArtifactFetcher` constructed **only** at `ingest-deps.ts:44` via the policy module.
- `EVIDENCE_UPLOADED` audit exists only in the authenticated branch (`uploadthing.ts:91-95`).
- `TERMINAL_RUN_STATUSES` guard (`ingest-evidence.ts:64/136`); `ensureRawExtraction`
  collision-tolerant path (`ingestion-store.ts:225`).

Assessed, **not a finding**: `legacy-pipeline.ts:88` `fetch(\`${targetUrl}/ingest\`)`
targets an **operator-configured** `INGESTION_SERVICE_URL` (default
`http://localhost:8080`) — a server-to-server call whose URL is never drawn from
evidence/payload input, gated behind `LEGACY_PIPELINE_ENABLED=true` (default OFF), and
frozen by design (file header: "legacy behavior in, legacy behavior out"). It does not
process `ArtifactReference` URLs and is out of scope of the P1-4 finding.

### 13.4 Web type errors fixed (task 5) — residue §9.1 closed

The 8 pre-existing errors in untracked files are resolved (web `tsc --noEmit` clean):

- `src/lib/upload/types.ts` — `MAX_FILE_COUNTS` narrowed to a finite record
  (`Record<"pdf"|"image"|"text"|"blob", number>`) instead of `Record<string, number>`
  (fixes `noUncheckedIndexedAccess` widening).
- `src/lib/evidence/file-validation.ts` — `evaluateFileCount` returns
  `reason?: EvidenceFileRejectReason` (was `'too-many'` only).
- `src/lib/providers/index.ts` — `CaseProvider` added to the barrel type exports (existed
  in `types.ts`, missing from the barrel).
- `src/components/case-list/case-list.tsx` — `formatUpdated` reads `updatedAt.value` per the
  `ObservedTimeSchema` contract (`{ value, precision: "exact" }`).
- `src/components/evidence/evidence-file-drop.tsx` — `result[0]` guarded against
  `undefined`, upload status set as `"uploaded" as const`.

Type-only changes; web test suite re-ran green (203/203).

### 13.5 Final regression totals after follow-up (sequential runs)

| Suite | Result |
|---|---|
| Platform full (`--no-file-parallelism`, env → `indago_test`) | **9 files / 115 passed** incl. 3 real Postgres+Redis+BullMQ integration suites (19/19) |
| Ingestion full | **301 / 301 passed** |
| Web full | **203 / 203 passed** |
| Typechecks (platform, ingestion dist, web) | clean |

Note: the three suites must run **sequentially**, not concurrently — running them in
parallel starves the timing-sensitive real-stack hooks (server start < 10s, job < 5s) with
OCR/PDF worker load (observed 5 false hook/test-timeout failures under concurrency;
identical code all green when run alone).

---

*No secrets are printed in this report; dev-only container credentials were only ever held
in memory from `docker inspect`. Every assertion in §6 was executed in this session against
the provisioned containers.*