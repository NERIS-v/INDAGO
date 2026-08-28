// ============================================================================
// LIVE — API error → ProviderError mapping
//
// Server-side platform calls (lib/api/server.ts) throw a duplicate-typed
// ApiError (a plain Error with `status` / `body` attached). The ProviderError
// model in the provider boundary feeds ErrorDisplay. This module translates
// platform failures into the frontend error model and NEVER fabricates data:
// a failed live call always surfaces as a typed ProviderError, never as an
// empty/demo result.
//
// Mapping (Prompt 2/3 §19):
//   401 → authorization (auth required)
//   403 → authorization (case boundary denied)
//   404 → notFound
//   409 → conflict
//   5xx / TypeError / config  → server / network (backend unavailable)
// ============================================================================

import { ProviderError } from "../types";

interface LiveApiErrorLike extends Error {
  readonly status?: unknown;
  readonly body?: unknown;
}

function isApiErrorLike(err: unknown): err is LiveApiErrorLike {
  return (
    err instanceof Error &&
    typeof (err as { status?: unknown }).status === "number"
  );
}

/** Map one thrown value from a live backend call to a ProviderError. */
export function toLiveProviderError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;

  if (isApiErrorLike(err)) {
    const status = err.status as number;
    if (status === 401 || status === 403) {
      return ProviderError.authorization(
        err.message || "The request is not authorized.",
      );
    }
    if (status === 404) {
      return ProviderError.notFound(err.message || "Not found.");
    }
    if (status === 409) {
      return new ProviderError(err.message || "Conflict.", {
        code: "CANCELLED",
        category: "CONFLICT",
      });
    }
    if (status >= 500) {
      return ProviderError.server(err.message, err);
    }
    return ProviderError.validation(
      err.message || "The data provider returned an invalid response.",
      err,
    );
  }

  if (err instanceof TypeError) {
    // fetch network/stream failure.
    return ProviderError.network(err.message, err);
  }

  return ProviderError.server(
    err instanceof Error
      ? err.message
      : "The data provider returned an unexpected error.",
    err,
  );
}