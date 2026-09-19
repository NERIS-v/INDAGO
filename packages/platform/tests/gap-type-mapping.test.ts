import { describe, expect, it } from "vitest";

import {
  mapGapClassificationToGapType,
} from "../src/gaps/gap-type-mapping.js";

describe("Phase 5B-PR1 GapType mapping", () => {
  describe("PR14 classification mapping", () => {
    it("maps MISSING_DATA to MISSING_EVIDENCE", () => {
      expect(
        mapGapClassificationToGapType(
          "MISSING_DATA",
          "MISSING_EDGE",
        ),
      ).toBe("MISSING_EVIDENCE");
    });

    it("maps MISSING_INVESTIGATION to KNOWLEDGE_GAP", () => {
      expect(
        mapGapClassificationToGapType(
          "MISSING_INVESTIGATION",
          "MISSING_EDGE",
        ),
      ).toBe("KNOWLEDGE_GAP");
    });

    it("maps MISSING_COMPARISON to KNOWLEDGE_GAP", () => {
      expect(
        mapGapClassificationToGapType(
          "MISSING_COMPARISON",
          "MISSING_EDGE",
        ),
      ).toBe("KNOWLEDGE_GAP");
    });

    it("maps INFRASTRUCTURE_GAP to OTHER", () => {
      expect(
        mapGapClassificationToGapType(
          "INFRASTRUCTURE_GAP",
          "MISSING_EDGE",
        ),
      ).toBe("OTHER");
    });

    it("maps CONCEALMENT_CONSISTENT_PATTERN to OTHER", () => {
      expect(
        mapGapClassificationToGapType(
          "CONCEALMENT_CONSISTENT_PATTERN",
          "MISSING_EDGE",
        ),
      ).toBe("OTHER");
    });
  });

  describe("V1 fallback mapping", () => {
    it("falls back to KNOWLEDGE_GAP for MISSING_EDGE", () => {
      expect(
        mapGapClassificationToGapType(
          null,
          "MISSING_EDGE",
        ),
      ).toBe("KNOWLEDGE_GAP");
    });

    it("falls back to KNOWLEDGE_GAP for TEMPORAL_GAP", () => {
      expect(
        mapGapClassificationToGapType(
          undefined,
          "TEMPORAL_GAP",
        ),
      ).toBe("KNOWLEDGE_GAP");
    });

    it("falls back to KNOWLEDGE_GAP for BROKEN_CHAIN", () => {
      expect(
        mapGapClassificationToGapType(
          null,
          "BROKEN_CHAIN",
        ),
      ).toBe("KNOWLEDGE_GAP");
    });

    it("falls back to KNOWLEDGE_GAP for MISSING_PATH", () => {
      expect(
        mapGapClassificationToGapType(
          null,
          "MISSING_PATH",
        ),
      ).toBe("KNOWLEDGE_GAP");
    });

    it("falls back to MISSING_EVIDENCE for ISOLATED_NODE", () => {
      expect(
        mapGapClassificationToGapType(
          null,
          "ISOLATED_NODE",
        ),
      ).toBe("MISSING_EVIDENCE");
    });

    it("falls back to KNOWLEDGE_GAP for COMMUNITY_BOUNDARY", () => {
      expect(
        mapGapClassificationToGapType(
          null,
          "COMMUNITY_BOUNDARY",
        ),
      ).toBe("KNOWLEDGE_GAP");
    });

    it("falls back to OTHER for an unknown hole type", () => {
      expect(
        mapGapClassificationToGapType(
          null,
          "FUTURE_UNKNOWN_HOLE",
        ),
      ).toBe("OTHER");
    });

    it("uses the classification mapping before the fallback", () => {
      expect(
        mapGapClassificationToGapType(
          "MISSING_DATA",
          "ISOLATED_NODE",
        ),
      ).toBe("MISSING_EVIDENCE");
    });
  });
});