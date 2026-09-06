# @indago/web

Next.js frontend for the INDAGO Intelligence Analysis Platform.

## Prerequisites

- Node.js 22+
- pnpm
- `@indago/platform` running on `NEXT_PUBLIC_API_URL`

## Setup

```bash
# From repository root
pnpm install

# Start the platform backend first (port 3000)
cd packages/platform && pnpm dev

# Then start the web frontend (port 3001)
cd packages/web && pnpm dev
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Platform API base URL (e.g. `http://localhost:3000`) |
| `AUTH_TOKEN` | Yes | Bearer token for platform API. **Development only** — server-side only, never exposed to browser. |

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

## Local Development

| Service | Port | URL |
|---|---|---|
| Platform API | 3000 | http://localhost:3000 |
| Web Frontend | 3001 | http://localhost:3001 |

## Current Flows

1. **Cases dashboard** — `/` lists demo/live cases from the provider seam with a New Investigation entry point.
2. **Create Investigation** — Enter a case ID, the frontend generates a UUID and calls `POST /api/v1/investigations/start`.
3. **Upload Evidence** — Select files via UploadThing client, files go directly to the platform UploadThing route.
4. **View Status** — Investigation detail page shows current state, stage, and error via `GET /api/v1/investigations/:id`.
5. **Real-time Updates** — SSE stream at `GET /api/v1/investigations/:id/stream` displays audit events in the activity feed.
6. **Investigative workspace** — `/investigations/[id]/graph` hosts the five-zone shell (rail, graph/representation, contextual panel, temporal, intelligence) against the DEMO / LIVE / AUTO provider boundary. Zone 2 supports graph, entity pulse, relationship matrix, and adaptive flow representations under one shared temporal controller.
7. **Hypothesis** — `/investigations/[id]/hypothesis` keeps the previous hypothesis pipeline as the default mode and adds the deterministic Reverse Hypothesis mode (supporting / contradicting / unresolved counts with reasons, session decision trail; no scores or AI verdicts).

## Data Mode

- **DEMO** — deterministic fixture providers (default). The UI never fabricates data; typed-unsupported seams render honest panels.
- **LIVE** — real backend providers where implemented.
- **AUTO** — capability-level resolution (per capability, falls back to demo when a live seam is `not-ready`).

## Architecture

```
packages/web → @indago/platform public API (REST + SSE)
packages/web → @indago/contracts (shared types)
packages/web → UploadThing client SDK → platform UploadThing route
```

The web package does NOT import from:
- `packages/platform/src/...`
- BullMQ, Redis, Prisma, or any platform internals

## Implemented (selected)

- Five-zone investigative shell + graph control center (PR-2), operational rail (PR-4)
- Investigative intelligence tabs — Overview / Hypotheses / Signals / Evidence / Activity (PR-5)
- Representation-aware Zone 2: entity pulse (F-PR6), relationship matrix (F-PR7), adaptive flow (F-PR8)
- Living graph visual language with attention convergence (PR-6), cinematic theme (PR-9)
- Temporal activity/version context with authority gate (PR-7)
- Relation authority, contradiction deep-dive bridges, Challenge seam (PR-8)
- Deterministic Reverse Hypothesis mode beside the preserved pipeline (F-PR9)
- Accessibility, deep links, error boundaries, realtime/stability hardening (PR-10)

## Not Implemented (Future PRs)

- Normalization UI
- Agent workspace
- Investigation search beyond the case dashboard
- Production authentication (OAuth, sessions)

## Tests

```bash
pnpm test
```

## Build

```bash
pnpm build
```
