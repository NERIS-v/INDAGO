import type { EntityMentionCandidate, EntityType } from '@indago/contracts';
import type { RegionObservation } from '../src/types.js';

export const LONG_UUID = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const CASE_ID = LONG_UUID(900);
export const GRAPH_VERSION_ID = LONG_UUID(910);
export const INVESTIGATION_ID = LONG_UUID(911);
export const REGION_ID = `a${'b'.repeat(63)}`;
export const REGION_POLICY_VERSION = 'v1';

export function makeCandidate(
  n: number,
  opts: {
    type?: EntityType;
    value?: string;
    text?: string;
    observation?: number;
  } = {},
): EntityMentionCandidate {
  return {
    id: LONG_UUID(n),
    observationId: LONG_UUID(opts.observation ?? 100 + n),
    text: opts.text ?? opts.value ?? 'mention',
    start: 0,
    end: 5,
    ...(opts.type !== undefined ? { entityType: opts.type } : {}),
    extractionMethod: 'HEURISTIC_FALLBACK',
    ...(opts.value !== undefined ? { canonicalMatchValue: opts.value } : {}),
    provenance: {
      sourceId: LONG_UUID(11),
      artifactId: LONG_UUID(1),
      extractor: 'indago-observation-extractor@1.0.0',
      extractionMethod: 'text-decode',
    },
    createdAt: { value: '2026-01-01T00:00:00.000Z', precision: 'exact' },
    updatedAt: { value: '2026-01-01T00:00:00.000Z', precision: 'exact' },
  };
}

export function makeObservation(
  n: number,
  temporal?: {
    eventTime?: string;
    observedAt?: string;
    validityStart?: string;
    validityEnd?: string;
  },
): RegionObservation {
  // Observation id is LONG_UUID(n) — the observation NUMBER itself, matching
  // makeCandidate(_, { observation: n }).observationId.
  const obs: RegionObservation = { id: LONG_UUID(n) };
  if (temporal?.eventTime !== undefined) {
    obs.eventTime = { value: temporal.eventTime, precision: 'exact' };
  }
  if (temporal?.observedAt !== undefined) {
    obs.observedAt = { value: temporal.observedAt, precision: 'exact' };
  }
  if (temporal?.validityStart !== undefined) {
    obs.validityInterval = {
      validFrom: { value: temporal.validityStart, precision: 'exact' },
      ...(temporal.validityEnd !== undefined
        ? { validTo: { value: temporal.validityEnd, precision: 'exact' } }
        : {}),
    };
  }
  return obs;
}