// ============================================================================
// PR-9 — Reverse Hypothesis: pure model unit tests
//
// The interpreter / classifier / assembler are rule-based and fully
// deterministic. These tests lock the behavior contracts that the view and the
// demo provider rely on:
//   - grammatical-role subject/object parsing ("X received funds from Y" ⇒ Y→X)
//   - exclusive inverse condition generation (predicate-aware)
//   - three-way classification with counts only — no scores, no confidence
//   - absence of evidence is NEVER a contradiction
//   - explicit negotiation vs. mere non-match
//   - temporal window granularity
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  assembleAssessment,
  buildEntityCatalog,
  buildInverseConditions,
  classifyReverseHypothesis,
  interpretHypothesis,
} from "@/lib/intel/reverse-hypothesis/hypothesis-model";
import type {
  HypothesisAssessment,
  ContradictionRecord,
} from "@/lib/intel/reverse-hypothesis/hypothesis-model";
import type { ObservationInput } from "@/lib/intel/reverse-hypothesis/hypothesis-model";

const IDS = {
  bank: "entity-bank-0093",
  shellOne: "entity-aldridge-holdings",
  shellTwo: "entity-northbridge",
  victor: "entity-victor",
};

const catalog = buildEntityCatalog(
  [
    { id: IDS.bank, canonicalName: "Intermediary Account 0093" },
    { id: IDS.shellOne, canonicalName: "Aldridge Holdings S.A." },
    { id: IDS.shellTwo, canonicalName: "Northbridge Capital Ltd." },
    { id: IDS.victor, canonicalName: "Victor Aldridge" },
  ],
  {
    [IDS.bank]: ["intermediary account 0093", "account 0093", "0093"],
    [IDS.shellOne]: ["aldridge holdings", "aldridge holdings s.a.", "shell one"],
    [IDS.shellTwo]: ["northbridge capital", "shell two"],
    [IDS.victor]: ["victor", "victor aldridge", "v. aldridge"],
  },
);

const observations: ObservationInput[] = [
  {
    id: "a1",
    type: "FINANCIAL",
    content:
      "Account 0092 received a cumulative 1.4M from Shell Two and disbursed recurring payments to intermediaries.",
    entityIds: [IDS.shellOne, IDS.shellTwo],
    observedAt: "2024-02-15",
  },
  {
    id: "a2",
    type: "FINANCIAL",
    content:
      "Intermediary account 0093 received funds from Shell One and passed them to Shell Two within 48 hours.",
    entityIds: [IDS.bank],
    observedAt: "2024-02-20",
  },
  {
    id: "a3",
    type: "FINANCIAL",
    content: "Wire 2045: Shell One transferred 250,000 to intermediary account 0093.",
    entityIds: [IDS.shellOne, IDS.bank],
    observedAt: "2024-02-05",
  },
  {
    id: "a4",
    type: "FINANCIAL",
    content: "Wire 2046: intermediary account 0093 transferred 245,000 to Shell Two.",
    entityIds: [IDS.bank, IDS.shellTwo],
    observedAt: "2024-02-06",
  },
  {
    id: "a5",
    type: "FINANCIAL",
    content: "Wire 2077: Shell Two disbursed 180,000 to an unvetted third-party vendor.",
    entityIds: [IDS.shellTwo],
    observedAt: "2024-03-18",
  },
  {
    id: "a6",
    type: "COMMUNICATION",
    content:
      "Correspondence authorizes routing invoices between Shell One and Shell Two, referencing account 0093.",
    entityIds: [IDS.victor, IDS.shellTwo],
    observedAt: "2023-12-20",
  },
  {
    id: "a8",
    type: "RELATIONAL",
    content:
      "Registry lists a nominee director for Shell One with residential address shared with Victor.",
    entityIds: [IDS.shellOne, IDS.victor],
    observedAt: "2023-11-05",
  },
  {
    id: "a9",
    type: "RELATIONAL",
    content:
      "Registry cross-check CC-882 lists the residential address for director V. Aldridge as 8 Rue des Capucines, Lyon — conflicting with the Shell One beneficiary filing's shared-address line (14 Rue de la Paix, Paris).",
    entityIds: [IDS.victor],
    observedAt: "2023-12-01",
  },
];

const contradiction: ContradictionRecord = {
  id: "CONTRA-1",
  leftObservationId: "a8",
  rightObservationId: "a9",
  contradictionType: "DIRECT_REFUTATION",
};

function assess(
  text: string,
  set: readonly ObservationInput[] = observations,
  contradictions: readonly ContradictionRecord[] = [contradiction],
): HypothesisAssessment {
  const interpretation = interpretHypothesis(text, catalog);
  const classified = classifyReverseHypothesis(
    set,
    interpretation,
    catalog,
    contradictions,
  );
  return assembleAssessment({
    hypothesisText: text,
    interpretation,
    supporting: classified.supporting,
    contradicting: classified.contradicting,
    unresolved: classified.unresolved,
    inverseConditions: buildInverseConditions(interpretation),
    generatedAt: "2024-05-21T00:00:00.000Z",
  });
}

describe("interpretHypothesis", () => {
  it("reads TRANSFER roles from the verb structure (received funds from ⇒ Y→X)", () => {
    const i = interpretHypothesis(
      "Intermediary account 0093 received funds from Aldridge Holdings in February 2024.",
      catalog,
    );
    expect(i.predicate).toBe("TRANSFER");
    expect(i.subject?.id).toBe(IDS.shellOne);
    expect(i.object?.id).toBe(IDS.bank);
    expect(i.temporal).toEqual({ kind: "month", month: "2024-02" });
    expect(i.resolute).toBe(true);
  });

  it("reads TRANSFER roles from a transferred-to clause (A → B)", () => {
    const i = interpretHypothesis(
      "Aldridge Holdings transferred 250,000 to intermediary account 0093.",
      catalog,
    );
    expect(i.predicate).toBe("TRANSFER");
    expect(i.subject?.id).toBe(IDS.shellOne);
    expect(i.object?.id).toBe(IDS.bank);
  });

  it("orders LOCATED_AT entities by first text appearance (grammatical subject)", () => {
    const i = interpretHypothesis(
      "Victor Aldridge shares a residential address with the nominee director of Aldridge Holdings.",
      catalog,
    );
    expect(i.predicate).toBe("LOCATED_AT");
    expect(i.subject?.id).toBe(IDS.victor);
    expect(i.object?.id).toBe(IDS.shellOne);
    expect(i.temporal).toBeUndefined();
  });

  it("reports unresolvable text as non-resolute", () => {
    const i = interpretHypothesis("unstructured insights raw", catalog);
    expect(i.resolute).toBe(false);
    expect(i.conditions).toHaveLength(0);
  });
});

describe("classifyReverseHypothesis — scenario A (TRANSFER)", () => {
  it("classifies the pool as 2 supporting / 0 contradicting / 2 unresolved", () => {
    const i = interpretHypothesis(
      "Intermediary account 0093 received funds from Aldridge Holdings in February 2024.",
      catalog,
    );
    const result = classifyReverseHypothesis(
      observations,
      i,
      catalog,
      [contradiction],
    );
    const supporting = result.supporting.map((f) => f.observationId);
    const unresolved = result.unresolved.map((f) => f.observationId);
    const contradicting = result.contradicting.map((f) => f.observationId);
    expect(new Set(supporting)).toEqual(new Set(["a2", "a3"]));
    expect(new Set(unresolved)).toEqual(new Set(["a1", "a4"]));
    expect(contradicting).toEqual([]);
    expect(supporting.length + unresolved.length + contradicting.length).toBe(4);
  });

  it("marks a different destination UNRESOLVED, not CONTRADICTING (no exclusivity)", () => {
    const i = interpretHypothesis(
      "Intermediary account 0093 received funds from Aldridge Holdings in February 2024.",
      catalog,
    );
    const result = classifyReverseHypothesis(observations, i, catalog, []);
    const a4 = result.unresolved.find((f) => f.observationId === "a4");
    expect(a4).toBeDefined();
    expect(a4!.why).toMatch(/does not assert the tested/i);
    expect(result.contradicting).toEqual([]);
  });

  it("treats an in-window matching record as SUPPORTING with a matched condition", () => {
    const i = interpretHypothesis(
      "Intermediary account 0093 received funds from Aldridge Holdings in February 2024.",
      catalog,
    );
    const result = classifyReverseHypothesis(observations, i, catalog, []);
    const a3 = result.supporting.find((f) => f.observationId === "a3");
    expect(a3).toBeDefined();
    expect(a3!.why).toMatch(/→/);
  });

  it("excludes out-of-window and non-semantic observations from the pool", () => {
    const i = interpretHypothesis(
      "Intermediary account 0093 received funds from Aldridge Holdings in February 2024.",
      catalog,
    );
    const result = classifyReverseHypothesis(observations, i, catalog, []);
    const ids = new Set(
      [...result.supporting, ...result.contradicting, ...result.unresolved].map(
        (f) => f.observationId,
      ),
    );
    expect(ids.has("a5")).toBe(false);
    expect(ids.has("a6")).toBe(false);
    expect(ids.has("a8")).toBe(false);
    expect(ids.has("a9")).toBe(false);
  });
});

describe("classifyReverseHypothesis — scenario B (LOCATED_AT)", () => {
  it("classifies the pool as 1 supporting / 1 contradicting / 0 unresolved", () => {
    const i = interpretHypothesis(
      "Victor Aldridge shares a residential address with the nominee director of Aldridge Holdings.",
      catalog,
    );
    const result = classifyReverseHypothesis(
      observations,
      i,
      catalog,
      [contradiction],
    );
    expect(result.supporting.map((f) => f.observationId)).toEqual(["a8"]);
    expect(result.contradicting.map((f) => f.observationId)).toEqual(["a9"]);
    expect(result.unresolved).toEqual([]);
    const contra = result.contradicting[0];
    expect(contra!.canonicalContradictionId).toBe("CONTRA-1");
    expect(contra!.contradictionType).toBe("DIRECT_CONFLICT");
    expect(contra!.why).toMatch(/genuine contradiction/i);
  });
});

describe("absence ≠ contradiction", () => {
  it("returns UNRESOLVED + NO_SUPPORTING_EVIDENCE when nothing reaches the hypothesis", () => {
    const a = assess(
      "Aldridge Holdings transferred funds to Northbridge Capital Ltd. in March 2024.",
      [],
    );
    expect(a.status).toBe("UNRESOLVED");
    expect(a.error).toBe("NO_SUPPORTING_EVIDENCE");
    expect(a.retrieval.pool).toBe(0);
    expect(a.notices[0]).toMatch(/absence is not evidence against it/i);
  });
});

describe("assembler safety", () => {
  it("never emits truth/confidence/score fields", () => {
    const a = assess(
      "Intermediary account 0093 received funds from Aldridge Holdings in February 2024.",
    );
    expect(a).not.toHaveProperty("confidence");
    expect(a).not.toHaveProperty("score");
    expect(a).not.toHaveProperty("probability");
    expect(a).not.toHaveProperty("truthStatus");
    for (const f of [...a.supporting, ...a.contradicting, ...a.unresolved]) {
      expect(f).not.toHaveProperty("confidence");
      expect(f).not.toHaveProperty("score");
    }
  });

  it("derives statuses from three-way counts only", () => {
    const supported = assess(
      "Intermediary account 0093 received funds from Aldridge Holdings in February 2024.",
    );
    expect(supported.status).toBe("SUPPORTED");
    expect(supported.retrieval).toEqual({
      pool: 4,
      supporting: 2,
      contradicting: 0,
      unresolved: 2,
    });

    const conflicted = assess(
      "Victor Aldridge shares a residential address with the nominee director of Aldridge Holdings.",
    );
    expect(conflicted.status).toBe("SUPPORTED_WITH_CONFLICT");
    expect(conflicted.retrieval).toEqual({
      pool: 2,
      supporting: 1,
      contradicting: 1,
      unresolved: 0,
    });
  });

  it("sets HYPOTHESIS_PARSE_ERROR for a non-resolute text", () => {
    const a = assess("unstructured insights raw", []);
    expect(a.status).toBeNull();
    expect(a.error).toBe("HYPOTHESIS_PARSE_ERROR");
    expect(a.stages).toEqual(["INTERPRETING", "ERROR"]);
  });

  it("emits the full honest run-stage trail on a real assessment", () => {
    const a = assess(
      "Intermediary account 0093 received funds from Aldridge Holdings in February 2024.",
    );
    expect(a.stages).toEqual([
      "INTERPRETING",
      "RETRIEVING_SUPPORT",
      "BUILDING_INVERSE",
      "RETRIEVING_CONTRADICTION",
      "VALIDATING",
      "READY",
    ]);
  });
});

describe("inverse conditions", () => {
  it("generates predicate-aware TRANSFER inverses (exclusivity rule)", () => {
    const i = interpretHypothesis(
      "Intermediary account 0093 received funds from Aldridge Holdings in February 2024.",
      catalog,
    );
    const inverses = buildInverseConditions(i);
    const byKind = new Map(inverses.map((iv) => [iv.kind, iv.contradicting]));
    expect(byKind.get("REVERSE_DIRECTION")).toBe(true);
    expect(byKind.get("EXPLICIT_NEGATION")).toBe(true);
    expect(byKind.get("DIFFERENT_DESTINATION")).toBe(false);
    expect(byKind.get("DIFFERENT_SENDER")).toBe(false);
    for (const iv of inverses) {
      expect(iv).toHaveProperty("reason");
    }
  });

  it("generates EXPLICIT_NEGATION-only inverses for CONTACT", () => {
    const i = interpretHypothesis(
      "Victor Aldridge corresponded with Maria Castellan.",
      catalog,
    );
    const inverses = buildInverseConditions(i);
    expect(inverses.map((iv) => iv.kind)).toEqual(["EXPLICIT_NEGATION"]);
  });
});