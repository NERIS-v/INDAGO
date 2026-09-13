// ============================================================================
// Components, bounded grouping, and context assembly (Phase 5A-PR3)
//
// Grouping contract (§18/§19, frozen):
//   1. The hypothesis-overlap graph has one node per atomic hypothesis and an
//      edge between two atomic hypotheses exactly when they share at least one
//      canonical graph node/entity (see canonical.ts). Directionality does not
//      prevent grouping.
//   2. Groups are weakly connected components (WCC) of the overlap graph,
//      computed with a deterministic union-find over sorted member ids.
//   3. A component whose SPLIT ORDERING (atomic cap 25 / group node cap 50)
//      is exceeded is split deterministically by greedy assignment in the
//      documented V1 total order. Every retained hypothesis is assigned to
//      exactly one group; nothing is sampled, dropped, or randomized.
//   4. Group and component ids are content-addressed SHA-256 digests over
//      sorted member derivedIds (byte-stable, no randomness).
// ============================================================================

import { MAX_ATOMIC_HYPOTHESES_PER_GROUP, MAX_GROUP_NODES } from '@indago/contracts';
import { fromEntity, fromRelation } from './atomic.js';
import { canonicalEntityIdsOf, overlapNodeKeys, sortAtomic } from './canonical.js';
import { sha256Hex } from './sha256.js';
import type {
  AtomicRelationshipHypothesis,
  HypothesisContext,
  HypothesisContextAccounting,
  HypothesisContextInput,
  HypothesisGroup,
} from './types.js';

// ============================================================================
// Normalization + deterministic dedupe
// ============================================================================

export function normalizeAndSort(input: HypothesisContextInput): AtomicRelationshipHypothesis[] {
  const graphVersion = input.graphVersionId ?? null;
  const atoms: AtomicRelationshipHypothesis[] = [
    ...(input.relationHypotheses ?? []).map((rel) => fromRelation(rel, graphVersion)),
    ...(input.entityHypotheses ?? []).map((ent) => fromEntity(ent, graphVersion)),
  ];

  // Dedupe by derivedId; keep the first occurrence deterministically.
  const seen = new Set<string>();
  const deduped: AtomicRelationshipHypothesis[] = [];
  for (const atom of atoms) {
    if (!seen.has(atom.derivedId)) {
      seen.add(atom.derivedId);
      deduped.push(atom);
    }
  }

  return sortAtomic(deduped);
}

// ============================================================================
// Weakly connected components over the canonical-node overlap graph
// ============================================================================

class UnionFind {
  private readonly parent = new Map<string, string>();
  private readonly rank = new Map<string, number>();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    let root = this.parent.get(x)!;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    let cursor = x;
    while (this.parent.get(cursor) !== cursor) {
      const next = this.parent.get(cursor)!;
      this.parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;
    const rankX = this.rank.get(rootX)!;
    const rankY = this.rank.get(rootY)!;
    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }
}

function buildOverlapUnionFind(atoms: readonly AtomicRelationshipHypothesis[]): UnionFind {
  const uf = new UnionFind();
  const entityToAtomics = new Map<string, string[]>();
  for (const atom of atoms) {
    for (const entityId of canonicalEntityIdsOf(atom)) {
      const members = entityToAtomics.get(entityId);
      if (members === undefined) {
        entityToAtomics.set(entityId, [atom.derivedId]);
      } else {
        members.push(atom.derivedId);
      }
    }
  }
  for (const memberIds of entityToAtomics.values()) {
    if (memberIds.length < 2) continue;
    const base = memberIds[0]!;
    for (let i = 1; i < memberIds.length; i++) {
      uf.union(base, memberIds[i]!);
    }
  }
  return uf;
}

/**
 * Deterministic weakly connected components. Each component's members are in
 * canonical order; components are ordered by lexicographic comparison of their
 * sorted member id lists (byte-stable regardless of input order).
 */
export function computeComponents(
  atoms: readonly AtomicRelationshipHypothesis[],
): readonly (readonly AtomicRelationshipHypothesis[])[] {
  if (atoms.length === 0) return [];
  const uf = buildOverlapUnionFind(atoms);
  const atomById = new Map<string, AtomicRelationshipHypothesis>();
  for (const atom of atoms) atomById.set(atom.derivedId, atom);

  const rootToMembers = new Map<string, string[]>();
  for (const atom of atoms) {
    const root = uf.find(atom.derivedId);
    const members = rootToMembers.get(root);
    if (members === undefined) {
      rootToMembers.set(root, [atom.derivedId]);
    } else {
      members.push(atom.derivedId);
    }
  }

  const components: (readonly AtomicRelationshipHypothesis[])[] = [];
  for (const memberIds of rootToMembers.values()) {
    const sortedIds = [...memberIds].sort();
    components.push(sortedIds.map((id) => atomById.get(id)!));
  }
  components.sort(compareComponentOrder);
  return components;
}

function compareComponentOrder(
  a: readonly AtomicRelationshipHypothesis[],
  b: readonly AtomicRelationshipHypothesis[],
): number {
  const aIds = a.map((atom) => atom.derivedId);
  const bIds = b.map((atom) => atom.derivedId);
  const shared = Math.min(aIds.length, bIds.length);
  for (let i = 0; i < shared; i++) {
    const delta = aIds[i]!.localeCompare(bIds[i]!);
    if (delta !== 0) return delta;
  }
  return aIds.length - bIds.length;
}

// ============================================================================
// Deterministic bounded splitting (§19) + group assembly
// ============================================================================

export function componentId(members: readonly AtomicRelationshipHypothesis[]): string {
  return sha256Hex(`indago:hypothesis-wcc-component:v1:${sortedMemberIds(members).join('|')}`);
}

export function groupId(members: readonly AtomicRelationshipHypothesis[]): string {
  return sha256Hex(`indago:hypothesis-group:v1:${sortedMemberIds(members).join('|')}`);
}

function sortedMemberIds(members: readonly AtomicRelationshipHypothesis[]): string[] {
  return members.map((atom) => atom.derivedId).sort();
}

interface RawGroup {
  readonly members: readonly AtomicRelationshipHypothesis[];
  readonly nodeKeys: readonly string[];
}

/**
 * Greedy deterministic split of ONE component into bounded groups.
 *
 * Members are visited in the V1 total order. A group is closed only when adding
 * the next member would violate MAX_ATOMIC_HYPOTHESES_PER_GROUP (25 atomics) or
 * MAX_GROUP_NODES (50 canonical entities). When both would be violated the
 * atomic cap is reported (documented deterministic priority). A single atomic
 * hypothesis is never split. All members are retained; the reason that forced
 * the split is recorded on every group of a truncated component.
 */
export function splitComponent(
  members: readonly AtomicRelationshipHypothesis[],
): { readonly groups: readonly HypothesisGroup[]; readonly componentSplitReason: 'ATOMIC_HYPOTHESES_CAP' | 'GROUP_NODES_CAP' | null } {
  const sorted = sortAtomic(members);
  const compId = componentId(sorted);
  const rawGroups: RawGroup[] = [];
  const componentSplitReason = splitIntoSortedGroups(sorted, rawGroups);

  const truncated = rawGroups.length > 1;
  const groups: HypothesisGroup[] = rawGroups.map((raw) => ({
    groupId: groupId(raw.members),
    componentId: compId,
    atomicHypotheses: raw.members,
    sharedNodeIds: [...raw.nodeKeys].sort(),
    canonicalEntityCount: raw.nodeKeys.filter((key) => key.startsWith('entity:')).length,
    truncated,
    truncatedReason: truncated ? componentSplitReason : null,
    componentTotals: { atomicHypotheses: members.length },
  }));
  return { groups, componentSplitReason };
}

function splitIntoSortedGroups(
  sorted: readonly AtomicRelationshipHypothesis[],
  rawGroups: RawGroup[],
): 'ATOMIC_HYPOTHESES_CAP' | 'GROUP_NODES_CAP' | null {
  let current: AtomicRelationshipHypothesis[] = [];
  let currentNodes = new Set<string>();
  let lastSplitReason: 'ATOMIC_HYPOTHESES_CAP' | 'GROUP_NODES_CAP' | null = null;

  function flush(reason: 'ATOMIC_HYPOTHESES_CAP' | 'GROUP_NODES_CAP' | null): void {
    if (current.length === 0) return;
    rawGroups.push({ members: [...current], nodeKeys: [...currentNodes].sort() });
    current = [];
    currentNodes = new Set<string>();
    if (reason !== null) lastSplitReason = reason;
  }

  for (const atom of sorted) {
    const atomNodeKeys = overlapNodeKeys(atom);
    const nextNodes = new Set([...currentNodes, ...atomNodeKeys]);
    const wouldViolateAtomicCap = current.length >= MAX_ATOMIC_HYPOTHESES_PER_GROUP;
    const wouldViolateNodeCap = current.length > 0 && nextNodes.size > MAX_GROUP_NODES;

    if (wouldViolateAtomicCap || wouldViolateNodeCap) {
      flush(wouldViolateAtomicCap ? 'ATOMIC_HYPOTHESES_CAP' : 'GROUP_NODES_CAP');
    }
    current.push(atom);
    for (const key of atomNodeKeys) currentNodes.add(key);
  }
  flush(null);

  return lastSplitReason;
}

// ============================================================================
// Context assembly
// ============================================================================

/**
 * Build the full derived, grouped hypothesis context (Phase 5A-PR3).
 *
 * Integration with the candidate-region pipeline: a GraphHoleRegion already
 * carries `identity.caseId` and `identity.graphVersionId`; pass them as
 * `input.caseId` / `input.graphVersionId` along with the region's collected
 * RelationHypotheses / EntityHypotheses to derive the grouped context for that
 * bounded analysis context.
 */
export function buildHypothesisContext(input: HypothesisContextInput): HypothesisContext {
  const atomic = normalizeAndSort(input);
  const components = computeComponents(atomic);

  const groups: HypothesisGroup[] = [];
  for (const component of components) {
    groups.push(...splitComponent(component).groups);
  }

  const accounting: HypothesisContextAccounting = {
    inputRelationHypotheses: input.relationHypotheses?.length ?? 0,
    inputEntityHypotheses: input.entityHypotheses?.length ?? 0,
    atomicHypotheses: atomic.length,
    components: components.length,
    groups: groups.length,
    truncatedGroups: groups.filter((group) => group.truncated).length,
    isolatedAtomics: atomic.filter((atom) => canonicalEntityIdsOf(atom).length === 0).length,
    totalCanonicalNodesAcrossGroups: groups.reduce(
      (sum, group) => sum + group.canonicalEntityCount,
      0,
    ),
  };

  return {
    policyVersion: 'v1',
    caseId: input.caseId,
    graphVersionId: input.graphVersionId ?? null,
    atomicOrder: {
      evidenceSupport: 'desc',
      structuralRelevance: 'desc',
      derivedHypothesisId: 'asc',
    },
    atomic,
    groups,
    accounting,
  };
}