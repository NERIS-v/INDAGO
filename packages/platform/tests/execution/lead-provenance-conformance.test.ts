import { describe, it, expect } from "vitest";
import { ProvenanceSchema, ProvenanceChainSchema } from "@indago/contracts";
import { toConformantProvenance } from "../../src/leads/lead-runtime.js";

const SRC = "a2228c82-58a3-46ad-a98a-378b74b25c7f";
const ART = "862f2175-b8bf-4afa-8d82-600a29e7c8c7";
const OBS1 = "4b216d1f-7313-4a3f-bd87-999fd024ad2a";
const OBS2 = "eefb0295-0d2b-49ba-bfab-dd2fc0ce1465";

describe("toConformantProvenance (PR-27: leads strict-boundary conformance)", () => {
  it("strips the authority-linkage key a materialized relation provenance may carry (hypothesisId)", () => {
    const dirty = {
      sourceId: SRC,
      extractor: "indago:relation-materialization:authority",
      derivedFrom: [OBS1, OBS2],
      hypothesisId: "de38c120-6bda-4330-a4d7-28338af0e2c1",
      extractionMethod: "usr_demo_123",
    };
    const clean = toConformantProvenance(dirty);
    expect(clean).not.toHaveProperty("hypothesisId");
    expect(clean.sourceId).toBe(dirty.sourceId);
    expect(clean.extractor).toBe(dirty.extractor);
    expect(clean.derivedFrom).toEqual(dirty.derivedFrom);
    expect(clean.extractionMethod).toBe(dirty.extractionMethod);
    expect(ProvenanceSchema.parse(clean)).toEqual(clean);
  });

  it("strips arbitrary unknown / entity-authority keys and keeps conformant provenance parseable at the strict boundary", () => {
    const dirty = {
      sourceId: SRC,
      artifactId: ART,
      documentRef: "p.3",
      extractor: "indago:entity-materialization:authority",
      entityHypothesisId: "de38c120-6bda-4330-a4d7-28338af0e2c1",
      junk: { any: true },
    } as const;
    const clean = toConformantProvenance(dirty);
    expect(clean).not.toHaveProperty("entityHypothesisId");
    expect(clean).not.toHaveProperty("junk");
    expect(ProvenanceSchema.parse(clean)).toEqual(clean);
  });

  it("a chain of conformant entries parses under the strict chain schema used by the leads boundary", () => {
    const provenance = {
      entries: [
        toConformantProvenance({
          sourceId: SRC,
          extractor: "obs@1.0.0",
          derivedFrom: [OBS1],
        }),
      ],
      createdAt: { value: "2026-09-18T20:47:06.238Z", precision: "exact" },
    };
    expect(ProvenanceChainSchema.parse(provenance)).toEqual(provenance);
  });
});