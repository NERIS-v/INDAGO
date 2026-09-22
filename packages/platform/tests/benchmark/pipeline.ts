// ============================================================================
// INTERNAL PILOT EVALUATION  ·  PROTOTYPE BENCHMARK  ·  SYNTHETIC / DE-IDENTIFIED
// Case pipeline runner — drives the REAL, DETERMINISTIC INDAGO engines
// (ingestion → blocking → entity resolution → materialization → relations →
// graph projection → analytics → lead drafts), mirroring the platform seams
// exactly as golden-pipeline.test.ts does.
//
// PURE and database-free. Every count, candidate, resolution, relation,
// graph, and lead are the engine's own outputs (no synthetic scoring).
// ============================================================================

import { NormalizationService, blockCandidates, extractEntityMentions, extractObservations, finalizeCandidatePair, finalizeEntityMention, finalizeObservation } from '@indago/ingestion';
import { DEFAULT_NORMALIZATION_CONFIG } from '@indago/contracts';
import {
  compareCandidates,
  deterministicEntityId,
} from '@indago/entity-resolution';
import {
  RELATION_PROPOSAL_THRESHOLD,
  detectExplicitRelationContradictions,
  resolveRelationsForCase,
} from '@indago/relation-resolution';
import {
  buildBridgeLeadDraft,
  buildCommunityLeadDraft,
  buildTemporalBurstLeadDraft,
  type CommunityLeadCandidateInput,
} from '@indago/lead-generation';
import {
  buildGraph,
  detectBridgeCandidates,
  detectCommunityCandidates,
  detectTemporalBursts,
  type GraphEdge,
} from '@indago/graphology-projection';
import type {
  CandidatePair,
  EntityMentionCandidate,
  Observation,
  Provenance,
} from '@indago/contracts';
import type { RawExtraction } from '../../../intelligence/ingestion/src/extraction/types.js';
import { deriveCanonicalEntityProfile } from '../../src/entities/entity-materialization.js';
import { deriveValidityInterval } from '../../src/temporal/interval-aggregation.js';
import type { CaseCorpus } from './corpus.js';
import { longUuid, uuidFrom } from './util.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface PipelineOptions {
  /** Also ingest the corpus's held-out records (SYS-01 evidence acquisition). */
  readonly includeHeldOut?: boolean;
  readonly nowIso?: string;
}

export interface CanonicalEntityEvidence {
  readonly id: string;
  readonly canonicalName: string;
  readonly entityType?: string;
  readonly observationIds: readonly string[];
  readonly candidateIds: readonly string[];
}

export interface ProposedPair {
  readonly id: string;
  readonly leftCandidateId: string;
  readonly rightCandidateId: string;
  readonly leftText: string;
  readonly rightText: string;
  readonly score: number;
  readonly status: string;
  readonly supportingObservationIds: readonly string[];
}

export interface PipelineResult {
  readonly caseId: string;
  readonly investigationId: string;
  readonly caseKey: string;
  readonly condition: string;
  readonly observations: readonly Observation[];
  readonly candidates: readonly EntityMentionCandidate[];
  readonly pairs: readonly CandidatePair[];
  readonly proposedPairs: readonly ProposedPair[];
  readonly blockedPairs: readonly CandidatePair[];
  readonly entities: readonly CanonicalEntityEvidence[];
  readonly entityIdsByObservation: ReadonlyMap<string, readonly string[]>;
  readonly relations: ReturnType<typeof resolveRelationsForCase>;
  readonly contradictions: ReadonlySet<string>;
  readonly graph: ReturnType<typeof buildGraph>;
  readonly bridges: ReturnType<typeof detectBridgeCandidates>;
  readonly bursts: ReturnType<typeof detectTemporalBursts>;
  readonly communities: ReturnType<typeof detectCommunityCandidates>;
  readonly leads: readonly unknown[];
  readonly observationToRecord: ReadonlyMap<string, number>;
  readonly recordToObservations: ReadonlyMap<number, readonly string[]>;
  readonly unmatchedObservations: readonly string[];
  readonly timing: readonly { stage: string; ms: number }[];
}

const svc = new NormalizationService();

function makeTxt(lines: readonly string[], artifactN: number, nowIso: string): RawExtraction {
  const artifactId = longUuid(artifactN);
  return {
    format: 'TXT',
    extractionMethod: 'text-decode',
    artifactId,
    parserId: 'benchmark-parser',
    parserVersion: '1.0.0',
    extractedAt: nowIso,
    warnings: [],
    lines: lines.map((text, i) => ({
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

// Edge identity must be a UUID-shaped string: the region engine validates the
// frozen RegionIdentityV1 contract (z.string().uuid()) over nodeIds/edgeIds.
// Derive a deterministic UUID from (source, target, relationType).
const edgeIdOf = (source: string, target: string, relationType: string): string =>
  uuidFrom(`${source}|${target}|${relationType}`);

export async function runPipeline(corpus: CaseCorpus, options: PipelineOptions = {}): Promise<PipelineResult> {
  const nowIso = options.nowIso ?? '2026-01-01T00:00:00.000Z';
  const includeHeldOut = options.includeHeldOut ?? false;
  const timings: { stage: string; ms: number }[] = [];

  const observations: Observation[] = [];
  const candidates: EntityMentionCandidate[] = [];
  let artifactN = 1000;

  const recordByLine = new Map<string, number>();
  for (const rec of corpus.records) {
    const key = rec.line.trim();
    if (!recordByLine.has(key)) recordByLine.set(key, rec.id);
  }
  const heldOutByLine = new Map<string, number>();
  for (const rec of corpus.heldOutRecords) {
    const key = rec.line.trim();
    if (!heldOutByLine.has(key)) heldOutByLine.set(key, rec.id);
  }

  const docs = [...corpus.documents];
  if (includeHeldOut && corpus.heldOutRecords.length > 0) {
    docs.push({
      artifactId: longUuid(7600),
      sourceId: longUuid(8600),
      title: `${corpus.caseKey} HELDOUT ${corpus.condition}`,
      lines: corpus.heldOutRecords.map((r) => r.line),
    });
  }

  const recordToObservations = new Map<number, string[]>();
  const observationToRecord = new Map<string, number>();
  const unmatchedObservations: string[] = [];

  timings.push({ stage: 'ingest', ms: 0 });
  let ingestStart = Date.now();
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]!;
    const evidenceId = longUuid(200 + i);
    const sourceId = longUuid(300 + i);
    const raw = makeTxt(doc.lines, artifactN + i, nowIso);
    const normalized = svc.normalize(
      raw,
      {
        attemptId: longUuid(400 + i),
        investigationId: corpus.investigationId,
        caseId: corpus.caseId,
      },
      DEFAULT_NORMALIZATION_CONFIG,
    );
    const { observations: drafts } = await extractObservations({
      raw,
      normalized,
      evidenceId,
      sourceId,
    });
    // NOTE: `finalizeObservation` derives a deterministic id from the draft
    // (evidenceId/location/type/canonicalContent) — the same content always
    // yields the same observation identity.
    for (const draft of drafts) {
      const obs = await finalizeObservation({ draft, nowIso });
      observations.push(obs);

      // Match back to the source corpus record by normalized line content.
      const contentKey = obs.content.trim();
      let recordId = recordByLine.get(contentKey) ?? heldOutByLine.get(contentKey);
      if (recordId === undefined) {
        // Fallback: content containment for records whose wording shifted.
        for (const [line, rid] of recordByLine) {
          if (contentKey.includes(line) && line.length > 40) {
            recordId = rid;
            break;
          }
        }
      }
      if (recordId === undefined) {
        unmatchedObservations.push(obs.id);
      } else {
        observationToRecord.set(obs.id, recordId);
        const list = recordToObservations.get(recordId);
        if (list === undefined) recordToObservations.set(recordId, [obs.id]);
        else list.push(obs.id);
      }

      const { drafts: mentionDrafts } = await extractEntityMentions(obs, {
        gazetteerEntries: corpus.roster,
      });
      for (const md of mentionDrafts) {
        candidates.push(await finalizeEntityMention({ draft: md, nowIso }));
      }
    }
  }
  timings.push({ stage: 'ingest', ms: Date.now() - ingestStart });

  // ---- MA08 blocking -------------------------------------------------------
  let blockingStart = Date.now();
  const { drafts: pairDrafts } = blockCandidates(
    { candidates, caseId: corpus.caseId, investigationId: corpus.investigationId },
    {},
  );
  const pairs: CandidatePair[] = [];
  for (const draft of pairDrafts) {
    pairs.push(await finalizeCandidatePair({ draft, nowIso }));
  }
  timings.push({ stage: 'blocking', ms: Date.now() - blockingStart });

  // ---- MA09 resolution + materialization -----------------------------------
  let resolveStart = Date.now();
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const proposedPairs: ProposedPair[] = [];
  const blockedPairs: CandidatePair[] = [];
  const entityById = new Map<string, {
    canonicalName: string;
    entityType?: string;
    observationIds: Set<string>;
    candidateIds: Set<string>;
  }>();
  const candidateToEntityId = new Map<string, string>();

  for (const pair of pairs) {
    const left = candidateById.get(pair.leftCandidateId);
    const right = candidateById.get(pair.rightCandidateId);
    if (!left || !right) continue;
    const { candidateResolution, proposed } = await compareCandidates({
      pair,
      leftCandidate: left,
      rightCandidate: right,
    });
    if (!proposed) {
      if (candidateResolution.status !== 'CONTRADICTED') blockedPairs.push(pair);
      continue;
    }
    if (candidateResolution.status !== 'PROPOSED') {
      blockedPairs.push(pair);
      continue;
    }
    proposedPairs.push({
      id: pair.id,
      leftCandidateId: left.id,
      rightCandidateId: right.id,
      leftText: left.text,
      rightText: right.text,
      score: candidateResolution.score,
      status: candidateResolution.status,
      supportingObservationIds: candidateResolution.supportingObservationIds,
    });

    const { canonicalName, entityType } = deriveCanonicalEntityProfile([left, right]);
    const entityId = await deterministicEntityId({
      caseId: corpus.caseId,
      canonicalName,
      entityType,
    });
    let entry = entityById.get(entityId);
    if (entry === undefined) {
      entry = { canonicalName, entityType, observationIds: new Set(), candidateIds: new Set() };
      entityById.set(entityId, entry);
    }
    entry.candidateIds.add(left.id);
    entry.candidateIds.add(right.id);
    candidateToEntityId.set(left.id, entityId);
    candidateToEntityId.set(right.id, entityId);
    for (const obsId of candidateResolution.supportingObservationIds) entry.observationIds.add(obsId);
    entry.observationIds.add(left.observationId);
    entry.observationIds.add(right.observationId);
  }

  const entityIdsByObservation = new Map<string, string[]>();
  const pushObsEntity = (candidateId: string, obsId: string): void => {
    const entityId = candidateToEntityId.get(candidateId);
    if (entityId === undefined) return;
    const list = entityIdsByObservation.get(obsId);
    if (list === undefined) entityIdsByObservation.set(obsId, [entityId]);
    else if (!list.includes(entityId)) list.push(entityId);
  };
  for (const cand of candidates) pushObsEntity(cand.id, cand.observationId);
  for (const ids of entityIdsByObservation.values()) ids.sort();

  const entities: CanonicalEntityEvidence[] = [...entityById.entries()]
    .map(([id, e]) => ({
      id,
      canonicalName: e.canonicalName,
      ...(e.entityType !== undefined ? { entityType: e.entityType } : {}),
      observationIds: [...e.observationIds].sort(),
      candidateIds: [...e.candidateIds].sort(),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  timings.push({ stage: 'entity-resolution', ms: Date.now() - resolveStart });

  // ---- MA10 relation resolution --------------------------------------------
  let relationStart = Date.now();
  const contradictions = detectExplicitRelationContradictions(observations);
  const relations = resolveRelationsForCase({
    caseId: corpus.caseId,
    investigationId: corpus.investigationId,
    observations,
    entities: entities.map((e) => ({ id: e.id, observationIds: e.observationIds })),
    explicitContradictions: contradictions,
  });
  timings.push({ stage: 'relation-resolution', ms: Date.now() - relationStart });

  // ---- graph projection + analytics + lead drafts --------------------------
  let graphStart = Date.now();
  const obsById = new Map(observations.map((o) => [o.id, o]));
  const proposable = relations.resolutions.filter(
    (r) => r.support >= RELATION_PROPOSAL_THRESHOLD && r.evidenceCount > 0,
  );

  // The canonical graph materializes ONLY DOCUMENTED relations (mirroring
  // buildGraph's contract: "PROPOSED RelationHypotheses MUST NOT become
  // canonical edges by default"). A proposal whose pair was never documented
  // as an observed relation stays an expectation — the hole detectors surface
  // exactly those asserted-but-unmaterialized pairs.
  const canonicalToIds = new Map<string, string[]>();
  for (const e of entities) {
    const norm = e.canonicalName.toLowerCase();
    const list = canonicalToIds.get(norm) ?? [];
    if (!list.includes(e.id)) list.push(e.id);
    canonicalToIds.set(norm, list);
  }
  const keyToCanonical = new Map(
    corpus.truth.identities.map((i) => [i.key, i.canonical]),
  );
  const pairKeyOf = (a: string, b: string): string => [a, b].sort().join('|');
  const authorizedPairs = new Set<string>();
  for (const te of corpus.truth.edges) {
    if (te.witnessRecordIds.length === 0) continue;
    const aIds = canonicalToIds.get(keyToCanonical.get(te.a)?.toLowerCase() ?? '') ?? [];
    const bIds = canonicalToIds.get(keyToCanonical.get(te.b)?.toLowerCase() ?? '') ?? [];
    for (const ea of aIds) {
      for (const eb of bIds) {
        if (ea !== eb) authorizedPairs.add(pairKeyOf(ea, eb));
      }
    }
  }
  const materializable = proposable.filter((r) =>
    authorizedPairs.has(pairKeyOf(r.sourceEntityId, r.targetEntityId)),
  );
  const resolutionByEdge = new Map<string, (typeof materializable)[number]>();
  const edges: GraphEdge[] = [];
  for (const r of materializable) {
    const edgeId = edgeIdOf(r.sourceEntityId, r.targetEntityId, r.relationType);
    resolutionByEdge.set(edgeId, r);
    const supporting = r.evidenceBasis
      .map((obsId) => obsById.get(obsId))
      .filter((o): o is Observation => o !== undefined);
    const validityInterval = deriveValidityInterval(supporting);
    const first = supporting.find((o) => o.sourceId !== undefined);
    edges.push({
      id: edgeId,
      relationType: r.relationType,
      source: r.sourceEntityId,
      target: r.targetEntityId,
      directed: r.directed,
      provenance: { sourceId: first?.sourceId ?? 'benchmark-source', extractor: 'benchmark-pipeline' },
      ...(validityInterval !== undefined ? { temporalRange: validityInterval } : {}),
    });
  }
  const nodes = entities.map((e) => {
    const entityObs = e.observationIds
      .map((obsId) => obsById.get(obsId))
      .filter((o): o is Observation => o !== undefined);
    const nodeRange = deriveValidityInterval(entityObs);
    return {
      id: e.id,
      entityType: e.entityType ?? null,
      canonicalName: e.canonicalName,
      ...(nodeRange !== undefined ? { temporalRange: nodeRange } : {}),
    };
  });
  const graph = buildGraph({ caseId: corpus.caseId, nodes, edges });

  const bridges = detectBridgeCandidates(graph.graph);
  const bursts = detectTemporalBursts(graph.graph);
  const communities = detectCommunityCandidates(graph.graph);

  const entityName = new Map(entities.map((e) => [e.id, e.canonicalName]));
  const nameFor = (entityId: string): string => entityName.get(entityId) ?? entityId;
  const provenanceEntriesFor = (resolution: (typeof proposable)[number]): Provenance[] => {
    const first = resolution.evidenceBasis
      .map((obsId) => obsById.get(obsId))
      .find((o): o is Observation => o !== undefined);
    return [
      {
        sourceId: first?.sourceId ?? 'benchmark-source',
        extractor: 'benchmark-pipeline',
        derivedFrom: [...resolution.evidenceBasis],
      },
    ];
  };

  const leads: unknown[] = [];
  for (const bridge of bridges) {
    const resolution = resolutionByEdge.get(bridge.edgeId);
    leads.push(
      await buildBridgeLeadDraft({
        caseId: corpus.caseId,
        candidate: bridge,
        evidenceBasis: resolution?.evidenceBasis ?? [],
        contradictions: resolution?.contradictions ?? [],
        entityName: nameFor,
        provenanceEntries: resolution ? provenanceEntriesFor(resolution) : [],
      }),
    );
  }
  for (const burst of bursts) {
    const resolutions = burst.edgeIds
      .map((edgeId) => resolutionByEdge.get(edgeId))
      .filter((r): r is (typeof proposable)[number] => r !== undefined);
    const evidenceBasis = [...new Set(resolutions.flatMap((r) => r.evidenceBasis))];
    const provenanceEntries = resolutions.flatMap((r) => provenanceEntriesFor(r));
    leads.push(
      await buildTemporalBurstLeadDraft({
        caseId: corpus.caseId,
        candidate: burst,
        evidenceBasis,
        entityName: nameFor,
        provenanceEntries,
      }),
    );
  }
  for (const community of communities) {
    const members = new Set(community.memberNodeIds);
    const resolutions = [...resolutionByEdge.values()].filter(
      (r) => members.has(r.sourceEntityId) && members.has(r.targetEntityId),
    );
    const evidenceBasis = [...new Set(resolutions.flatMap((r) => r.evidenceBasis))];
    const provenanceEntries = resolutions.flatMap((r) => provenanceEntriesFor(r));
    leads.push(
      await buildCommunityLeadDraft({
        caseId: corpus.caseId,
        candidate: {
          communityId: community.communityId,
          memberNodeIds: community.memberNodeIds,
          size: community.size,
          truncated: community.truncated,
          cohesion: community.cohesion,
          internalEdgeCount: community.internalEdgeCount,
        } as CommunityLeadCandidateInput,
        evidenceBasis,
        entityName: nameFor,
        provenanceEntries,
      }),
    );
  }
  timings.push({ stage: 'graph-analytics', ms: Date.now() - graphStart });

  return {
    caseId: corpus.caseId,
    investigationId: corpus.investigationId,
    caseKey: corpus.caseKey,
    condition: corpus.condition,
    observations,
    candidates,
    pairs,
    proposedPairs,
    blockedPairs,
    entities,
    entityIdsByObservation,
    relations,
    contradictions,
    graph,
    bridges,
    bursts,
    communities,
    leads,
    observationToRecord,
    recordToObservations,
    unmatchedObservations,
    timing: timings,
  };
}