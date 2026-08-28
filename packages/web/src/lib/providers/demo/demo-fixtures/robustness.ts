// ============================================================================
// Operation Financial Shadow — Robustness fixture (canonical shape)
// ============================================================================

import { RobustnessResultSchema } from "@indago/contracts";
import type { RobustnessResult } from "@indago/contracts";
import { HYP_1, OBS_1, OBS_3, OBS_6, OBS_4, OBS_2 } from "./lookup";
import { obs } from "./times";

const result: RobustnessResult = {
  hypothesisId: HYP_1,
  robustnessScore: 78,
  confidence: 0.78,
  perturbationCount: 100,
  stableIterations: 82,
  unstableIterations: 18,
  sensitiveObservations: [OBS_4, OBS_2],
  stableObservations: [OBS_1, OBS_3, OBS_6],
  computedAt: obs("2024-06-26"),
  computationTimeMs: 1420,
};

/** Canonical parsed robustness result. */
export const operationFinancialShadowRobustness: RobustnessResult =
  RobustnessResultSchema.parse(result);
