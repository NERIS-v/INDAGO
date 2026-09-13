import { describe, it, expect } from "vitest";
import {
  isLegalTransition,
  findTransition,
  isLegalResumeTarget,
  reviewResolutionTarget,
  canEnterReviewRequired,
  isTerminalState,
} from "../../src/execution/run-state-transitions.js";

describe("run-state-transitions (pure)", () => {
  describe("isLegalTransition", () => {
    it("accepts a real transition from the contract", () => {
      expect(isLegalTransition("DISCOVERING", "REVIEW_REQUIRED")).toBe(true);
      expect(isLegalTransition("CREATED", "INGESTING")).toBe(true);
    });

    it("rejects a transition not in the contract", () => {
      expect(isLegalTransition("CREATED", "COMPLETED")).toBe(false);
      expect(isLegalTransition("REVIEW_REQUIRED", "PAUSED")).toBe(false);
    });

    it("rejects a transition explicitly listed as invalid", () => {
      expect(isLegalTransition("COMPLETED", "INGESTING")).toBe(false);
      expect(isLegalTransition("WAITING_FOR_EVIDENCE", "COMPLETED")).toBe(false);
    });

    it("has no self-transitions unless explicitly defined", () => {
      expect(isLegalTransition("ANALYZING", "ANALYZING")).toBe(false);
    });
  });

  describe("findTransition", () => {
    it("returns the transition's trigger for a legal edge", () => {
      const t = findTransition("ANALYZING", "DISCOVERING");
      expect(t?.trigger).toBe("ANALYSIS_COMPLETE");
    });

    it("returns undefined for an illegal edge", () => {
      expect(findTransition("COMPLETED", "ANALYZING")).toBeUndefined();
    });
  });

  describe("isLegalResumeTarget", () => {
    it("accepts every pipeline stage the contract lists as resumable", () => {
      for (const state of ["INGESTING", "NORMALIZING", "ANALYZING", "DISCOVERING", "WAITING_FOR_EVIDENCE", "REASSESSING", "REVIEW_REQUIRED"] as const) {
        expect(isLegalResumeTarget(state)).toBe(true);
      }
    });

    it("rejects terminal states as resume targets", () => {
      expect(isLegalResumeTarget("COMPLETED")).toBe(false);
      expect(isLegalResumeTarget("FAILED")).toBe(false);
    });

    it("rejects CREATED (never paused from the very start)", () => {
      expect(isLegalResumeTarget("CREATED")).toBe(false);
    });
  });

  describe("reviewResolutionTarget", () => {
    it("maps APPROVED -> COMPLETED", () => {
      expect(reviewResolutionTarget("APPROVED")).toBe("COMPLETED");
    });

    it("maps NEEDS_EVIDENCE -> WAITING_FOR_EVIDENCE", () => {
      expect(reviewResolutionTarget("NEEDS_EVIDENCE")).toBe("WAITING_FOR_EVIDENCE");
    });
  });

  describe("canEnterReviewRequired", () => {
    it("is true from DISCOVERING and REASSESSING", () => {
      expect(canEnterReviewRequired("DISCOVERING")).toBe(true);
      expect(canEnterReviewRequired("REASSESSING")).toBe(true);
    });

    it("is false from stages with no direct REVIEW_REQUIRED edge", () => {
      expect(canEnterReviewRequired("INGESTING")).toBe(false);
      expect(canEnterReviewRequired("ANALYZING")).toBe(false);
      expect(canEnterReviewRequired("COMPLETED")).toBe(false);
    });
  });

  describe("isTerminalState", () => {
    it("is true for COMPLETED and FAILED", () => {
      expect(isTerminalState("COMPLETED")).toBe(true);
      expect(isTerminalState("FAILED")).toBe(true);
    });

    it("is false for every non-terminal pipeline stage", () => {
      for (const state of ["CREATED", "INGESTING", "NORMALIZING", "ANALYZING", "DISCOVERING", "WAITING_FOR_EVIDENCE", "REASSESSING", "REVIEW_REQUIRED", "PAUSED"] as const) {
        expect(isTerminalState(state)).toBe(false);
      }
    });
  });
});
