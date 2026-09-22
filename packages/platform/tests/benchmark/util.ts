// ============================================================================
// INTERNAL PILOT EVALUATION  ·  PROTOTYPE BENCHMARK  ·  SYNTHETIC / DE-IDENTIFIED
// Deterministic utilities for the INDAGO pilot benchmark. No wall clock, no
// entropy, no randomness: same seed ⇒ same corpus ⇒ same numbers.
// ============================================================================

import { createHash, randomUUID } from 'node:crypto';

export function sha256Hex(parts: readonly string[]): string {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex');
}

/** Mulberry32 — deterministic, seedable PRNG (State: Number → () → float [0,1)). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeededRng {
  next(): number;
  int(maxExclusive: number): number;
  intRange(min: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  pickN<T>(items: readonly T[], count: number): T[];
  chance(p: number): boolean;
  shuffle<T>(items: readonly T[]): T[];
}

export function seeded(seed: number): SeededRng {
  const next = mulberry32(seed);
  return {
    next,
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive),
    intRange: (min: number, maxInclusive: number) =>
      min + Math.floor(next() * (maxInclusive - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    pickN: <T>(items: readonly T[], count: number): T[] => {
      const copy = [...items];
      const out: T[] = [];
      for (let i = 0; i < Math.min(count, copy.length); i++) {
        const idx = Math.floor(next() * copy.length);
        out.push(copy.splice(idx, 1)[0]!);
      }
      return out;
    },
    chance: (p: number) => next() < p,
    shuffle: <T>(items: readonly T[]): T[] => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = copy[i]!;
        copy[i] = copy[j]!;
        copy[j] = tmp;
      }
      return copy;
    },
  };
}

/** Stable (key-sorted) JSON serialization — inputs in any order hash identically. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = sortKeys(obj[key]);
    return out;
  }
  return value;
}

/** Deterministic UUID v4-formatted string from a numeric "slot" (prototype IDs). */
export function longUuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/** Stable "nth" slot derived from a string (hex 12 chars) for deterministic UUIDs. */
export function uuidSlotFromHash(hex: string): string {
  return hex.slice(0, 12);
}

export function uuidFrom(name: string): string {
  return `00000000-0000-4000-8000-${sha256Hex([name]).slice(0, 12)}`;
}

export function isoTime(offsetMinutes: number): string {
  const base = Date.parse('2026-01-01T00:00:00.000Z');
  return new Date(base + offsetMinutes * 60_000).toISOString();
}

// ---------------------------------------------------------------------------
// Statistics (deterministic — no dependency on array order beyond inputs)
// ---------------------------------------------------------------------------

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function pctRanked(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((q / 100) * (sorted.length - 1))));
  return sorted[idx]!;
}

export function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function safeDiv(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

export function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const item of a) if (b.has(item)) inter += 1;
  let union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

export function setEq<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

export function unionFind(n: number): {
  find(x: number): number;
  union(a: number, b: number): void;
  components(): { root: number; members: number[] }[];
} {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let cur = x;
    while (parent[cur] !== cur) {
      const gp = parent[parent[cur]!]!;
      parent[cur] = gp;
      cur = parent[cur]!;
    }
    return cur;
  };
  return {
    find,
    union: (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    },
    components: () => {
      const map = new Map<number, number[]>();
      for (let i = 0; i < n; i++) {
        const r = find(i);
        const list = map.get(r);
        if (list === undefined) map.set(r, [i]);
        else list.push(i);
      }
      return [...map.values()].map((members) => ({ root: find(members[0]!), members }));
    },
  };
}

// Fault-injection helpers -----------------------------------------------------

export function checked<T>(fn: () => T): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

export async function checkedAsync<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

export function isDiagEnabled(): boolean {
  return envFlag('INDAGO_BENCH_DIAG', false);
}

export function envFlag(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

export function randomPilotId(): string {
  return randomUUID();
}