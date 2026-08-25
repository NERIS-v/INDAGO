import type { RobustnessResult } from '../src/intelligence/robustness.js';
import { FIXTURE_IDS } from './ids.js';

// ============================================================================
// Robustness Fixtures
// ============================================================================

export const FIXTURE_ROBUSTNESS_RESULT_1: RobustnessResult = {
  hypothesisId: FIXTURE_IDS.hypothesis1,
  robustnessScore: 72,
  confidence: 0.85,
  perturbationCount: 100,
  stableIterations: 72,
  unstableIterations: 28,
  sensitiveObservations: [FIXTURE_IDS.observation2],
  stableObservations: [FIXTURE_IDS.observation1, FIXTURE_IDS.observation3],
  computedAt: { value: '2025-01-15T12:00:00Z', precision: 'exact' },
  computationTimeMs: 1500,
};
