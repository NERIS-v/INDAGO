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

1. **Create Investigation** — Enter a case ID, the frontend generates a UUID and calls `POST /api/v1/investigations/start`
2. **Upload Evidence** — Select files via UploadThing client, files go directly to the platform UploadThing route
3. **View Status** — Investigation detail page shows current state, stage, and error via `GET /api/v1/investigations/:id`
4. **Real-time Updates** — SSE stream at `GET /api/v1/investigations/:id/stream` displays audit events in the activity feed

## Architecture

```
packages/web → @indago/platform public API (REST + SSE)
packages/web → @indago/contracts (shared types)
packages/web → UploadThing client SDK → platform UploadThing route
```

The web package does NOT import from:
- `packages/platform/src/...`
- BullMQ, Redis, Prisma, or any platform internals

## Not Implemented (Future PRs)

- Normalization UI
- Entity graph visualization
- Lead cards
- Evidence panel
- Agent workspace
- Investigation listing/search
- Production authentication (OAuth, sessions)

## Tests

```bash
pnpm test
```

## Build

```bash
pnpm build
```
