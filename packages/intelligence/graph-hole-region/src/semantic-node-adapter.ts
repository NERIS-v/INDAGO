// ============================================================================
// Semantic → Node Adapter (Phase 5A-PR2)
//
// The ONLY place in the region pipeline permitted to bridge semantic text units
// (PR1.5 recall layer) to authoritative graph nodes. Mapping is AUTHORITATIVE:
//
//   semantic hit (sourceType + sourceId)
//     → canonical entity ids via M-A09/M-A10 (injected resolver)
//     → M-A13 graph nodes via the build's node membership (injected hasNode)
//
// Frozen rules:
//   - Resolution never consults similarity, normalizedText, model metadata or
//     any string/prefix/fuzzy/name signal. A low-similarity hit maps exactly
//     like a high-similarity one; the retrieval rank is a recall signal only.
//   - A hit whose source has NO canonical entity is reported UNRESOLVED.
//   - A hit whose entities are absent from THIS graph version is reported
//     NON_NODE_SOURCE. Both are counted and reason-tagged — never fabricated
//     into a node.
//   - One hit may map to several nodes; the report deduplicates node ids and
//     sorts them. The report's attribution preserves the port result order
//     (deterministic).
//   - The mapping context carries exactly ONE (caseId, graphVersionId); the
//     resolver is invoked with that caseId and nothing else, so a query can
//     never cross case boundaries here.
// ============================================================================

import type {
  SemanticNodeAttribution,
  SemanticNodeMappingReport,
  SemanticNodeMappingRejection,
  SemanticSearchResult,
  SemanticSourceType,
  TemporalInterval,
} from '@indago/contracts';

export interface SemanticNodeMappingContext {
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly temporalContext?: TemporalInterval | null;
  /**
   * M-A09/M-A10 authoritative resolution: a source object (by type + canonical
   * id) → its canonical entity ids. The caller must scope this lookup to
   * `caseId`; the adapter re-asserts the single case before every call.
   */
  readonly resolveSourceEntities: (input: {
    readonly caseId: string;
    readonly sourceType: SemanticSourceType;
    readonly sourceId: string;
  }) => Promise<readonly string[]>;
  /** M-A13 membership: is this canonical entity present as a node in this build's graph version? */
  readonly hasNode: (nodeId: string) => boolean;
}

export interface SemanticNodeAdapter {
  mapSemanticResultsToNodes(
    results: readonly SemanticSearchResult[],
    context: SemanticNodeMappingContext,
  ): Promise<SemanticNodeMappingReport>;
}

/**
 * The production adapter. Pure map over an authoritative lookup: it owns no
 * storage, no ranking, no similarity — only the source → entity → node closure
 * under the pinned contract schema.
 */
export class AuthoritativeSemanticNodeAdapter implements SemanticNodeAdapter {
  async mapSemanticResultsToNodes(
    results: readonly SemanticSearchResult[],
    context: SemanticNodeMappingContext,
  ): Promise<SemanticNodeMappingReport> {
    const seenNodes = new Set<string>();
    const rejected = new Map<SemanticNodeMappingRejection, number>();
    const attribution: SemanticNodeAttribution[] = [];

    let mappedCount = 0;
    let unresolvedCount = 0;
    let rejectedCount = 0;

    for (const hit of results) {
      const entities = await context.resolveSourceEntities({
        caseId: context.caseId,
        sourceType: hit.sourceType,
        sourceId: hit.sourceId,
      });

      const entitySet = [...new Set(entities)];

      if (entitySet.length === 0) {
        unresolvedCount += 1;
        rejected.set('UNRESOLVED', (rejected.get('UNRESOLVED') ?? 0) + 1);
        attribution.push({
          semanticTextUnitId: hit.semanticTextUnitId,
          sourceType: hit.sourceType,
          sourceId: hit.sourceId,
          mappedNodeIds: [],
          outcome: 'UNRESOLVED',
          rejectionReason: 'UNRESOLVED',
        });
        continue;
      }

      const nodeIds = entitySet.filter((id) => context.hasNode(id)).sort();
      if (nodeIds.length === 0) {
        rejectedCount += 1;
        rejected.set('NON_NODE_SOURCE', (rejected.get('NON_NODE_SOURCE') ?? 0) + 1);
        attribution.push({
          semanticTextUnitId: hit.semanticTextUnitId,
          sourceType: hit.sourceType,
          sourceId: hit.sourceId,
          mappedNodeIds: [],
          outcome: 'REJECTED',
          rejectionReason: 'NON_NODE_SOURCE',
        });
        continue;
      }

      mappedCount += 1;
      for (const id of nodeIds) seenNodes.add(id);
      attribution.push({
        semanticTextUnitId: hit.semanticTextUnitId,
        sourceType: hit.sourceType,
        sourceId: hit.sourceId,
        mappedNodeIds: nodeIds,
        outcome: 'MAPPED',
      });
    }

    const rejectedReasons = [...rejected.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0));

    return {
      mappedCount,
      unresolvedCount,
      rejectedCount,
      rejectedReasons,
      mappedNodeIds: [...seenNodes].sort(),
      attribution,
    } satisfies SemanticNodeMappingReport;
  }
}