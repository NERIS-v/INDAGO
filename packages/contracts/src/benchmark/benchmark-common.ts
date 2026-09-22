import { z } from "zod";

/**
 * Benchmark condition labels observed in the generated corpus.
 * Historical artifacts use both `NOISY_MISSING` and `NOISY_MISSING` labels;
 * `display` field normalizes to a single editorial label without rewriting
 * the stored condition string.
 */
export const BenchmarkConditionLabelSchema = z
  .enum(["CLEAN", "NOISY_MISSING", "ADVERSARIAL"])
  .describe("Canonical benchmark condition family");

export type BenchmarkConditionLabel = z.infer<typeof BenchmarkConditionLabelSchema>;

export const BenchmarkRunStateSchema = z
  .enum(["PRE_ANALYSIS", "CORRECTED_OBSERVATION_ONLY", "COUNTERFACTUAL"])
  .default("CORRECTED_OBSERVATION_ONLY")
  .describe(
    "Integrity category of a benchmark run. PRE_ANALYSIS marks artifacts generated " +
      "before the ground-truth-leak audit. CORRECTED_OBSERVATION_ONLY marks runs " +
      "validated after the audit with groundTruthAccessed=false. COUNTERFACTUAL marks " +
      "a hypothetical run that must never be presented as an observed result.",
  );

export type BenchmarkRunState = z.infer<typeof BenchmarkRunStateSchema>;

export const BenchmarkCapabilityStatusSchema = z.enum([
  "IMPLEMENTED",
  "PRODUCTION_WIRED",
  "BENCHMARK_EXECUTED",
]);

export type BenchmarkCapabilityStatus = z.infer<typeof BenchmarkCapabilityStatusSchema>;

export const BenchmarkRunMetaSchema = z.object({
  runId: z.string().default(""),
  generatedAt: z.string().default(""),
  benchmarkVersion: z.string().default("prototype-pilot"),
  gitSha: z.string().nullable().default(null),
  seed: z.number().nullable().default(null),
  corpus: z.string().default("SYNTHETIC / DE-IDENTIFIED"),
  conditions: z.array(BenchmarkConditionLabelSchema).default(["CLEAN", "NOISY_MISSING", "ADVERSARIAL"]),
  provider: z.string().default("NON_PROD"),
  model: z.string().nullable().default(null),
  durationMs: z.number().nullable().default(null),
  groundTruthAccessed: z.boolean().default(false),
  state: BenchmarkRunStateSchema,
  runPath: z.string().optional(),
});

export type BenchmarkRunMeta = z.infer<typeof BenchmarkRunMetaSchema>;
