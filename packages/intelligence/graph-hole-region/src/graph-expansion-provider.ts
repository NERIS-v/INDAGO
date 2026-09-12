// ============================================================================
// ProjectedGraphExpansionProvider (Phase 5A-PR1)
//
// The production GraphExpansionProvider over the EXISTING M-A13 graph runtime:
// a Graphology projection produced deterministically by
// @indago/graphology-projection's buildGraph. This is THE graph authority PR1
// consumes — no store, no second graph backend, read-only queries only.
//
// The provider is bound to one (caseId, graphVersionId). Every request is
// re-checked against that authority so cross-case input is impossible
// (AUTHORITY_MISMATCH — guards case isolation).
//
// All traversal logic is delegated to the pure expand-region primitives.
// ============================================================================

import type { BuiltGraph } from '@indago/graphology-projection';
import {
  expandGraphSteps,
  incidentEdgesOf,
} from './expand-region.js';
import { RegionBuildError } from './types.js';
import type {
  GraphExpansionProvider,
  GraphExpansionRequest,
  GraphExpansionResult,
  IncidentEdgesRequest,
} from './types.js';

export class ProjectedGraphExpansionProvider implements GraphExpansionProvider {
  readonly caseId: string;

  constructor(
    readonly builtGraph: BuiltGraph,
    readonly graphVersionId: string,
  ) {
    this.caseId = builtGraph.caseId;
  }

  hasNode(nodeId: string): boolean {
    return this.builtGraph.graph.hasNode(nodeId);
  }

  async expandGraph(request: GraphExpansionRequest): Promise<GraphExpansionResult> {
    this.assertAuthority(request.caseId, request.graphVersionId);
    return {
      candidateNodeIds: expandGraphSteps(
        this.builtGraph.graph,
        request.memberNodeIds,
        request.temporalContext ?? null,
      ),
    };
  }

  async incidentEdges(request: IncidentEdgesRequest): Promise<readonly string[]> {
    this.assertAuthority(request.caseId, request.graphVersionId);
    return incidentEdgesOf(
      this.builtGraph.graph,
      request.nodeIds,
      request.temporalContext ?? null,
    );
  }

  // NOTE (PR2): semantic expansion is NOT part of this provider. It is an
  // optional builder dependency (RegionBuildDependencies.semanticExpansion)
  // wired as SemanticRetrievalPort + SemanticNodeAdapter by the caller.

  private assertAuthority(caseId: string, graphVersionId: string): void {
    if (caseId !== this.caseId || graphVersionId !== this.graphVersionId) {
      throw new RegionBuildError(
        'AUTHORITY_MISMATCH',
        `ProjectedGraphExpansionProvider bound to ${this.caseId}@${this.graphVersionId} `
          + `received a request for ${caseId}@${graphVersionId}`,
      );
    }
  }
}