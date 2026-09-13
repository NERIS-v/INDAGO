// ============================================================================
// Detector run accounting (Phase 5A-PR4)
//
// Each detector gets its OWN DetectorRun: a local, deterministic budget of
// structural evaluations plus its emitted candidates. `DetectorRun` is what
// makes every detector independently testable and disable-able — orchestration
// simply runs the enabled detectors in frozen order.
//
// Bound semantics are DETECTOR-LOCAL and kept strictly apart from the region
// construction budget metadata (graph-hole-region) so the two never blur.
// ============================================================================

import type { DetectorBoundKind, GraphHoleDetectorMetadata, GraphHoleType } from '@indago/contracts';
import { DETECTOR_BOUNDS } from '../bounds.js';
import type { DetectorCandidate } from '../types.js';

export class DetectorRun {
  readonly candidates: DetectorCandidate[] = [];
  pairEvaluations = 0;
  boundReached = false;
  boundKind: DetectorBoundKind | undefined;

  constructor(readonly detectorType: GraphHoleType) {}

  /** Reserve one structural evaluation. false when the detector-local budget is exhausted. */
  evaluate(): boolean {
    this.pairEvaluations += 1;
    return this.pairEvaluations <= DETECTOR_BOUNDS.maxPairEvaluationsPerDetector;
  }

  /** Halt this run because a detector-local bound was hit (deterministic). */
  stop(boundKind: DetectorBoundKind): void {
    this.boundReached = true;
    this.boundKind = boundKind;
  }

  emit(candidate: DetectorCandidate): void {
    this.candidates.push(candidate);
  }

  metadata(): GraphHoleDetectorMetadata {
    return {
      detectorType: this.detectorType,
      pairEvaluations: this.pairEvaluations,
      boundReached: this.boundReached,
      ...(this.boundKind === undefined ? {} : { boundKind: this.boundKind }),
    };
  }
}