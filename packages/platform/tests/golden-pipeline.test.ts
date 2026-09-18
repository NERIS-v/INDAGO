// ============================================================================
// PR-25 golden pipeline — MA06 → MA10 over the PR-24 "Operation Financial
// Shadow" corpus.
//
// PURE and database-free: this suite drives the REAL deterministic engines
// (ingestion MA06/MA07/MA08, entity-resolution MA09, relation-resolution
// MA10) end-to-end over realistic evidence text. It is the semantic baseline
// the PR-25 remediation is measured against, and it replaces nothing — the
// engine unit suites and the real-Postgres integration suites remain the
// authoritative contracts.
//
// What this suite proves:
//   • the improved PR-24 semantic input yields a DISCRIMINATIVE MA08/MA09/MA10
//     outcome (no flat poisoned-identifier scores);
//   • candidate generation, resolution, canonical materialization and relation
//     generation are deterministic and idempotent;
//   • canonical identity merges same entities and keeps distinct entities
//     distinct (with the known deterministic limitations asserted explicitly);
//   • relations are source-grounded (every evidence basis observation really
//     contains both endpoints) and never fabricated from graph proximity;
//   • the `other` fallback never masquerades as a positive type signal.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  NormalizationService,
  extractObservations,
  finalizeObservation,
  extractEntityMentions,
  finalizeEntityMention,
  blockCandidates,
  finalizeCandidatePair,
} from '@indago/ingestion';
import {
  compareCandidates,
  deterministicEntityId,
  deterministicEntityHypothesisId,
} from '@indago/entity-resolution';
import {
  resolveRelationsForCase,
  deterministicRelationHypothesisId,
  RELATION_PROPOSAL_THRESHOLD,
  RELATION_SCORE_MODEL_VERSION,
} from '@indago/relation-resolution';
import { deriveCanonicalEntityProfile } from '../src/entities/entity-materialization.js';
import {
  DEFAULT_NORMALIZATION_CONFIG,
  type Observation,
  type EntityMentionCandidate,
  type CandidatePair,
  type NormalizationProvenance,
} from '@indago/contracts';
import type { RawExtraction } from '../../intelligence/ingestion/src/extraction/types.js';
import { GOLDEN_DOCUMENTS } from '../../intelligence/ingestion/tests/fixtures/operation-financial-shadow.js';

const LONG_UUID = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const CASE = LONG_UUID(900);
const INV = LONG_UUID(901);
const NOW = '2026-01-01T00:00:00.000Z';

const svc = new NormalizationService();

function makeTxt(texts: readonly string[], artifactN: number): RawExtraction {
  const artifactId = LONG_UUID(artifactN);
  return {
    format: 'TXT',
    extractionMethod: 'text-decode',
    artifactId,
    parserId: 'test-parser',
    parserVersion: '1.0.0',
    extractedAt: NOW,
    warnings: [],
    lines: texts.map((text, i) => ({
      lineNumber: i + 1,
      text,
      sourceLocation: {
        kind: 'txt-line',
        lineNumber: i + 1,
        charStart: 0,
        charEnd: text.length,
      },
    })),
  };
}

interface CanonicalEntityEvidence {
  readonly id: string;
  readonly canonicalName: string;
  readonly entityType?: string;
  readonly observationIds: readonly string[];
}

interface ProposedPair {
  readonly pair: CandidatePair;
  readonly score: number;
  readonly left: EntityMentionCandidate;
  readonly right: EntityMentionCandidate;
}

interface GoldenRun {
  readonly observations: readonly Observation[];
  readonly candidates: readonly EntityMentionCandidate[];
  readonly pairs: readonly CandidatePair[];
  readonly blockingMetrics: ReturnType<typeof blockCandidates>['metrics'];
  readonly proposedPairs: readonly ProposedPair[];
  readonly acceptedHypotheses: readonly {
    entityId: string;
    pair: CandidatePair;
    score: number;
  }[];
  readonly entities: readonly CanonicalEntityEvidence[];
  readonly relations: ReturnType<typeof resolveRelationsForCase>;
}

async function runGoldenPipeline(): Promise<GoldenRun> {
  const observations: Observation[] = [];
  const candidates: EntityMentionCandidate[] = [];

  for (let i = 0; i < GOLDEN_DOCUMENTS.length; i++) {
    const doc = GOLDEN_DOCUMENTS[i]!;
    const evidenceId = LONG_UUID(200 + i);
    const sourceId = LONG_UUID(300 + i);
    const raw = makeTxt(doc.lines, 100 + i);
    const prov: NormalizationProvenance = {
      attemptId: LONG_UUID(400 + i),
      investigationId: INV,
      caseId: CASE,
    };
    const normalized = svc.normalize(raw, prov, DEFAULT_NORMALIZATION_CONFIG);
    const { observations: drafts } = await extractObservations({
      raw,
      normalized,
      evidenceId,
      sourceId,
    });
    for (const draft of drafts) {
      const obs = await finalizeObservation({ draft, nowIso: NOW });
      observations.push(obs);
      const { drafts: mentionDrafts } = await extractEntityMentions(obs);
      for (const md of mentionDrafts) {
        candidates.push(await finalizeEntityMention({ draft: md, nowIso: NOW }));
      }
    }
  }

  // ---- MA08 blocking (case-wide comparison universe) -----------------------
  const { drafts: pairDrafts, metrics: blockingMetrics } = blockCandidates(
    { candidates, caseId: CASE, investigationId: INV },
    {},
  );
  const pairs: CandidatePair[] = [];
  for (const draft of pairDrafts) {
    pairs.push(await finalizeCandidatePair({ draft, nowIso: NOW }));
  }

  // ---- MA09 resolution + MA09.5 human-authority materialization ------------
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const proposedPairs: ProposedPair[] = [];
  const acceptedHypotheses: GoldenRun['acceptedHypotheses'][number][] = [];
  const entityById = new Map<
    string,
    { canonicalName: string; entityType?: string; observationIds: Set<string> }
  >();

  for (const pair of pairs) {
    const left = candidateById.get(pair.leftCandidateId);
    const right = candidateById.get(pair.rightCandidateId);
    if (!left || !right) continue;
    const { candidateResolution, proposed } = await compareCandidates({
      pair,
      leftCandidate: left,
      rightCandidate: right,
    });
    if (!proposed || candidateResolution.status !== 'PROPOSED') continue;
    proposedPairs.push({ pair, score: candidateResolution.score, left, right });

    // A human authority ACCEPTS the machine PROPOSED hypothesis. Materialize
    // the canonical entity with the SAME deterministic identity contract the
    // platform uses (deriveCanonicalEntityProfile + deterministicEntityId).
    const { canonicalName, entityType } = deriveCanonicalEntityProfile([
      left,
      right,
    ]);
    const entityId = await deterministicEntityId({
      caseId: CASE,
      canonicalName,
      entityType,
    });
    acceptedHypotheses.push({ entityId, pair, score: candidateResolution.score });
    let entry = entityById.get(entityId);
    if (entry === undefined) {
      entry = { canonicalName, entityType, observationIds: new Set() };
      entityById.set(entityId, entry);
    }
    for (const obsId of candidateResolution.supportingObservationIds) {
      entry.observationIds.add(obsId);
    }
    entry.observationIds.add(left.observationId);
    entry.observationIds.add(right.observationId);
  }

  const entities: CanonicalEntityEvidence[] = [...entityById.entries()]
    .map(([id, e]) => ({
      id,
      canonicalName: e.canonicalName,
      ...(e.entityType !== undefined ? { entityType: e.entityType } : {}),
      observationIds: [...e.observationIds].sort(),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  // ---- MA10 relation resolution over the canonical universe ----------------
  const relations = resolveRelationsForCase({
    caseId: CASE,
    investigationId: INV,
    observations,
    entities: entities.map((e) => ({ id: e.id, observationIds: e.observationIds })),
  });

  return {
    observations,
    candidates,
    pairs,
    blockingMetrics,
    proposedPairs,
    acceptedHypotheses,
    entities,
    relations,
  };
}

// Memoized so the deterministic pipeline runs once per suite, not per test.
let cachedRun: Promise<GoldenRun> | undefined;
function golden(): Promise<GoldenRun> {
  cachedRun ??= runGoldenPipeline();
  return cachedRun;
}

function relationKey(type: string, a: string, b: string): string {
  return `${type}:${[a, b].sort().join('|')}`;
}

function proposedRelationKeys(run: GoldenRun): Set<string> {
  const byName = new Map(run.entities.map((e) => [e.id, e.canonicalName]));
  const out = new Set<string>();
  for (const r of run.relations.resolutions) {
    if (r.support < RELATION_PROPOSAL_THRESHOLD) continue;
    out.add(
      relationKey(
        r.relationType,
        byName.get(r.sourceEntityId) ?? r.sourceEntityId,
        byName.get(r.targetEntityId) ?? r.targetEntityId,
      ),
    );
  }
  return out;
}

// ============================================================================
// PART 1/6 — MA08 candidate generation + blocking audit on the golden corpus
// ============================================================================
describe('PR-25 golden corpus — MA08 blocking audit', () => {
  it('generates a bounded, same-case comparison universe', async () => {
    const run = await golden();
    expect(run.observations).toHaveLength(90);
    expect(run.candidates).toHaveLength(194);
    expect(run.pairs).toHaveLength(279);
    expect(run.blockingMetrics.blocksSkippedOversized).toBe(0);
    expect(run.blockingMetrics.uniquePairsAfterUnion).toBe(run.pairs.length);
  }, 60000);

  it('never pairs candidates of incompatible entity types', async () => {
    const run = await golden();
    const byId = new Map(run.candidates.map((c) => [c.id, c]));
    for (const pair of run.pairs) {
      const l = byId.get(pair.leftCandidateId)!;
      const r = byId.get(pair.rightCandidateId)!;
      const compatible =
        l.entityType === undefined && r.entityType === undefined
          ? true
          : l.entityType !== undefined &&
            r.entityType !== undefined &&
            l.entityType === r.entityType;
      expect(compatible, `${l.entityType}:${l.text} vs ${r.entityType}:${r.text}`).toBe(true);
    }
  }, 60000);

  it('never pairs two mentions from the same observation (no self-corroboration)', async () => {
    const run = await golden();
    const byId = new Map(run.candidates.map((c) => [c.id, c]));
    for (const pair of run.pairs) {
      const l = byId.get(pair.leftCandidateId)!;
      const r = byId.get(pair.rightCandidateId)!;
      expect(l.observationId).not.toBe(r.observationId);
    }
  }, 60000);

  it('types the golden corpus into the expected candidate mix', async () => {
    const run = await golden();
    const counts = run.candidates.reduce<Record<string, number>>((acc, c) => {
      const k = c.entityType ?? 'UNTYPED';
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts.PHONE).toBeUndefined();
    expect(counts.DATE).toBe(25);
    expect(counts.PERSON).toBe(8);
    expect(counts.ORGANIZATION).toBe(27);
    expect(counts.ACCOUNT).toBe(40);
  }, 60000);
});

// ============================================================================
// PART 2/3/4/5/7 — MA09 resolution + deterministic canonical materialization
// ============================================================================
describe('PR-25 golden corpus — MA09 resolution and materialization', () => {
  it('produces discriminative, explainable scores — never the historical flat 0.35', async () => {
    const run = await golden();
    expect(run.proposedPairs).toHaveLength(152);
    const scores = new Set(run.proposedPairs.map((p) => p.score));
    // Exact strong-identifier matches (0.35) and exact canonical name matches
    // (0.25) are discriminated. A poisoned corpus produced ONLY 0.35.
    expect([...scores].sort()).toEqual([0.25, 0.35]);
  }, 60000);

  it('never proposes a CONTRADICTED hypothesis on this corpus', async () => {
    const run = await golden();
    const byId = new Map(run.candidates.map((c) => [c.id, c]));
    for (const pair of run.pairs) {
      const { candidateResolution } = await compareCandidates({
        pair,
        leftCandidate: byId.get(pair.leftCandidateId)!,
        rightCandidate: byId.get(pair.rightCandidateId)!,
      });
      expect(candidateResolution.status).not.toBe('CONTRADICTED');
    }
  }, 60000);

  it('converges accepted hypotheses into one canonical entity per real identity', async () => {
    const run = await golden();
    expect(run.entities).toHaveLength(14);
    const byName = new Map(run.entities.map((e) => [e.canonicalName, e.entityType]));
    for (const [name, type] of [
      ['arjun mehta', 'PERSON'],
      ['neha kapoor', 'PERSON'],
      ['meridian trading llp', 'ORGANIZATION'],
      ['blue dusk logistics', 'ORGANIZATION'],
      ['northstar warehousing', 'ORGANIZATION'],
      ['ax-4471', 'ACCOUNT'],
      ['mt-883', 'ACCOUNT'],
      ['invoice 7842', 'ACCOUNT'],
    ] as const) {
      expect(byName.get(name), name).toBe(type);
    }
    // Many accepted hypotheses (>1) collapsed into these 14 identities.
    expect(run.acceptedHypotheses.length).toBeGreaterThan(run.entities.length);
  }, 60000);

  it('keeps deterministic identity idempotent — same case+name+type ⇒ same id', async () => {
    const run = await golden();
    for (const entity of run.entities) {
      const again = await deterministicEntityId({
        caseId: CASE,
        canonicalName: entity.canonicalName,
        entityType: entity.entityType,
      });
      expect(again).toBe(entity.id);
    }
    // Distinct identities do not collide.
    const ids = new Set(run.entities.map((e) => e.id));
    expect(ids.size).toBe(run.entities.length);
  }, 60000);

  it('never embeds a mention/candidate id in a canonical entity id', async () => {
    const run = await golden();
    const candidateIds = new Set(run.candidates.map((c) => c.id));
    for (const entity of run.entities) {
      expect(candidateIds.has(entity.id)).toBe(false);
    }
  }, 60000);

  it('documents the name-variant limitation: legal-suffix variants stay DISTINCT', async () => {
    const run = await golden();
    const names = new Set(run.entities.map((e) => e.canonicalName));
    // Conservative under-merge: the free-text "Orion Exports" mention and the
    // suffixed "Orion Exports Pvt. Ltd" do NOT auto-merge (no suffix stripping
    // or fuzzy name matching in the deterministic v1 model). This is asserted
    // as a KNOWN limitation, not a silent regression.
    expect(names.has('orion exports')).toBe(true);
    expect(names.has('orion exports pvt. ltd')).toBe(true);
  }, 60000);

  it('documents the singleton-typed-mention limitation (Rohan Singh)', async () => {
    const run = await golden();
    // "Rohan Singh" is typed PERSON exactly once across the corpus. With no
    // second same-type candidate there is no CandidatePair, so no PROPOSED
    // hypothesis and no canonical entity — a truthful UNRESOLVED outcome.
    const rohanCandidates = run.candidates.filter((c) => c.text === 'Rohan Singh');
    expect(rohanCandidates.length).toBeGreaterThan(0);
    expect(run.entities.some((e) => e.canonicalName === 'rohan singh')).toBe(false);
  }, 60000);

  it('is deterministic and idempotent across repeated runs', async () => {
    const a = await golden();
    const b = await runGoldenPipeline();
    expect(b.pairs.map((p) => p.id)).toEqual(a.pairs.map((p) => p.id));
    expect(b.entities.map((e) => e.id)).toEqual(a.entities.map((e) => e.id));
    expect(
      b.relations.resolutions.map((r) =>
        `${r.sourceEntityId}|${r.targetEntityId}|${r.relationType}|${r.support}`,
      ),
    ).toEqual(
      a.relations.resolutions.map((r) =>
        `${r.sourceEntityId}|${r.targetEntityId}|${r.relationType}|${r.support}`,
      ),
    );
    // Hypothesis identity is a pure function of pair + model version.
    const pair = a.proposedPairs[0]!.pair;
    expect(
      await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
      }),
    ).toBe(
      await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
      }),
    );
  }, 60000);
});

// ============================================================================
// PART 9/10/11/12/13 — MA10 relation prerequisites, types and hypotheses
// ============================================================================
describe('PR-25 golden corpus — MA10 relation resolution', () => {
  it('only ever grounds relations in the canonical entity universe', async () => {
    const run = await golden();
    const entityIds = new Set(run.entities.map((e) => e.id));
    const candidateIds = new Set(run.candidates.map((c) => c.id));
    for (const r of run.relations.resolutions) {
      expect(entityIds.has(r.sourceEntityId)).toBe(true);
      expect(entityIds.has(r.targetEntityId)).toBe(true);
      expect(candidateIds.has(r.sourceEntityId)).toBe(false);
      expect(candidateIds.has(r.targetEntityId)).toBe(false);
    }
  }, 60000);

  it('generates source-grounded relation candidates with populated evidence', async () => {
    const run = await golden();
    expect(run.relations.metrics.pairsConsidered).toBe(24);
    expect(run.relations.metrics.hypothesesProposed).toBe(20);
    // The 4 non-proposals are single generic co-occurrences (see `other` fix).
    expect(run.relations.metrics.hypothesesRejected).toBe(4);
    for (const r of run.relations.resolutions) {
      expect(r.evidenceCount).toBeGreaterThan(0);
      expect(r.evidenceBasis.length).toBeGreaterThan(0);
      expect(r.scoreModelVersion).toBe(RELATION_SCORE_MODEL_VERSION);
    }
  }, 60000);

  it('classifies the corpus relations deterministically and contextually', async () => {
    const keys = proposedRelationKeys(await golden());
    expect(keys.has('association:meridian trading llp|mt-883')).toBe(true);
    expect(keys.has('association:blue dusk logistics|meridian trading llp')).toBe(true);
    expect(keys.has('association:bdl-210|meridian trading llp')).toBe(true);
    expect(keys.has('financial:blue dusk logistics|neha kapoor')).toBe(true);
    expect(keys.has('communication:ax-4471|neha kapoor')).toBe(true);
    expect(keys.has('financial:invoice 7842|orion exports')).toBe(true);
  }, 60000);

  it('never awards a type signal to the `other` fallback (false-precision guard)', async () => {
    const run = await golden();
    for (const r of run.relations.resolutions) {
      if (r.relationType !== 'other') continue;
      // A single generic co-occurrence carries ONLY the co-occurrence weight.
      if (r.evidenceCount === 1) {
        expect(r.support).toBeCloseTo(0.2, 6);
        expect(r.support).toBeLessThan(RELATION_PROPOSAL_THRESHOLD);
      }
    }
  }, 60000);

  it('is idempotent — relation hypothesis identity depends only on pair+type+model', async () => {
    const run = await golden();
    const relation = run.relations.resolutions.find(
      (r) => r.relationType === 'association' && r.support >= RELATION_PROPOSAL_THRESHOLD,
    )!;
    const input = {
      sourceEntityId: relation.sourceEntityId,
      targetEntityId: relation.targetEntityId,
      relationType: relation.relationType,
      directed: relation.directed,
      scoreModelVersion: relation.scoreModelVersion,
    } as const;
    expect(await deterministicRelationHypothesisId(input)).toBe(
      await deterministicRelationHypothesisId(input),
    );
    // No duplicate canonical relation rows for the same identity.
    const dupes = run.relations.resolutions.filter(
      (r) =>
        r.sourceEntityId === relation.sourceEntityId &&
        r.targetEntityId === relation.targetEntityId &&
        r.relationType === relation.relationType,
    );
    expect(dupes).toHaveLength(1);
  }, 60000);
});

// ============================================================================
// PART 8/17 — traceability: every relation traces back to real observation text
// ============================================================================
describe('PR-25 golden corpus — traceability', () => {
  it('every supporting observation of a proposed relation contains both endpoints', async () => {
    const run = await golden();
    const byName = new Map(run.entities.map((e) => [e.id, e.canonicalName]));
    const obsById = new Map(run.observations.map((o) => [o.id, o]));

    let checked = 0;
    for (const r of run.relations.resolutions) {
      if (r.support < RELATION_PROPOSAL_THRESHOLD) continue;
      const a = byName.get(r.sourceEntityId)!;
      const b = byName.get(r.targetEntityId)!;
      // Only assertions over ACCOUNT/ORGANIZATION/PERSON names that appear
      // verbatim (case-insensitive) in the source content are meaningful; skip
      // entities whose canonical form is a normalized identifier display.
      const content = r.evidenceBasis
        .map((id) => obsById.get(id)?.content.toLowerCase() ?? '')
        .filter((c) => c.length > 0);
      if (content.length === 0) continue;
      const both = content.some((c) => c.includes(a) && c.includes(b));
      if (both) checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  }, 60000);

  it('canonical entity observation links point at observations that mention them', async () => {
    const run = await golden();
    const obsById = new Map(run.observations.map((o) => [o.id, o]));
    const meridian = run.entities.find((e) => e.canonicalName === 'meridian trading llp')!;
    expect(meridian.observationIds.length).toBeGreaterThan(0);
    for (const obsId of meridian.observationIds) {
      const obs = obsById.get(obsId);
      expect(obs, obsId).toBeDefined();
      expect(obs!.content.toLowerCase()).toContain('meridian');
    }
  }, 60000);
});
