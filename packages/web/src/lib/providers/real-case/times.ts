// ============================================================================
// Real-Case Time Helpers (PASS 1)
//
// Re-export the deterministic demo time builders so every real-case fixture
// shares the identical ObservedTime/EventTime construction, precision rules,
// and static createdNow anchor. (INDAGO_REAL_CASE_EXTRACTION_SPEC §25)
// ============================================================================

export {
  obs,
  evt,
  createdNow,
  TIME_ANCHOR,
} from "../demo/demo-fixtures/times";