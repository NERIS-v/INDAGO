// ============================================================================
// Graph-hole candidate orchestrator (Phase 5A-PR4)
//
// Deterministic order → detectors → materialize → identity dedup (first wins
// in frozen order) → sort by candidateId → region candidate cap.
//
// The final result carries full accounting: every detector run is rolled up
// (pairEvaluations, boundReached, boundKind), every duplicate suppression and
// every cap drop is counted, and the capped output is sorted byte-stable by
// candidateId. This is a PURE, READ-ONLY computation with zero side effects.
// ============================================================================

import type { GraphHoleType, RawGraphHoleCandidate } from '@indago/contracts';
import { byAscendingId } from './determinism.js';
import { DETECTOR_BOUNDS } from './bounds.js';
import { buildDetectionContext } from './context.js';
import { materializeCandidate } from './candidate.js';
import { detectMissingEdge } from './detectors/missing-edge.js';
import { detectMissingPath } from './detectors/missing-path.js';
import { detectIsolatedNode } from './detectors/isolated-node.js';
import { detectBrokenChain } from './detectors/broken-chain.js';
import { detectTemporalGap } from './detectors/temporal-gap.js';
import { detectCommunityBoundary } from './detectors/community-boundary.js';
import { DetectorRun } from './detectors/run.js';
import type { DetectionInput, GraphHoleDetectionResult } from './types.js';

/** Frozen, canonical detector evaluation order. */
export const DETECTOR_ORDER: readonly GraphHoleType[] = [
  'MISSING_EDGE',
  'MISSING_PATH',
  'ISOLATED_NODE',
  'BROKEN_CHAIN',
  'TEMPORAL_GAP',
  'COMMUNITY_BOUNDARY',
];

/**
 * Deterministic, bounded detection entry point.
 *
 * Returns a region-preserved result with:
 *   - sorted, deduplicated, capped raw candidates
 *   - full per-detector accounting (pairEvaluations, bound metadata)
 *   - drop counts and cap flags (never silent)
 *
 * Throws `GraphHoleDetectionError` when the supplied input violates the
 * closed-world assumptions (authority mismatch or missing observation source).
 */
export function detectGraphHoleCandidates(input: DetectionInput): GraphHoleDetectionResult {
  const context = buildDetectionContext(input);
  const enabled =
    context.enabledDetectors.length > 0
      ? new Set(context.enabledDetectors)
      : new Set(DETECTOR_ORDER);

  const runByType = new Map<GraphHoleType, DetectorRun>();

  for (const type of DETECTOR_ORDER) {
    if (!enabled.has(type)) continue;
    let run: DetectorRun;
    switch (type) {
      case 'MISSING_EDGE':
        run = detectMissingEdge(context);
        break;
      case 'MISSING_PATH':
        run = detectMissingPath(context);
        break;
      case 'ISOLATED_NODE':
        run = detectIsolatedNode(context);
        break;
      case 'BROKEN_CHAIN':
        run = detectBrokenChain(context);
        break;
      case 'TEMPORAL_GAP':
        run = detectTemporalGap(context);
        break;
      case 'COMMUNITY_BOUNDARY':
        run = detectCommunityBoundary(context);
        break;
      default:
        throw new Error(`unknown detector type ${type}`);
    }
    runByType.set(type, run);
  }

  // Materialize + deterministic identity dedup (first detector wins).
  const materialized: RawGraphHoleCandidate[] = [];
  const seenIds = new Set<string>();
  let duplicateSuppressions = 0;
  for (const type of DETECTOR_ORDER) {
    const run = runByType.get(type);
    if (run === undefined) continue;
    const metadata = run.metadata();
    for (const candidate of run.candidates) {
      const raw = materializeCandidate(context, candidate, metadata);
      if (seenIds.has(raw.candidateId)) {
        duplicateSuppressions += 1;
        continue;
      }
      seenIds.add(raw.candidateId);
      materialized.push(raw);
    }
  }

  materialized.sort((a, b) => byAscendingId(a.candidateId, b.candidateId));

  // Region candidate cap.
  const cap = DETECTOR_BOUNDS.maxRegionCandidates;
  let droppedCandidateCount = 0;
  let regionCandidateCapReached = false;
  if (materialized.length > cap) {
    droppedCandidateCount = materialized.length - cap;
    regionCandidateCapReached = true;
    materialized.length = cap;
  }

  return {
    candidates: materialized,
    region: context.region,
    summary: {
      hypothesisContext: {
        atomicHypotheses: context.hypothesisContext.atomic.length,
        groups: context.hypothesisContext.groups.length,
        components: context.hypothesisContext.accounting.components,
      },
      detectors: DETECTOR_ORDER.filter((type) => enabled.has(type)).map((type) => {
        const run = runByType.get(type)!;
        return {
          detectorType: type,
          candidates: run.candidates.length,
          pairEvaluations: run.pairEvaluations,
          boundReached: run.boundReached,
          ...(run.boundKind === undefined ? {} : { boundKind: run.boundKind }),
        };
      }),
      duplicateSuppressions,
      regionTruncated: context.region.truncated,
      regionCandidateCapReached,
      droppedCandidateCount,
      candidateCap: cap,
    },
  };
}