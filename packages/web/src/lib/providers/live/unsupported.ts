// ============================================================================
// F-PR2 Live — Unsupported helper
//
// Returns a rejected promise carrying a ProviderError.UNSUPPORTED for platform
// endpoints not yet exposed. Keeps typing simple (never for data, never for
// paginated).
// ============================================================================

import { ProviderError } from "../types";

function messageFor(feature: string): string {
  return `Live "${feature}" is not exposed by the platform yet (documented F-PR2 dependency).`;
}

/** Rejected promise for a single-value endpoint. */
export function providerUnsupported<T = never>(feature: string): Promise<T> {
  return Promise.reject(ProviderError.unsupported(messageFor(feature)));
}

/** Rejected promise for a paginated endpoint. */
export function providerUnsupportedPaginated<T = never>(
  feature: string,
): Promise<{ items: T[]; page: number; pageSize: number; totalItems: number; hasMore: boolean }> {
  return Promise.reject(ProviderError.unsupported(messageFor(feature)));
}
