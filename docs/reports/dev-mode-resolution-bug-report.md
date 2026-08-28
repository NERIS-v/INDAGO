# Bug Report — Dev/Demo Mode Resolution Fails Inside the Investigation Workspace

**Status:** Fixed in working tree (uncommitted, `packages/web/**` + docs only).
**Severity:** High (demo workspace resolved to the live provider; SSE 500 on platform-down).
**Reported by:** Manual demo-flow testing (user pasted runtime logs).
**Frontend-only fix:** No changes to `packages/platform/**`, `packages/contracts/**`, or `packages/intelligence/**`.

---

## 1. Summary

While manually testing the F-PR3 demo flow, the **dashboard ("Cases") resolved to `DemoCaseProvider` correctly**, but the **investigation workspace page resolved to `LiveRealtimeProvider`** for the exact same demo case URL:

```
[realtime][overview] {"mode":"live","provider":"LiveRealtimeProvider","caseId":"b1e0c9a6-0000-4000-8000-000000000001"}
[realtime][LIVE] connect() — used when NOT in demo mode
```

A second, related defect surfaced at the same time: with the platform NOT running, the SSE route returned an unhandled **HTTP 500** instead of a controlled error, so the live path logged repeated 502/500 SSE failures.

This document records the root cause, the fix, and the affected code for the audit.

---

## 2. Root Cause A — `NEXT_PUBLIC_*` not inlined for dynamic-key access

### The mechanism

Next.js / Turbopack statically inline **only direct member access** to `NEXT_PUBLIC_*` at build time:

```js
// INLINED — the build replaces this with the literal value.
process.env.NEXT_PUBLIC_DATA_MODE
```

```js
// NOT INLINED — dynamic key lookup is left as a runtime reference to the
// client-side process.env polyfill, which contains NEITHER key.
const KEY = "NEXT_PUBLIC_DATA_MODE";
env[KEY]
```

On the client, `process.env` is a compile-time-replaced shell. Dynamic-key reads therefore resolve to `undefined` on the browser, even though the value exists in `.env.local` at the server/build boundary.

### The trigger

`packages/web/src/lib/providers/config.ts` reads the mode via a **dynamic index** derived from a constant:

```ts
const raw = parseDataMode(env[DATA_MODE_ENV]);        // env["NEXT_PUBLIC_DATA_MODE"]
const demoCaseId = env[DEMO_CASE_ID_ENV];             // env["NEXT_PUBLIC_DEMO_CASE_ID"]
```

These reads are correct **only if the caller hands over an env that already carries the inlined values**. In dev auto mode with no demo case id visible, resolution fell back to `live`.

### The first (partial) fix — `getEffectiveEnv()`

`config.ts` gained a helper that **statically** reads the two relevant variables (so the literals are inlined) and merges them back over `process.env`:

```ts
export function getEffectiveEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (env) return env;                                  // explicit env (tests) pass through
  const staticPublic = {
    [DATA_MODE_ENV]:   process.env.NEXT_PUBLIC_DATA_MODE,   // STATIC → inlined
    [DEMO_CASE_ID_ENV]: process.env.NEXT_PUBLIC_DEMO_CASE_ID,
  };
  return { ...process.env, ...staticPublic };
}
```

All factory/config functions default their `env` parameter to `getEffectiveEnv()`, so callers that omit `env` get the corrected view.

### Why the dashboard worked but the workspace didn't

- `src/app/page.tsx` calls `createCaseListProviders()` with **no** env → uses the `getEffectiveEnv()` default → **demo** correct.
- `src/lib/providers/workspace/boundary.tsx` (the workspace) called `createWorkspaceProviders(identity, process.env)` — it passed `process.env` **explicitly**, which **bypassed** the `getEffectiveEnv()` default. The raw client `process.env` polyfill has none of the NEXT_PUBLIC values → `auto` + empty `demoCaseId` → **live**.

### The definitive fix

`src/lib/providers/workspace/boundary.tsx:53`

```ts
// BEFORE
const providers = useMemo(
  () => createWorkspaceProviders(identity, process.env),
  [identity],
);

// AFTER
const providers = useMemo(() => createWorkspaceProviders(identity), [identity]);
```

Now the workspace uses the same `getEffectiveEnv()` default path as the dashboard, so the demo case URL resolves to `DemoRealtimeProvider`.

### Verification

After the fix the dashboard already logged `{"mode":"demo","provider":"DemoCaseProvider"}`. The workspace must be re-verified with a **full restart** — `NEXT_PUBLIC_*` are inlined at build time, so a stale `.next` or browser bundle can mask the fix.

Required for confirmation:
1. Stop the dev server.
2. Delete `packages/web/.next`.
3. `pnpm --filter @indago/web dev` (the user runs `next dev --turbopack --port 3000`).
4. Hard-refresh on:
   `/investigations/b1e0c9a6-0000-4000-8000-000000000002?caseId=b1e0c9a6-0000-4000-8000-000000000001`
5. Expected: `mode: "demo"`, `provider: "DemoRealtimeProvider"`, no SSE connection attempt.

### Env notes (not a bug)

- `.env.local` (`NEXT_PUBLIC_DATA_MODE=auto`, `NEXT_PUBLIC_DEMO_CASE_ID=b1e0c9a6-...001`) overrides `.env.development` (`demo`) → effective dev mode is `auto`. With the fix, `auto` + `isDevelopment() === true` + `demoCaseId` set → resolves `demo`.
- No OS-level `NEXT_PUBLIC_*` overrides exist (checked).
- Changing `NEXT_PUBLIC_*` requires full dev-server restart + `.next` clear + browser hard refresh.

---

## 3. Root Cause B — SSE route returned 500 when the platform is down

`src/app/api/sse/[investigationId]/route.ts` wrapped the platform `fetch` in a try/catch and now returns a clean **502** `{"error":"Platform unreachable"}` instead of an unhandled 500.

- **Before:** unhandled exception → Next 500.
- **After:** explicit 502 JSON; `sse-client.ts` treats a non-OK response as a transport error and, for demo mode, this path is never entered anyway.

---

## 4. Related cleanup performed in the same pass

- Removed all temporary `[realtime]` debug logs:
  - `src/lib/realtime/sse-client.ts` (opening / non-ok)
  - `src/lib/providers/live/realtime.ts` (`LIVE connect`)
  - `src/lib/providers/demo/realtime.ts` (`demo connect`)
  - `src/app/investigations/[id]/investigation-overview.tsx` (`overview` / `event`)
- Fixed a tautological ternary in `DemoRobustnessProvider.getResult` (`demo/providers.ts`) that always returned the same value; it now throws `ProviderError.notFound()` for an unknown hypothesis.

---

## 5. Affected files

| File | Change |
| --- | --- |
| `src/lib/providers/config.ts` | Added `getEffectiveEnv()`; static NEXT_PUBLIC reads. |
| `src/lib/providers/factory.ts` | All 5 functions default `env = getEffectiveEnv()`. |
| `src/lib/providers/workspace/boundary.tsx` | Stop passing `process.env` explicitly (the bug). |
| `src/app/api/sse/[investigationId]/route.ts` | 502 on platform-unreachable (the bug). |
| `src/lib/realtime/sse-client.ts` | Removed debug logs. |
| `src/lib/providers/demo/realtime.ts` | Removed debug log. |
| `src/lib/providers/live/realtime.ts` | Removed debug log. |
| `src/app/investigations/[id]/investigation-overview.tsx` | Removed debug logs. |
| `src/lib/providers/demo/providers.ts` | Fixed tautological robustness ternary. |

---

## 6. Lessons for the audit

1. **Never pass `process.env` explicitly** to functions that default to `getEffectiveEnv()` — it defeats the inlining fix. The default is the correct path.
2. **`NEXT_PUBLIC_*` must be read via static member access** (`process.env.X`), never `env["X"]` with a variable key, or the client bundle loses the value.
3. **Stale-bundle masking:** because `NEXT_PUBLIC_*` is inlined at build, "mode shows live despite demo" can reappear after a partial restart. Always do a full `.next` clear + hard refresh before judging.
