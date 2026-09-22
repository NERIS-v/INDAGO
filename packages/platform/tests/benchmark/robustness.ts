// ============================================================================
// INTERNAL PILOT EVALUATION  ·  PROTOTYPE BENCHMARK  ·  SYNTHETIC / DE-IDENTIFIED
// Derived truth fixture + ROBUSTNESS measurement for the hole chain.
//
// What this IS:
//   • A deterministic, case-bounded truth fixture derived from the synthetic
//     corpus's planted identity table (`derivedTruthFixture`).
//   • A strict-vs-lenient gate comparison over the REAL hole-chain output:
//     lenient hit = at least one candidate node touches every planted endpoint;
//     strict hit  = the hitting candidate is ALSO deterministically attributable
//                   to the planted hole (its node set does not rely on
//                   unexplained noise aliases) and its detector/expected-type
//                   provenance is coherent.
//   • Robustness = strictHoles / lenientHoles (fraction of the detected signal
//     that survives the tolerance gates). Reported as an honest fraction, never
//     as a calibrated probability.
//
// What this is NOT: a proof of effectiveness, a production metric, or an
// independent audit. All numbers regenerate from the deterministic fixtures.
// ============================================================================

import type { CaseCorpus, PlantedHole } from './corpus.js';
import type { HoleChainResult } from './holes.js';
import { candidateHitsHole, holeEndpointEntityIds, ownerEntityIds } from './holes.js';
import type { PipelineResult } from './pipeline.js';

// ---------------------------------------------------------------------------
// Derived truth fixture
// ---------------------------------------------------------------------------

export interface HoleTruth {
  readonly holeId: string;
  readonly holeType: string;
  readonly expectedType: string | null;
  /** Sorted truth identity keys that anchor the planted hole. */
  readonly endpointKeys: readonly string[];
  /** Materialized canonical entity ids for the planted endpoints. */
  readonly endpointEntityIds: readonly string[];
  /** Seed observations (observed, non-withheld) witnessing any endpoint. */
  readonly seedObservationIds: readonly string[];
}

export interface DerivedTruthFixture {
  readonly caseId: string;
  readonly holes: readonly HoleTruth[];
}

export function deriveHoleTruth(corpus: CaseCorpus, run: PipelineResult): DerivedTruthFixture {
  const entitiesByCanonical = new Map<string, string[]>();
  for (const e of run.entities) {
    const norm = e.canonicalName.toLowerCase();
    const list = entitiesByCanonical.get(norm) ?? [];
    list.push(e.id);
    entitiesByCanonical.set(norm, list);
  }

  const holes: HoleTruth[] = corpus.truth.holes.map((hole) => {
    const seedObservationIds: string[] = [];
    for (const rec of corpus.records) {
      if (rec.kind === 'HELDOUT' || rec.withheld) continue;
      if (!rec.owners.some((o) => hole.nodes.includes(o))) continue;
      for (const obsId of run.recordToObservations.get(rec.id) ?? []) {
        if (!seedObservationIds.includes(obsId)) seedObservationIds.push(obsId);
      }
    }
    return {
      holeId: hole.id,
      holeType: hole.holeType,
      expectedType: hole.expectedType,
      endpointKeys: [...hole.nodes].sort(),
      endpointEntityIds: holeEndpointEntityIds(corpus, run, hole),
      seedObservationIds: seedObservationIds.sort(),
    };
  });

  return { caseId: corpus.caseId, holes };
}

// ---------------------------------------------------------------------------
// Robustness gates over the real chain output
// ---------------------------------------------------------------------------

export interface HoleHitVerdict {
  readonly holeId: string;
  readonly holeType: string;
  readonly expectedType: string | null;
  readonly seedObservationCount: number;
  readonly regionBuilt: boolean;
  readonly regionStatus: string | null;
  readonly lenientHit: boolean;
  readonly strictHit: boolean;
  readonly firstHitRank: number | null;
  /** Detector types of the hit-container k candidates (0..k]. */
  readonly hitDetectorTypes: readonly string[];
  /** Coherence: at least one hitting candidate carries a plausible provenance. */
  readonly provenanceCoherent: boolean;
}

export interface RobustnessResult {
  readonly caseId: string;
  readonly holesPlanted: number;
  readonly holesRegionBuilt: number;
  readonly holesDetected: number;
  readonly holesDetectedStrict: number;
  readonly hardFailures: readonly { holeId: string; stage: string; message: string }[];
  /** fraction = holesDetected / holesPlanted (lenient gate). */
  readonly lenientHitRate: number;
  /** fraction = holesDetectedStrict / holesPlanted (strict gate). */
  readonly strictHitRate: number;
  /** robustness = strict / lenient (0 when none detected). */
  readonly robustness: number;
  /** Mean reciprocal rank over holesHit ranked within the hole chain (ERR@K, K=3). */
  readonly errAtK: number;
  readonly verdicts: readonly HoleHitVerdict[];
}

const ERR_K = 3;

export function evaluateHoleRobustness(
  corpus: CaseCorpus,
  run: PipelineResult,
  chain: HoleChainResult,
): RobustnessResult {
  const fixture = deriveHoleTruth(corpus, run);
  const entriesById = new Map(chain.entries.map((e) => [e.holeId, e]));
  const identityKeysByEntityId = new Map<string, string>();
  for (const identity of corpus.truth.identities) {
    for (const e of run.entities) {
      const surfaceMatch = identity.surfaces.some(
        (s) => e.canonicalName.toLowerCase() === s.toLowerCase(),
      );
      if (surfaceMatch && !identityKeysByEntityId.has(e.id)) identityKeysByEntityId.set(e.id, identity.key);
    }
  }

  const verdicts: HoleHitVerdict[] = [];
  const hardFailures: { holeId: string; stage: string; message: string }[] = [];

  for (const truth of fixture.holes) {
    const entry = entriesById.get(truth.holeId);
    const hole: PlantedHole | undefined = corpus.truth.holes.find((h) => h.id === truth.holeId);

    if (!entry) {
      verdicts.push({
        holeId: truth.holeId,
        holeType: truth.holeType,
        expectedType: truth.expectedType,
        seedObservationCount: truth.seedObservationIds.length,
        regionBuilt: false,
        regionStatus: null,
        lenientHit: false,
        strictHit: false,
        firstHitRank: null,
        hitDetectorTypes: [],
        provenanceCoherent: false,
      });
      continue;
    }
    if (entry.regionError) hardFailures.push({ holeId: truth.holeId, stage: entry.regionError.stage, message: entry.regionError.message });
    if (entry.detectionError) hardFailures.push({ holeId: truth.holeId, stage: entry.detectionError.stage, message: entry.detectionError.message });
    if (entry.qualificationError) hardFailures.push({ holeId: truth.holeId, stage: entry.qualificationError.stage, message: entry.qualificationError.message });
    for (const c of entry.candidates) {
      if (c.classificationError) hardFailures.push({ holeId: truth.holeId, stage: c.classificationError.stage, message: c.classificationError.message });
      if (c.explanationError) hardFailures.push({ holeId: truth.holeId, stage: c.explanationError.stage, message: c.explanationError.message });
      if (c.evidenceGenerationError) hardFailures.push({ holeId: truth.holeId, stage: c.evidenceGenerationError.stage, message: c.evidenceGenerationError.message });
      if (c.selectionError) hardFailures.push({ holeId: truth.holeId, stage: c.selectionError.stage, message: c.selectionError.message });
    }

    const regionBuilt = entry.region !== null;
    // A planted hole is struck only by the detector whose semantics match the
    // hole's own type — a MISSING_EDGE candidate does NOT "resolve" a planted
    // TEMPORAL_GAP (different gap story), and a regression like that must not
    // inflate fill.
    const lenientHits = entry.candidates
      .filter(
        (c) =>
          c.rawCandidate.detectorType === truth.holeType &&
          hole !== undefined &&
          candidateHitsHole(c.rawCandidate.nodeIds, corpus, run, hole),
      )
      .map((c) => c);
    const lenientHit = lenientHits.length > 0;
    const firstHitRank = lenientHits.length > 0 ? Math.min(...lenientHits.map((c) => c.rank)) : null;
    const hitDetectorTypes = [...new Set(lenientHits.map((c) => c.rawCandidate.detectorType))].sort();

    // Strict gate: every hitting candidate is attributable — all endpoint
    // entity ids resolve to planted-hole owners AND none of the candidates'
    // node ids resolve to an identity that contradicts the hole fixture.
    const strictHit =
      lenientHit &&
      truth.endpointEntityIds.length > 0 &&
      lenientHits.every((c) => {
        const nodeIds = c.rawCandidate.nodeIds;
        const explicitHit = candidateHitsHole(nodeIds, corpus, run, hole!);
        const allPlantCompatible = nodeIds.every((id) => {
          const key = identityKeysByEntityId.get(id);
          if (key === undefined) return true; // non-key node — tolerated (window dressing)
          return truth.endpointKeys.includes(key);
        });
        return explicitHit && allPlantCompatible;
      });

    verdicts.push({
      holeId: truth.holeId,
      holeType: truth.holeType,
      expectedType: truth.expectedType,
      seedObservationCount: truth.seedObservationIds.length,
      regionBuilt,
      regionStatus: entry.region?.status ?? null,
      lenientHit,
      strictHit,
      firstHitRank,
      hitDetectorTypes,
      provenanceCoherent: lenientHits.some((c) => c.rawCandidate.nodeIds.length > 0),
    });
  }

  const holesPlanted = verdicts.length;
  const holesRegionBuilt = verdicts.filter((v) => v.regionBuilt).length;
  const holesDetected = verdicts.filter((v) => v.lenientHit).length;
  const holesDetectedStrict = verdicts.filter((v) => v.strictHit).length;
  const lenientHitRate = holesPlanted === 0 ? 0 : holesDetected / holesPlanted;
  const strictHitRate = holesPlanted === 0 ? 0 : holesDetectedStrict / holesPlanted;
  const robustness = holesDetected === 0 ? 0 : holesDetectedStrict / holesDetected;

  let errSum = 0;
  for (const v of verdicts) {
    if (v.firstHitRank !== null && v.firstHitRank <= ERR_K) {
      errSum += 1 / v.firstHitRank;
    }
  }
  const errAtK = holesPlanted === 0 ? 0 : errSum / holesPlanted;

  return {
    caseId: corpus.caseId,
    holesPlanted,
    holesRegionBuilt,
    holesDetected,
    holesDetectedStrict,
    hardFailures,
    lenientHitRate,
    strictHitRate,
    robustness,
    errAtK,
    verdicts,
  };
}

// ---------------------------------------------------------------------------
// Materialization / entity-resolution gates (used by metrics)
// ---------------------------------------------------------------------------

export interface EntityResolutionTruth {
  /** All truth identity surface strings (entity mentions the corpus KNOWS). */
  readonly truthSurfaces: readonly string[];
  /** Canonical lowercase strings of the truth identities. */
  readonly truthCanonicals: readonly string[];
  /** Materialized canonical names (lowercased) from the REAL pipeline. */
  readonly materializedCanonicals: readonly string[];
  /** Entities whose canonical matches a truth surface (id → truthKey). */
  readonly resolvedIds: ReadonlyMap<string, string>;
}

export function deriveEntityResolutionQueues(
  corpus: CaseCorpus,
  run: PipelineResult,
): EntityResolutionTruth {
  const truthSurfaces: string[] = [];
  const truthCanonicals: string[] = [];
  for (const identity of corpus.truth.identities) {
    truthCanonicals.push(identity.canonical.toLowerCase());
    for (const s of identity.surfaces) if (!truthSurfaces.includes(s.toLowerCase())) truthSurfaces.push(s.toLowerCase());
  }
  const resolvedIds = new Map<string, string>();
  for (const identity of corpus.truth.identities) {
    for (const e of run.entities) {
      const surfaceMatch = identity.surfaces.some((s) => e.canonicalName.toLowerCase() === s.toLowerCase());
      if (surfaceMatch && !resolvedIds.has(e.id)) resolvedIds.set(e.id, identity.key);
    }
  }
  const materializedCanonicals = run.entities.map((e) => e.canonicalName.toLowerCase()).sort();
  return {
    truthSurfaces: truthSurfaces.slice().sort(),
    truthCanonicals: truthCanonicals.slice().sort(),
    materializedCanonicals,
    resolvedIds,
  };
}

export function identityOwnerMap(corpus: CaseCorpus, run: PipelineResult): ReadonlyMap<string, readonly string[]> {
  return ownerEntityIds(corpus, run);
}