// ============================================================================
// F-PR2 Demo Fixture Canonical Validation
//
// Every demo fixture MUST pass its canonical Zod schema. This module exposes a
// single `validateDemoFixtures()` that parses each collection and fails fast if
// any fixture is invalid. Used by tests and by the demo providers' constructor
// guard (so invalid fixtures are caught at bundle-build time).
// ============================================================================

import type { ZodType } from "zod";
import {
  CaseSchema,
  InvestigationSchema,
  SourceSchema,
  EvidenceSchema,
  ObservationSchema,
  EntitySchema,
  RelationHypothesisSchema,
  HypothesisSchema,
  LeadSchema,
  InvestigativeGapSchema,
  EvidenceRequestSchema,
  ReviewTaskSchema,
  GraphVersionSchema,
  GraphNodeSchema,
  GraphEdgeSchema,
  CrossCaseMatchSchema,
  RobustnessResultSchema,
  EntityMentionCandidateSchema,
  CandidatePairSchema,
  CandidateResolutionSchema,
  EntityHypothesisSchema,
} from "@indago/contracts";
import { demoFixtures } from "./index";

export interface ValidationReport {
  readonly ok: boolean;
  readonly errors: string[];
}

function parseOne(
  label: string,
  value: unknown,
  schema: ZodType,
  errors: string[],
): void {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .slice(0, 5)
      .join("; ");
    errors.push(`${label} — ${detail}`);
  }
}

/** Validate every canonical fixture; returns a report (does not throw). */
export function validateDemoFixtures(): ValidationReport {
  const errors: string[] = [];

  const singles: Array<[string, unknown, ZodType]> = [
    ["case", demoFixtures.case, CaseSchema],
    ["investigation", demoFixtures.investigation, InvestigationSchema],
    ["graphVersion", demoFixtures.graphVersion, GraphVersionSchema],
    ["robustness", demoFixtures.robustness, RobustnessResultSchema],
  ];
  for (const [label, value, schema] of singles) {
    parseOne(label, value, schema, errors);
  }

  const arrays: Array<[string, readonly unknown[], ZodType]> = [
    ["sources", demoFixtures.sources, SourceSchema],
    ["evidence", demoFixtures.evidence, EvidenceSchema],
    ["observations", demoFixtures.observations, ObservationSchema],
    ["entities", demoFixtures.entities, EntitySchema],
    ["relations", demoFixtures.relations, RelationHypothesisSchema],
    ["hypotheses", demoFixtures.hypotheses, HypothesisSchema],
    ["leads", demoFixtures.leads, LeadSchema],
    ["gaps", demoFixtures.gaps, InvestigativeGapSchema],
    ["evidenceRequests", demoFixtures.evidenceRequests, EvidenceRequestSchema],
    ["reviewTasks", demoFixtures.reviewTasks, ReviewTaskSchema],
    ["graphNodes", demoFixtures.graphNodes, GraphNodeSchema],
    ["graphEdges", demoFixtures.graphEdges, GraphEdgeSchema],
    ["graphVersions", demoFixtures.graphVersions, GraphVersionSchema],
    ["crossCase", demoFixtures.crossCase, CrossCaseMatchSchema],
    ["candidates", demoFixtures.candidates, EntityMentionCandidateSchema],
    ["candidatePairs", demoFixtures.candidatePairs, CandidatePairSchema],
    ["resolutions", demoFixtures.resolutions, CandidateResolutionSchema],
    ["entityHypotheses", demoFixtures.entityHypotheses, EntityHypothesisSchema],
  ];
  for (const [label, arr, schema] of arrays) {
    arr.forEach((item, i) => parseOne(`${label}[${i}]`, item, schema, errors));
  }

  return { ok: errors.length === 0, errors };
}

/** Throw a descriptive error if any fixture is invalid. */
export function assertDemoFixturesValid(): void {
  const report = validateDemoFixtures();
  if (!report.ok) {
    throw new Error(
      `Demo fixtures failed canonical validation:\n${report.errors.join("\n")}`,
    );
  }
}
