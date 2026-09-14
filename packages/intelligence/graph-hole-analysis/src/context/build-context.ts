// ============================================================================
// Graph-Hole Analysis Context Builder (Phase 5A-PR7)
//
// Deterministic, closed-world context construction. ALL authority comes from
// the caller's supplied input — the builder NEVER reaches into any store,
// graph, or global state. It validates the authority boundary, derives
// completeness flags, selects observations/hypotheses/nodes/edges according
// to the frozen priority ordering, classifies them, and serializes the bounded
// context into a digest-stamped object.
//
// Guarantees:
//   - identical authoritative input → identical context (deterministic id sets,
//     sorted arrays, no clock/random ids, no hidden side channels);
//   - every authoritatively-required reference is present (candidate refs must
//     exist in the supplied input, else INPUT_CONTEXT_INCONSISTENT);
//   - the character budget is enforced as a hard cap (CONTEXT_TOO_LARGE);
//   - completeness is a faithful OBSERVED-FACT record of the input's known
//     truncation semantics — never inferred from list lengths.
// ============================================================================

import type {
  GraphEdge,
  GraphNode,
  Observation,
  QualifiedGraphHoleCandidate,
  TemporalInterval,
} from '@indago/contracts';
import { resolveSupportUnitKey } from '@indago/contracts';
import type { GraphHoleRegion, RegionLimitationCode } from '@indago/graph-hole-region';
import type { HypothesisContext } from '@indago/hypothesis-context';

import {
  CONSUMED_GRAPH_HOLE_POLICY_VERSION,
  DEFAULT_GRAPH_HOLE_ANALYSIS_BOUNDS,
} from '../contracts/analysis-policy.js';
import type { GraphHoleAnalysisInput } from '../contracts/analysis-input.js';
import type { GraphHoleAnalysisBounds } from '../contracts/analysis-policy.js';
import type {
  ContextAtomicHypothesis,
  ContextCompleteness,
  ContextContradiction,
  ContextCounts,
  ContextHypothesisGroup,
  ContextInferenceSignal,
  ContextObservation,
  ContextProvenance,
  ContextStructuralSignal,
  GraphHoleAnalysisContext,
} from './types.js';
import { intervalsOverlap } from './temporal.js';
import { serializeGraphHoleAnalysisProfile } from './serialize.js';
import { sortedUnique, sortedUniqueString } from './sorted.js';

// ---------------------------------------------------------------------------
// Deterministic canonical shape helpers
// ---------------------------------------------------------------------------

/** Canonical string for AtomicNodeReference (PR3). */
function nodeRefString(ref: { readonly kind: string; readonly id?: string }): string {
  if (ref.kind === 'unknown') return 'unknown';
  return `${ref.kind}:${ref.id}`;
}

// ---------------------------------------------------------------------------
// Authority + integrity checks (fail fast, deterministic)
// ---------------------------------------------------------------------------

function enforceAuthority(input: GraphHoleAnalysisInput): {
  region: GraphHoleRegion;
  candidate: QualifiedGraphHoleCandidate;
  resolvedBounds: GraphHoleAnalysisBounds;
} {
  if (input.qualifiedCandidate.qualified !== true) {
    throw new Error('INPUT_UNQUALIFIED_CANDIDATE');
  }
  const rc = input.qualifiedCandidate.rawCandidate;

  if (input.caseId !== input.region.identity.caseId) {
    throw new Error('INPUT_AUTHORITY_MISMATCH');
  }
  if (input.graphVersionId !== input.region.identity.graphVersionId) {
    throw new Error('INPUT_AUTHORITY_MISMATCH');
  }
  if (input.caseId !== rc.caseId) {
    throw new Error('INPUT_AUTHORITY_MISMATCH');
  }
  if (input.graphVersionId !== rc.graphVersionId) {
    throw new Error('INPUT_AUTHORITY_MISMATCH');
  }
  if (input.region.regionId !== rc.regionId) {
    throw new Error('INPUT_AUTHORITY_MISMATCH');
  }

  let resolvedBounds = DEFAULT_GRAPH_HOLE_ANALYSIS_BOUNDS;
  if (input.bounds !== undefined) {
    for (const [k, v] of Object.entries(input.bounds)) {
      if (v === undefined) continue;
      const key = k as keyof GraphHoleAnalysisBounds;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || !Number.isInteger(v)) {
        throw new Error('INPUT_BOUND_INVALID');
      }
      if (v > DEFAULT_GRAPH_HOLE_ANALYSIS_BOUNDS[key]) {
        throw new Error('INPUT_BOUND_INVALID');
      }
      resolvedBounds = { ...resolvedBounds, [key]: v };
    }
  }

  return { region: input.region, candidate: input.qualifiedCandidate, resolvedBounds };
}

// ---------------------------------------------------------------------------
// Completeness derivation (faithful OBSERVED-FACT record)
// ---------------------------------------------------------------------------

function deriveCompleteness(
  region: GraphHoleRegion,
  suppliedObservations: ReadonlySet<string>,
  includedObservations: ReadonlySet<string>,
  suppliedAtomicHypotheses: ReadonlySet<string>,
  includedAtomicHypotheses: ReadonlySet<string>,
  truncatedGroups: number,
  candidateTemporalScope: TemporalInterval | null,
  temporalContext: TemporalInterval | null,
): ContextCompleteness {
  const semanticRetrievalTruncated =
    region.semanticExpansion.providerTruncated === true ||
    region.limitations.includes('SEMANTIC_RESULTS_TRUNCATED' as RegionLimitationCode);
  const regionLimited =
    region.truncated === true || region.status === 'LIMITED' || region.status === 'DEGRADED';
  const observationContextLimited = suppliedObservations.size > includedObservations.size;
  const hypothesisContextLimited =
    suppliedAtomicHypotheses.size > includedAtomicHypotheses.size;
  const hypothesisGroupingTruncated = truncatedGroups > 0;
  const temporalContextLimited =
    candidateTemporalScope !== null &&
    !intervalsOverlap(temporalContext, candidateTemporalScope);
  return {
    semanticRetrievalTruncated,
    regionLimited,
    observationContextLimited,
    hypothesisContextLimited,
    hypothesisGroupingTruncated,
    temporalContextLimited,
    contextBudgetLimited: false,
  };
}

// ---------------------------------------------------------------------------
// Observation selection (candidate refs → atomic refs → rest, by id)
// ---------------------------------------------------------------------------

function selectObservations(
  observations: readonly Observation[],
  candidateRefs: ReadonlySet<string>,
  atomicRefs: ReadonlySet<string>,
  cap: number,
): { selected: readonly ContextObservation[]; overflow: boolean } {
  const byId = new Map(observations.map((o) => [o.id, o]));

  // Priority order: candidate refs first, then atomic refs, then remaining.
  const allRefs = [...candidateRefs, ...atomicRefs].filter((id) => byId.has(id));
  const obs = new Map<string, Observation>();
  for (const id of allRefs) obs.set(id, byId.get(id)!);
  for (const o of sortedUnique(observations, (x) => x.id)) {
    if (!obs.has(o.id)) obs.set(o.id, o);
  }
  const entries = [...obs.values()];
  const selected = entries.slice(0, cap);

  return {
    selected: selected.map((o) => ({
      id: o.id,
      kind: 'OBSERVED_FACT' as const,
      type: o.type,
      content: o.content,
      entityIds: sortedUniqueString(o.entityIds),
      evidenceId: o.evidenceId,
      sourceId: o.sourceId,
      supportUnitKey:
        resolveSupportUnitKey({
          sourceContextId: o.sourceContextId,
          sourceId: o.sourceId,
        })?.key ?? `source:${o.sourceId}`,
      eventTime: o.eventTime?.value,
      validityInterval: o.validityInterval ?? null,
    })),
    overflow: entries.length > cap,
  };
}

// ---------------------------------------------------------------------------
// Hypothesis selection (candidate-supporting groups → rest, atomic cap)
// ---------------------------------------------------------------------------

function selectGroupsAndAtoms(
  hypothesisContext: HypothesisContext,
  candidate: QualifiedGraphHoleCandidate,
  maxHypotheses: number,
): {
  groups: readonly ContextHypothesisGroup[];
  atoms: readonly ContextAtomicHypothesis[];
  overflow: boolean;
} {
  const rc = candidate.rawCandidate;
  const mustCoverDerivedIds = new Set(rc.supportingHypothesisIds);

  // Validate: every must-cover id must be present in the provided atomics.
  for (const dId of mustCoverDerivedIds) {
    if (!hypothesisContext.atomic.some((a) => a.derivedId === dId)) {
      throw new Error('INPUT_CONTEXT_INCONSISTENT');
    }
  }

  const atomicByDerivedId = new Map(
    hypothesisContext.atomic.map((a) => [a.derivedId, a]),
  );

  // Find groups covering any must-cover derivedId (group order = deterministic).
  const mustCoverGroupIds = new Set<string>();
  for (const g of hypothesisContext.groups) {
    for (const a of g.atomicHypotheses) {
      if (mustCoverDerivedIds.has(a.derivedId)) mustCoverGroupIds.add(g.groupId);
    }
  }

  // Deterministic order: must-cover groups first (PR3 order), then rest.
  const orderedGroups = [
    ...hypothesisContext.groups.filter((g) => mustCoverGroupIds.has(g.groupId)),
    ...hypothesisContext.groups.filter((g) => !mustCoverGroupIds.has(g.groupId)),
  ];

  const includedGroupIds = new Set<string>();
  const includedAtomics = new Map<string, ContextAtomicHypothesis>();
  let overflow = false;

  for (const g of orderedGroups) {
    if (includedAtomics.size >= maxHypotheses) { overflow = true; break; }
    const gAtomics: ContextAtomicHypothesis[] = [];
    for (const a of g.atomicHypotheses) {
      if (includedAtomics.size >= maxHypotheses) { overflow = true; break; }
      const ca = atomicByDerivedId.get(a.derivedId);
      if (ca) {
        const mapped = buildAtomicContext(ca);
        gAtomics.push(mapped);
        includedAtomics.set(a.derivedId, mapped);
      }
    }
    if (gAtomics.length > 0) includedGroupIds.add(g.groupId);
  }

  // Any must-cover id not included is also overflow.
  for (const dId of mustCoverDerivedIds) {
    if (!includedAtomics.has(dId)) overflow = true;
  }

  const groups = sortedUnique(
    [...includedGroupIds].map((gId) => {
      const g = hypothesisContext.groups.find((x) => x.groupId === gId)!;
      const gAtomics = g.atomicHypotheses
        .map((a) => includedAtomics.get(a.derivedId))
        .filter((a): a is ContextAtomicHypothesis => a !== undefined);
      return {
        groupId: g.groupId,
        componentId: g.componentId,
        atomicHypotheses: gAtomics,
        sharedNodeIds: sortedUniqueString(g.sharedNodeIds),
        canonicalEntityCount: g.canonicalEntityCount,
        truncated: g.truncated,
        truncatedReason: g.truncatedReason,
      };
    }),
    (g) => g.groupId,
  );

  return {
    groups,
    atoms: sortedUnique([...includedAtomics.values()], (a) => a.derivedId),
    overflow,
  };
}

function buildAtomicContext(a: {
  readonly derivedId: string;
  readonly hypothesisType: string;
  readonly subject: { readonly kind: string; readonly id?: string };
  readonly predicate: string;
  readonly object: { readonly kind: string; readonly id?: string };
  readonly referencedCanonicalEntityIds: readonly string[];
  readonly supportingObservations: readonly string[];
  readonly contradictingObservations: readonly string[];
  readonly contradictingHypothesisIds: readonly string[];
  readonly evidenceSupport: number;
  readonly structuralRelevance: number;
  readonly graphVersion: string | null;
  readonly temporalScope?: TemporalInterval | null;
}): ContextAtomicHypothesis {
  return {
    derivedId: a.derivedId,
    kind: 'HYPOTHESIS' as const,
    hypothesisType: a.hypothesisType,
    subject: nodeRefString(a.subject),
    predicate: a.predicate,
    object: nodeRefString(a.object),
    referencedCanonicalEntityIds: sortedUniqueString(a.referencedCanonicalEntityIds),
    supportingObservationIds: sortedUniqueString(a.supportingObservations),
    contradictingObservationIds: sortedUniqueString(a.contradictingObservations),
    contradictingHypothesisIds: sortedUniqueString(a.contradictingHypothesisIds),
    evidenceSupport: a.evidenceSupport,
    structuralRelevance: a.structuralRelevance,
    graphVersion: a.graphVersion,
    temporalScope: a.temporalScope ?? null,
  };
}

// ---------------------------------------------------------------------------
// Node + edge selection (candidate refs first, then remaining, by id)
// ---------------------------------------------------------------------------

function selectNodes(
  nodes: readonly GraphNode[],
  candidateNodeIds: ReadonlySet<string>,
  cap: number,
): readonly GraphNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ordered: GraphNode[] = [];
  for (const id of sortedUniqueString(candidateNodeIds)) {
    const n = byId.get(id);
    if (n) ordered.push(n);
  }
  for (const n of sortedUnique(nodes, (x) => x.id)) {
    if (!candidateNodeIds.has(n.id)) ordered.push(n);
  }
  return ordered.slice(0, cap);
}

function selectEdges(
  edges: readonly GraphEdge[],
  candidateEdgeIds: ReadonlySet<string>,
  cap: number,
): readonly GraphEdge[] {
  const byId = new Map(edges.map((e) => [e.id, e]));
  const ordered: GraphEdge[] = [];
  for (const id of sortedUniqueString(candidateEdgeIds)) {
    const e = byId.get(id);
    if (e) ordered.push(e);
  }
  for (const e of sortedUnique(edges, (x) => x.id)) {
    if (!candidateEdgeIds.has(e.id)) ordered.push(e);
  }
  return ordered.slice(0, cap);
}

// ---------------------------------------------------------------------------
// Contradiction derivation
// ---------------------------------------------------------------------------

function deriveContradictions(
  includedAtoms: readonly ContextAtomicHypothesis[],
  includedObservationIds: ReadonlySet<string>,
): readonly ContextContradiction[] {
  const out: ContextContradiction[] = [];
  for (const a of includedAtoms) {
    for (const obsId of a.contradictingObservationIds) {
      if (!includedObservationIds.has(obsId)) continue;
      out.push({
        id: `contrad:${a.derivedId}:${obsId}`,
        kind: 'CONTRADICTION' as const,
        observationId: obsId,
        hypothesisId: a.derivedId,
        contradictsObservationId: obsId,
        contradictsHypothesisId: null,
      });
    }
    for (const hypId of a.contradictingHypothesisIds) {
      out.push({
        id: `contrad:${a.derivedId}:${hypId}`,
        kind: 'CONTRADICTION' as const,
        observationId: null,
        hypothesisId: a.derivedId,
        contradictsObservationId: null,
        contradictsHypothesisId: hypId,
      });
    }
  }
  return sortedUnique(out, (c) => c.id);
}

// ---------------------------------------------------------------------------
// Provenance assembly (deduplicated by provenance sourceId)
// ---------------------------------------------------------------------------

function assembleProvenance(
  observations: readonly ContextObservation[],
  candidate: QualifiedGraphHoleCandidate,
): readonly ContextProvenance[] {
  const map = new Map<string, string[]>();
  // Each observation maps to its own sourceId — provenance source.
  // Observations carry their own sourceId as the source system of origin.
  for (const o of observations) {
    const existing = map.get(o.sourceId);
    if (existing) existing.push(o.id);
    else map.set(o.sourceId, [o.id]);
  }
  // Candidate's own provenance source.
  const rc = candidate.rawCandidate;
  const candidateSourceId = rc.provenance.sourceId;
  if (!map.has(candidateSourceId)) map.set(candidateSourceId, []);

  return sortedUnique(
    [...map.entries()].map(([sourceId, factIds]) => ({
      sourceId,
      observedFactIds: sortedUniqueString(factIds),
    })),
    (p) => p.sourceId,
  );
}

// ---------------------------------------------------------------------------
// Profile object (canonical JSON input for serialization)
// ---------------------------------------------------------------------------

function buildProfile(context: GraphHoleAnalysisContext): Record<string, unknown> {
  return {
    analysisPolicyVersion: context.analysisPolicyVersion,
    caseId: context.caseId,
    graphVersionId: context.graphVersionId,
    regionId: context.regionId,
    regionStatus: context.regionStatus,
    temporalContext: context.temporalContext,
    candidateTemporalScope: context.candidateTemporalScope,
    candidate: context.candidate,
    completeness: context.completeness,
    counts: context.counts,
    observations: context.observations,
    atomicHypotheses: context.atomicHypotheses,
    groups: context.groups,
    structuralSignals: context.structuralSignals,
    inferences: context.inferences,
    contradictions: context.contradictions,
    provenance: context.provenance,
    communities: context.communities,
  };
}

// ---------------------------------------------------------------------------
// Public API: buildGraphHoleAnalysisContext
// ---------------------------------------------------------------------------

/**
 * Build the bounded, typed AI package for the GraphHole analyst. Validates the
 * authority boundary, derives completeness, applies the priority selection,
 * then serializes the profile deterministically and returns the stamped context.
 */
export function buildGraphHoleAnalysisContext(
  input: GraphHoleAnalysisInput,
): { context: GraphHoleAnalysisContext; contextSha256: string; serialized: string } {
  const { region, candidate, resolvedBounds } = enforceAuthority(input);

  // Dedupe + sort input collections (stable canonical input).
  const observations = sortedUnique(input.observations, (o) => o.id);
  const nodes = sortedUnique(input.nodes, (n) => n.id);
  const edges = sortedUnique(input.edges, (e) => e.id);

  const rc = candidate.rawCandidate;

  // Candidate observation refs (must-cover).
  const candidateObservationRefs = new Set([
    ...rc.supportingObservationIds,
    ...rc.contradictingObservationIds,
  ]);

  // Temporal completeness inputs.
  const temporalContext = region.identity.temporalContext ?? null;
  const candidateTemporalScope = rc.temporalScope ?? null;

  // Select groups + atomic hypotheses (must-cover groups first, flat atomic cap).
  const { groups: includedGroups, atoms: includedAtoms } =
    selectGroupsAndAtoms(input.hypothesisContext, candidate, resolvedBounds.maxHypotheses);

  // Atomic observation refs (from included atomics only).
  const atomicObservationRefs = new Set(
    includedAtoms.flatMap((a) => [
      ...a.supportingObservationIds,
      ...a.contradictingObservationIds,
    ]),
  );

  // Required observation ids: candidate refs + atomic refs. Must exist in supplied input.
  const suppliedObsById = new Map(observations.map((o) => [o.id, o]));
  for (const id of [...candidateObservationRefs, ...atomicObservationRefs]) {
    if (!suppliedObsById.has(id)) throw new Error('INPUT_CONTEXT_INCONSISTENT');
  }

  // Select observations (priority order, cap).
  const { selected: includedObservations } = selectObservations(
    observations, candidateObservationRefs, atomicObservationRefs, resolvedBounds.maxObservations,
  );
  const includedObservationIds = new Set(includedObservations.map((o) => o.id));

  // Validate candidate node ids exist in supplied input.
  const suppliedNodeIds = new Set(nodes.map((n) => n.id));
  for (const nid of rc.nodeIds) {
    if (!suppliedNodeIds.has(nid)) throw new Error('INPUT_CONTEXT_INCONSISTENT');
  }

  // Select nodes + edges (candidate refs first, cap).
  const includedNodes = selectNodes(nodes, new Set(rc.nodeIds), resolvedBounds.maxNodes);
  const includedEdges = selectEdges(edges, new Set(rc.observedEdgeIds), resolvedBounds.maxEdges);

  // Structural signals (typed as NODE or EDGE).
  const structuralSignals: ContextStructuralSignal[] = [
    ...includedNodes.map((n) => ({
      id: n.id,
      kind: 'STRUCTURAL_SIGNAL' as const,
      kindLabel: 'NODE' as const,
      label: n.label,
      structuralImportance: n.structuralImportance,
      observationCount: 0,
      sourceCount: 0,
    })),
    ...includedEdges.map((e) => ({
      id: e.id,
      kind: 'STRUCTURAL_SIGNAL' as const,
      kindLabel: 'EDGE' as const,
      label: `${e.sourceNodeId}-${e.relationType}-${e.targetNodeId}`,
      relationType: e.relationType,
      structuralImportance: e.structuralImportance,
      observationCount: 0,
      sourceCount: 0,
      temporalRange: e.temporalRange,
    })),
  ];

  // Inferences (qualification scores — analyst interpretation, NOT observed facts).
  const inferences: ContextInferenceSignal[] = [
    { id: 'inference:structuralScore', kind: 'INFERENCE', label: 'structuralScore', value: candidate.structuralScore },
    { id: 'inference:evidenceSupportScore', kind: 'INFERENCE', label: 'evidenceSupportScore', value: candidate.evidenceSupportScore },
    { id: 'inference:expectedInformationValue', kind: 'INFERENCE', label: 'expectedInformationValue', value: candidate.expectedInformationValue },
    { id: 'inference:significance', kind: 'INFERENCE', label: 'significance', value: candidate.significance },
    { id: 'inference:independentSupportUnitCount', kind: 'INFERENCE', label: 'independentSupportUnitCount', value: candidate.independentSupportUnitIds.length },
  ];

  // Contradictions (authoritative, never resolved by PR7).
  const contradictions = deriveContradictions(includedAtoms, includedObservationIds);

  // Communities (only those whose node is in the included set).
  const includedNodeSet = new Set(includedNodes.map((n) => n.id));
  const communities = input.communities
    ? sortedUnique(
        [...input.communities.entries()]
          .filter(([nodeId]) => includedNodeSet.has(nodeId))
          .map(([nodeId, communityId]) => ({ nodeId, communityId })),
        (c) => `${c.communityId}:${c.nodeId}`,
      )
    : [];

  // Provenance (deduplicated by sourceId).
  const provenance = assembleProvenance(includedObservations, candidate);

  // Completeness (authoritative, observed-FACT record only).
  const suppliedObsIds = new Set(observations.map((o) => o.id));
  const suppliedAtomicIds = new Set(input.hypothesisContext.atomic.map((a) => a.derivedId));
  const includedAtomicIds = new Set(includedAtoms.map((a) => a.derivedId));
  const completeness = deriveCompleteness(
    region,
    suppliedObsIds,
    includedObservationIds,
    suppliedAtomicIds,
    includedAtomicIds,
    input.hypothesisContext.accounting.truncatedGroups,
    candidateTemporalScope,
    temporalContext,
  );

  // Counts (exact effective numbers the model actually saw).
  const counts: ContextCounts = {
    suppliedRegions: 1,
    suppliedCandidate: 1,
    suppliedNodeIds: nodes.length,
    suppliedEdgeIds: edges.length,
    suppliedObservations: observations.length,
    suppliedAtomicHypotheses: input.hypothesisContext.atomic.length,
    suppliedGroups: input.hypothesisContext.groups.length,
    includedObservations: includedObservations.length,
    includedAtomicHypotheses: includedAtoms.length,
    includedGroups: includedGroups.length,
    includedNodes: includedNodes.length,
    includedEdges: includedEdges.length,
    includedContradictions: contradictions.length,
    includedProvenanceSources: provenance.length,
    excludedObservations: observations.length - includedObservations.length,
    excludedAtomicHypotheses: input.hypothesisContext.atomic.length - includedAtoms.length,
    serializedContextChars: 0, // replaced after serialization
  };

  // Candidate summary (scores come from QualifiedGraphHoleCandidate, not raw).
  const candidateSummary = {
    candidateId: rc.candidateId,
    holeType: rc.detectorType,
    expectedRelationshipType: rc.expectedRelationshipType,
    structuralBasis: rc.structuralBasis,
    nodeIds: sortedUniqueString(rc.nodeIds),
    observedEdgeIds: sortedUniqueString(rc.observedEdgeIds),
    supportingHypothesisIds: sortedUniqueString(rc.supportingHypothesisIds),
    supportingObservationIds: sortedUniqueString(rc.supportingObservationIds),
    contradictingObservationIds: sortedUniqueString(rc.contradictingObservationIds),
    structuralScore: candidate.structuralScore,
    evidenceSupportScore: candidate.evidenceSupportScore,
    expectedInformationValue: candidate.expectedInformationValue,
    significance: candidate.significance,
    independentSupportUnitIds: sortedUniqueString(candidate.independentSupportUnitIds),
    regionStatus: candidate.regionStatus,
    scoringPolicyVersion: candidate.scoringPolicyVersion,
  };

  const context: GraphHoleAnalysisContext = {
    analysisPolicyVersion: CONSUMED_GRAPH_HOLE_POLICY_VERSION,
    caseId: input.caseId,
    graphVersionId: input.graphVersionId,
    regionId: input.region.regionId,
    regionStatus: input.region.status,
    temporalContext,
    candidateTemporalScope,
    candidate: candidateSummary,
    observations: includedObservations,
    atomicHypotheses: includedAtoms,
    groups: includedGroups,
    structuralSignals,
    inferences,
    contradictions,
    provenance,
    communities,
    completeness,
    counts,
  };

  // Serialize → digest + charBudget enforcement.
  const { serialized, contextSha256 } = serializeGraphHoleAnalysisProfile(
    buildProfile(context),
    resolvedBounds.maxSerializedContextChars,
  );

  // Patch serializedContextChars (final stamp).
  const finalCounts = { ...counts, serializedContextChars: serialized.length };
  const finalContext: GraphHoleAnalysisContext = { ...context, counts: finalCounts };

  return { context: finalContext, contextSha256, serialized };
}