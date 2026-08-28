# F-PR3 Case + Evidence

> Status: implemented (Pass 2 — user interface). Frontend-only. Backend packages, contracts, and intelligence are read-only for this PR.

## Goal

Deliver the permanent **Case + Evidence** user experience: a dashboard case list, a progressive "New Investigation" flow, evidence file intake with metadata/review/submission, an evidence workspace, and reusable evidence list/item components — all behind the F-PR2/F-PR3 provider boundary so the same UI runs against the deterministic demo or the live platform by swapping the provider implementation underneath.

## Existing Architecture Reused

F-PR2 provider architecture was reused rather than rebuilt:

- `WorkspaceProviders` bundle, `WorkspaceShell`, `WorkspaceBoundary`, `useWorkspace()` context.
- `RealtimeProvider` abstraction (SSE normalized + deduplicated; **no** page-level `onEvent → full GET` refresh flood).
- `DataMode` resolution (`demo` / `live` / `auto`) keyed off the caseId, with **no silent live→mock fallback**.
- Distinct `caseId` / `investigationId` / `workspaceId` identities.
- Design system primitives: `Badge`, `Card`, `Button`, `Input`, `Textarea`, `Select`, `LoadingSpinner`, `EmptyState`, `ErrorDisplay`, `ConfidenceIndicator`, `ProvenanceChip` (F-PR1).

## Case List

- `packages/web/src/components/case-list/case-list.tsx` consumes the abstract `CaseProvider` and an explicit `AppDataMode`.
- Constructed in `src/app/page.tsx` via `createCaseListProviders()` — no direct `DemoCaseProvider`/`LiveCaseProvider` instantiation in UI.
- Quiet dark case cards: title, description, status badge, evidence/entity/investigation counts, jurisdiction, updated time, and a small "Demo" designation when in demo mode.
- A case links to its primary investigation via `investigationUrl(primaryInvestigation, caseId)` → `/investigations/<INV>?caseId=<CASE>`.
- No `DEMO_CASE_ID` / `DEMO_INVESTIGATION_ID` literals in the component — values come from provider/domain data.

## Demo Case Discoverability

- `resolveCaseListMode()` returns `demo` in development auto mode when a demo case id is configured, so **Operation Financial Shadow** is discoverable from the dashboard without editing any URL.
- In live mode the case list surfaces a **typed unavailable/empty state**; the demo case is never silently injected into live mode.

## New Investigation Flow

- `packages/web/src/app/investigations/new/page.tsx` implements a calm progressive flow:
  1. **CASE** — enter caseId, validate non-empty, preserve state.
  2. **Preparing** — resolve investigation identity + build intake providers.
  3. **Evidence Intake** — `EvidenceIntake` (context → files → review).
- `caseId` is retained in React state across the whole interaction and re-applied to the URL only at final navigation via `investigationUrl(investigationId, caseId)`.
- `createIntakeProviders(caseId)` is called **only after** a valid non-empty caseId exists and resolves `DataMode` from the actual caseId (never a demo fallback).
- Coordinator drives submission: `investigations.listByCase` → `start(investigationId)` → `intake.evidence.submit(...)` → `router.push(/investigations/<INV>?caseId=<CASE>)`.

## Evidence Intake

- `packages/web/src/components/evidence/evidence-intake.tsx` owns only the UI workflow (Context → Files → Review) and never imports providers/transport/intelligence/DataMode.
- Props inject the boundary: `evidence: EvidenceProvider`, `investigationId`, `caseId?`, `onSubmitEvidence(request)`, `onComplete()`.
- For a new investigation the parent coordinator determines investigationId, starts the investigation, submits evidence, and navigates. For an existing investigation the parent calls `workspace.evidence.submit(...)` and refreshes locally — no `investigation.start()`, no SSE-driven full refetch.

## File Validation

- `packages/web/src/lib/evidence/file-validation.ts` reuses the **existing** upload configuration (`src/lib/upload/types.ts`: `ACCEPTED_FILE_TYPES`, `MAX_FILE_COUNTS`) — no second upload config invented.
- Returns typed per-file verdicts distinguishing `supported` / `unsupported` / `too-large` / `too-many`, with specific messages.
- Invalid files are not uploaded.

## Evidence Metadata

- Limited to fields supported by the canonical contract (`EvidenceSubmissionRequest`): `sourceName`, `sourceDescription`, `evidenceType`, `evidenceTitle`, `evidenceDescription`, `observedAt`, `notes`, `files`. No invented fields.
- Uses existing `Input` / `Textarea` / `Select`; every field is labeled, keyboard-accessible, and preserves user input on step-return (`EvidenceMetadataForm`).

## Evidence Review

- `evidence-review.tsx` shows the case association, evidence context (source/type/title/description/date/notes), the included files (name + size), and a disabled-until-ready **Submit Evidence** action — so the user sees *what* is being submitted, *which case* it is for, *which files* are included, and *where they came from*.

## Evidence Submission

- `EvidenceIntake` calls only its injected `onSubmitEvidence(request)`; the parent/provider coordinator performs the actual provider `submit`. The component never branches on demo/live.
- Demo `submit` derives deterministic IDs and writes into the session-scoped demo evidence registry, returning a canonical `EvidenceSubmissionResponse` (`operationId`, `correlationId`, `jobsEnqueued`, `fileCount`).
- Live `submit` maps to the platform `POST .../evidence` through the server-action RPC seam (`apiSubmitEvidence`).

## Demo Provider Behavior

- `DemoInvestigationProvider.start()` is a deterministic no-op returning a stable `runId` (documented F-PR3 dependency: it does not touch the platform auto-pipeline).
- `DemoEvidenceProvider.prepareUpload()` synthesizes deterministic `UploadedFileReference`s (`demo:...`) with **no network upload**.
- `DemoEvidenceProvider.submit()` records canonical `Evidence` into the module-level session registry (`demo/session.ts`), idempotently deterministic, returning a canonical response.
- `CaseProvider.list()` returns the authored demo case so the dashboard can render it.

## Live Provider Behavior

- `LiveCaseProvider` throws a typed `UNSUPPORTED` `ProviderError` (no case-list endpoint) → the Case List shows the typed unavailable state.
- `LiveEvidenceProvider.prepareUpload()` uses the real UploadThing helper (`lib/upload/uploadthing.ts` → `casePackUploader`).
- `LiveEvidenceProvider.submit()` and `LiveInvestigationProvider.get/start()` call the platform through the server-action RPC seam.
- Unsupported live list methods throw typed `UNSUPPORTED` errors — the UI surfaces honest "unavailable" states rather than fabricating data.

## UploadThing Boundary

- The presentation layer (`src/components/**`, `src/app/**`) has **zero** UploadThing imports. UploadThing lives behind `LiveEvidenceProvider.prepareUpload()`.
- The UI consumes only `EvidenceProvider.prepareUpload()`.
- Enforced by an updated `tests/auth-boundary.test.ts` that asserts zero `uploadthing` / server-action / `platformFetch` / `new WebSocket(` references across presentation components.
- The orphaned legacy presentation components that bypassed the boundary (`evidence-submission.tsx`, `file-upload.tsx`, `investigation-detail.tsx`) were removed; they were unreachable legacy code.

## Content Hash / Artifact Identity Boundary

- No browser SHA-256, no new artifact identity rules, no filename-based identity invented.
- The demo keeps the clearly-prefixed placeholder `demo-contenthash:<uuid>` (preserved boundary); real content hashing and artifact identity remain backend responsibility.

## Realtime

- The evidence workspace does **not** subscribe a page handler that calls the full investigation endpoint per event. Evidence updates are localized (`workspace.evidence.submit` then a single deliberate post-submit `load()`).
- The overview reconnect resync only refetches on `STREAM_CONNECTED` after the first connect (no flood).

## caseId / investigationId Routing

- All investigation workspace links are built with the centralized helper `src/lib/workspace/url.ts` (`investigationUrl`, `appendCaseId`) which always preserves `?caseId=<CASE>`.
- Example: `/investigations/<INV>?caseId=<CASE>` and `/investigations/<INV>/evidence?caseId=<CASE>`.
- `investigationId` (route) and `caseId` (query) stay distinct; `workspaceId` keys the provider bundle instance.

## Error Handling

- Provider failures normalize to `ProviderError` with stable codes/categories and feed the existing `ErrorDisplay`.
- `UNSUPPORTED` → typed unavailable state; `NETWORK`/`SERVER` → error state with retry; empty → `EmptyState`.
- Form validation errors are inline and specific (never a generic "Something went wrong").

## Accessibility

- Drag/drop plus a full file picker; keyboard-activatable drop zone; keyboard remove buttons; labels on every field; focus-visible outlines; semantic buttons; non-color-only status text (`Pending`/`Uploading`/`Uploaded`/`Failed`); accessible file progress; reduced-motion compatibility (document tile animation disabled under `prefers-reduced-motion`).

## Responsive Behavior

- Desktop: comfortable evidence workspace.
- Tablet: file + metadata areas stack.
- Mobile: single column, full-width drop zone, stacked evidence items, metadata below, review becomes vertical. No horizontal overflow.

## Tests

Added UI + integration suites (all green):

- `tests/case-list.test.tsx` — loads demo case, empty, error, typed unsupported, correct `/investigations/<INV>?caseId=<CASE>` route, no-link case, retry.
- `tests/evidence-file-drop.test.tsx` — adds files, multiple files, rejects unsupported/oversized (no upload), progress, success, failure, per-file isolation, retry, remove, keyboard interaction.
- `tests/evidence-intake.test.tsx` — context → files → review, validation, metadata preservation, submit, submission error + retry.
- `tests/evidence-list.test.tsx` — renders items, empty, loading, error + retry, typed unavailable.
- `tests/file-validation.test.ts` — supported / unsupported / too-large / too-many, reuse of upload-config constants.
- `tests/demo-evidence-flow.test.ts` — full §40 flow: demo mode → prepareUpload → metadata → submit → session registry contains fixture + submitted evidence → fresh workspace bundle re-list (navigation survival) → `resetDemoSession` → submitted evidence disappears; confirms the registry never stores raw `File` objects/bytes.
- Updated `tests/auth-boundary.test.ts` — asserts the provider boundary (0 UploadThing/server-action/platform references in presentation).

## Browser Verification

- Dashboard → Case List → Operation Financial Shadow → Open Investigation → Workspace. No manual ID pasting.
- `/investigations/new`, enter the demo case id → continue → upload/select evidence → metadata → review → submit → navigation to the demo investigation workspace.
- Add Evidence from an existing investigation workspace; evidence list updates via a single post-submit refresh; `?caseId=` retained; demo mode remains demo after navigation/refresh.

## Platform-OFF Demo Verification

- With the demo case and the platform server stopped, the full demo path (Case List → Investigation → Evidence → Add → Submit) still works, because the demo provider synthesizes everything deterministically and never reaches the platform. This demonstrates the frontend/provider separation is real.

## Live Verification

- A non-demo caseId resolves to `LIVE`; the demo case/evidence is never injected; live list endpoints that are unexposed surface the typed unavailable state honestly. Live `start`/`submit`/`prepareUpload` are wired to the platform RPC seam.

## Architecture Audit

- `DesignerProvider`/`LiveProvider`/`UploadThing`/`platformFetch`/server-action/`new WebSocket(`/`as any`/`@ts-ignore` across `src/components/**` and `src/app/**`: **0 matches** (enforced by test).
- Transport calls live only in the sanctioned provider layer (`lib/providers/live/**`) and `lib/api/**`.
- `git diff --name-only` limited to `packages/web/**` and this doc; no staged/reverted backend changes.

## Backend Dependencies

- Case catalog endpoint (live) — not yet exposed; surfaces as typed unavailable.
- Investigation/evidence list endpoints (live) — not yet exposed; typed unavailable.
- Existing duplicate/idempotency handling in evidence submission — the provider result is preserved and surfaced as-is; no client dedup invented.
- Real content hashing / artifact identity — remains backend responsibility (demo uses a clearly-marked placeholder).

## Deferred F-PR4+

- Live case-list catalog ingestion.
- Live evidence listing/retrieval endpoints and artifact detail views.
- SSE/progress-driven updates surface submitted evidence incrementally once live event contracts exist.
- Branding/visual polish pass beyond the F-PR1 system.

## Definition of Done

- [x] Case List exists
- [x] Demo case discoverable without manual URL editing
- [x] Demo case uses provider boundary
- [x] Live CaseProvider path exists (typed unavailable)
- [x] New Investigation is progressive
- [x] caseId survives the entire flow
- [x] Evidence upload UI exists
- [x] Drag/drop + picker work
- [x] Multiple files work
- [x] Validation works
- [x] Upload progress works
- [x] Per-file remove works
- [x] Retry works
- [x] Metadata uses canonical/current fields
- [x] Review step exists
- [x] Demo evidence submission works
- [x] Submitted demo evidence survives navigation
- [x] Evidence workspace exists
- [x] Existing investigation can receive evidence
- [x] Evidence list works
- [x] No direct UploadThing use in UI
- [x] No direct platform API use in presentation components
- [x] No SSE refresh flood
- [x] caseId preserved across workspace routes
- [x] investigationId remains distinct
- [x] demo mode remains demo after navigation
- [x] non-demo case never receives demo data
- [x] Demo works with platform OFF
- [x] Live path does not fabricate unsupported backend behavior
- [x] accessibility works
- [x] reduced motion works
- [x] tests pass
- [x] typecheck passes
- [x] build passes
- [x] backend packages untouched
- [x] contracts untouched
- [x] intelligence untouched
- [x] final architecture audit passes
- [x] docs/frontend/f-pr3-case-evidence.md exists
