// ============================================================================
// Phase 5B-PR1 — GraphHole -> InvestigativeGap lifecycle runtime
//
// Verifies the platform integration boundary:
//
//   qualified GraphHole
//        |
//        v
//   classifyGap()
//        |
//        v
//   InvestigativeGap upsert
//        |
//        v
//   GraphHole.investigationGapId
//        |
//        v
//   GRAPH_HOLE_DETECTED
//
// PR14, PR6 and PR13 already cover the individual upstream components.
// This test covers the 5B orchestration boundary.
// ============================================================================

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  GraphHoleGapRuntime,
} from '../../src/gaps/graph-hole-gap-runtime.js';

import {
  classifyGap,
} from '@indago/gap-classification';

// ============================================================================
// Mocks
// ============================================================================

const mocks = vi.hoisted(() => ({
  upsertFromGraphHole: vi.fn(),
  attachInvestigationGap: vi.fn(),
  emitGraphHoleDetected: vi.fn(),
}));

vi.mock(
  '@indago/gap-classification',
  () => ({
    classifyGap: vi.fn(),
  }),
);

vi.mock(
  '../../src/persistence/investigative-gap-store.js',
  () => ({
    investigativeGapStore: {
      upsertFromGraphHole:
        mocks.upsertFromGraphHole,
    },
  }),
);

vi.mock(
  '../../src/persistence/graph-hole-store.js',
  () => ({
    graphHoleStore: {
      attachInvestigationGap:
        mocks.attachInvestigationGap,
    },
  }),
);

vi.mock(
  '../../src/realtime/graph-hole-events.js',
  () => ({
    emitGraphHoleDetected:
      mocks.emitGraphHoleDetected,
  }),
);

// ============================================================================
// Fixtures
// ============================================================================

const CASE_ID =
  'case-pr5b-00000001';

const INVESTIGATION_ID =
  'investigation-pr5b-00000001';

const GRAPH_VERSION_ID =
  'graph-version-pr5b-00000001';

const CANDIDATE_ID =
  'candidate-pr5b-00000001';

const GRAPH_HOLE_ID =
  'graph-hole-record-pr5b-00000001';

const INVESTIGATIVE_GAP_ID =
  'gap-pr5b-00000001';

const COMPUTED_AT = {
  value: '2026-09-18T00:00:00.000Z',
  precision: 'exact' as const,
};

const qualification = {
  qualified: true,
  expectedInformationValue: 0.72,
  structuralScore: 0.81,
  evidenceSupportScore: 0.69,
  significance: 0.76,
  independentSupportUnitIds: [
    'support-unit-1',
    'support-unit-2',
  ],
  failureReasons: [],
  rawCandidate: {
    candidateId: CANDIDATE_ID,
    caseId: CASE_ID,
    graphVersionId: GRAPH_VERSION_ID,
    regionId: 'region-pr5b-00000001',
    detectorType: 'MISSING_EDGE',
    nodeIds: [
      'node-a',
      'node-b',
    ],
    observedEdgeIds: [],
    expectedRelationshipType:
      'communication',
    temporalScope: null,
    supportingHypothesisIds: [],
    supportingObservationIds: [],
    contradictingObservationIds: [],
    detectionPolicyVersion: 'v1',
    structuralBasis: 'STRUCTURAL_PATTERN',
    detectorMetadata: {},
    provenance: {},
  },
  regionStatus: 'SATURATED',
  scoringPolicyVersion: 'v2',
} as any;

const context = {
  scope: {
    caseId: CASE_ID,
    investigationId: INVESTIGATION_ID,
    graphVersionId: GRAPH_VERSION_ID,
    computedAt: COMPUTED_AT,
  },

  region: {
    regionId: 'region-pr5b-00000001',
    status: 'SATURATED',
    truncated: false,
    limitations: [],
  },

  nodes: [
    { id: 'node-a' },
    { id: 'node-b' },
  ],

  edges: [],

  observations: [],

  qualificationObservations: [],

  relationHypotheses: [],

  entityHypotheses: [],

  hypothesisContext: {
    atomic: [],
    groups: [],
  },

  presentRelations: [],

  contextSha256: 'a'.repeat(64),

  truncated: false,
} as any;

const persistedGraphHole = {
  id: GRAPH_HOLE_ID,
  identityKey: 'graph-hole-identity-pr5b',
  candidateId: CANDIDATE_ID,
  caseId: CASE_ID,
  investigationId: INVESTIGATION_ID,
  graphVersionId: GRAPH_VERSION_ID,
  regionId: 'region-pr5b-00000001',
  holeType: 'MISSING_EDGE',
  canonicalNodeIds: [
    'node-a',
    'node-b',
  ],
  expectedRelationshipType: 'communication',
  temporalScope: null,
  detectionPolicyVersion: 'v1',
  scoringPolicyVersion: 'v2',
  qualificationPolicyVersion: 'v1',
  status: 'ACTIVE',
  structuralScore: 0.81,
  evidenceSupportScore: 0.69,
  expectedInformationValue: 0.72,
  significance: 0.76,
  supersedesGraphHoleId: null,
  investigationGapId: null,
  supersededAt: null,
  createdAt:
    new Date('2026-09-18T00:00:00.000Z'),
  updatedAt:
    new Date('2026-09-18T00:00:00.000Z'),
} as any;

const classification = {
  graphHoleId: CANDIDATE_ID,
  gapId: null,
  type: 'MISSING_INVESTIGATION',
  status: 'CONFIDENT',
  reasonCodes: [
    'QUESTION_IDENTIFIED',
  ],
  supportingReferences: {
    supportingObservationIds: [],
    supportingHypothesisIds: [],
    structuralSignalIds: [
      'node-a',
      'node-b',
    ],
  },
  contextSha256: context.contextSha256,
  classificationPolicyVersion: 'v1',
  priority: 'HIGH',
  impact: 0.76,
  expectedInformationValue: 0.72,
  relatedEntityIds: [],
  relatedHypothesisIds: [],
  suggestedActions: [],
  computedAt: COMPUTED_AT,
  metadata: {},
} as any;

const gap = {
  id: INVESTIGATIVE_GAP_ID,
  description:
    'The expected communication relationship remains unverified.',
};

const runtime =
  new GraphHoleGapRuntime();

// ============================================================================
// Tests
// ============================================================================

describe(
  'Phase 5B-PR1 GraphHole -> InvestigativeGap runtime',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      vi.mocked(classifyGap)
        .mockReturnValue(classification);

      mocks.upsertFromGraphHole
        .mockResolvedValue({
          created: true,
          gap,
        });

      mocks.attachInvestigationGap
        .mockResolvedValue({
          attached: true,
          record: {
            ...persistedGraphHole,
            investigationGapId:
              INVESTIGATIVE_GAP_ID,
          },
        });
    });

    // ------------------------------------------------------------------------
    // T1
    // ------------------------------------------------------------------------

    it(
      'classifies, persists, links, and emits GRAPH_HOLE_DETECTED',
      async () => {
        const result =
          await runtime.persistFromQualifiedGraphHole({
            caseId: CASE_ID,
            investigationId:
              INVESTIGATION_ID,
            context,
            qualification,
            persistedGraphHole,
          });

        expect(
          classifyGap,
        ).toHaveBeenCalledOnce();

        expect(
          classifyGap,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            caseId: CASE_ID,
            graphVersionId:
              GRAPH_VERSION_ID,
            qualifiedCandidate:
              qualification,
            region:
              context.region,
            nodes:
              context.nodes,
            edges:
              context.edges,
            observations:
              context.observations,
            hypothesisContext:
              context.hypothesisContext,
            classificationPolicyVersion:
              'v1',
            computedAt:
              COMPUTED_AT,
          }),
        );

        expect(
          mocks.upsertFromGraphHole,
        ).toHaveBeenCalledOnce();

        expect(
          mocks.upsertFromGraphHole,
        ).toHaveBeenCalledWith({
          caseId: CASE_ID,
          investigationId:
            INVESTIGATION_ID,
          graphHole: {
            id: GRAPH_HOLE_ID,
            candidateId:
              CANDIDATE_ID,
            holeType:
              'MISSING_EDGE',
          },
          classification,
        });

        expect(
          mocks.attachInvestigationGap,
        ).toHaveBeenCalledOnce();

        expect(
          mocks.attachInvestigationGap,
        ).toHaveBeenCalledWith({
          caseId: CASE_ID,
          candidateId:
            CANDIDATE_ID,
          investigationGapId:
            INVESTIGATIVE_GAP_ID,
        });

        expect(
          mocks.emitGraphHoleDetected,
        ).toHaveBeenCalledOnce();

        expect(
          mocks.emitGraphHoleDetected,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            investigationId:
              INVESTIGATION_ID,
            caseId: CASE_ID,
            graphVersionId:
              GRAPH_VERSION_ID,
            holeId:
              CANDIDATE_ID,
            holeType:
              'MISSING_EDGE',
            investigationGapId:
              INVESTIGATIVE_GAP_ID,
            nodeIds: [
              'node-a',
              'node-b',
            ],
            expectedEdgeType:
              'communication',
            description:
              gap.description,
            operationId:
              expect.any(String),
          }),
        );

        expect(
          result.classification,
        ).toEqual(classification);

        expect(
          result.gap,
        ).toEqual(gap);

        expect(
          result.link,
        ).toEqual({
          attached: true,
          record: {
            ...persistedGraphHole,
            investigationGapId:
              INVESTIGATIVE_GAP_ID,
          },
        });
      },
    );

    // ------------------------------------------------------------------------
    // T2
    // ------------------------------------------------------------------------

    it(
      'does not create a gap when classification lacks sufficient context',
      async () => {
        vi.mocked(classifyGap)
          .mockReturnValue({
            graphHoleId:
              CANDIDATE_ID,
            gapId: null,
            status:
              'INSUFFICIENT_CONTEXT',
            type: undefined,
            reasonCodes: [],
            supportingReferences: {
              supportingObservationIds: [],
              supportingHypothesisIds: [],
              structuralSignalIds: [],
            },
            contextSha256:
              context.contextSha256,
            classificationPolicyVersion:
              'v1',
            priority: 'LOW',
            impact: 0,
            expectedInformationValue: 0,
            relatedEntityIds: [],
            relatedHypothesisIds: [],
            suggestedActions: [],
            computedAt:
              COMPUTED_AT,
            metadata: {},
          } as any);

        const result =
          await runtime.persistFromQualifiedGraphHole({
            caseId: CASE_ID,
            investigationId:
              INVESTIGATION_ID,
            context,
            qualification,
            persistedGraphHole,
          });

        expect(
          result.created,
        ).toBe(false);

        expect(
          result.gap,
        ).toBeNull();

        expect(
          result.link,
        ).toBeNull();

        expect(
          mocks.upsertFromGraphHole,
        ).not.toHaveBeenCalled();

        expect(
          mocks.attachInvestigationGap,
        ).not.toHaveBeenCalled();

        expect(
          mocks.emitGraphHoleDetected,
        ).not.toHaveBeenCalled();
      },
    );

    // ------------------------------------------------------------------------
    // T3
    // ------------------------------------------------------------------------

    it(
      'does not emit a duplicate event when the GraphHole is already linked',
      async () => {
        mocks.attachInvestigationGap
          .mockResolvedValueOnce({
            attached: true,
            record: {
              ...persistedGraphHole,
              investigationGapId:
                INVESTIGATIVE_GAP_ID,
            },
          })
          .mockResolvedValueOnce({
            attached: false,
            record: {
              ...persistedGraphHole,
              investigationGapId:
                INVESTIGATIVE_GAP_ID,
            },
          });

        await runtime.persistFromQualifiedGraphHole({
          caseId: CASE_ID,
          investigationId:
            INVESTIGATION_ID,
          context,
          qualification,
          persistedGraphHole,
        });

        await runtime.persistFromQualifiedGraphHole({
          caseId: CASE_ID,
          investigationId:
            INVESTIGATION_ID,
          context,
          qualification,
          persistedGraphHole,
        });

        expect(
          mocks.upsertFromGraphHole,
        ).toHaveBeenCalledTimes(2);

        expect(
          mocks.attachInvestigationGap,
        ).toHaveBeenCalledTimes(2);

        expect(
          mocks.emitGraphHoleDetected,
        ).toHaveBeenCalledTimes(1);
      },
    );

    // ------------------------------------------------------------------------
    // T4
    // ------------------------------------------------------------------------

    it(
      'never emits before the GraphHole -> InvestigativeGap link succeeds',
      async () => {
        const order: string[] = [];

        mocks.upsertFromGraphHole
          .mockImplementationOnce(
            async () => {
              order.push('gap-upsert');

              return {
                created: true,
                gap,
              };
            },
          );

        mocks.attachInvestigationGap
          .mockImplementationOnce(
            async () => {
              order.push('gap-link');

              return {
                attached: true,
                record: {
                  ...persistedGraphHole,
                  investigationGapId:
                    INVESTIGATIVE_GAP_ID,
                },
              };
            },
          );

        mocks.emitGraphHoleDetected
          .mockImplementationOnce(
            () => {
              order.push('event');
            },
          );

        await runtime.persistFromQualifiedGraphHole({
          caseId: CASE_ID,
          investigationId:
            INVESTIGATION_ID,
          context,
          qualification,
          persistedGraphHole,
        });

        expect(order).toEqual([
          'gap-upsert',
          'gap-link',
          'event',
        ]);
      },
    );
    it(
      'uses "other" when a persisted GraphHole has no expected relationship type',
      async () => {
        const noExpectedEdgeHole = {
          ...persistedGraphHole,
          holeType: 'ISOLATED_NODE',
          expectedRelationshipType: null,
        } as any;

        await runtime.persistFromQualifiedGraphHole({
          caseId: CASE_ID,
          investigationId: INVESTIGATION_ID,
          context,
          qualification,
          persistedGraphHole: noExpectedEdgeHole,
        });

        expect(
          mocks.emitGraphHoleDetected,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            holeType: 'ISOLATED_NODE',
            expectedEdgeType: 'other',
          }),
        );
      },
    );
  },
);