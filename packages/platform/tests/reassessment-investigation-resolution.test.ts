import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  runBatch: vi.fn(),
}));

vi.mock(
  "../src/db/prisma.js",
  () => ({
    db: {
      investigationRun: {
        findFirst: mocks.findFirst,
      },
    },
  }),
);

vi.mock(
  "../src/reassessment/reassessment-runner.js",
  () => ({
    ReassessmentRunner: vi.fn().mockImplementation(
      () => ({
        runBatch: mocks.runBatch,
      }),
    ),
  }),
);

import {
  runGraphHoleReassessment,
} from "../src/reassessment/reassessment-service.js";

const CASE_ID =
  "11111111-1111-4111-8111-111111111111";

const INVESTIGATION_ID =
  "22222222-2222-4222-8222-222222222222";

describe(
  "Phase 5B-PR1 reassessment investigation resolution",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.findFirst.mockResolvedValue({
        investigationId: INVESTIGATION_ID,
      });

      mocks.runBatch.mockResolvedValue({
        caseId: CASE_ID,
        changesProcessed: 0,
        headChangeIds: [],
        tailChangesSkipped: 0,
        cursorAdvancedTo: null,
        regionResults: [],
      });
    });

    it(
      "resolves investigationId when production path supplies null",
      async () => {
        await runGraphHoleReassessment(
          CASE_ID,
          null,
        );

        expect(
          mocks.findFirst,
        ).toHaveBeenCalledWith({
          where: {
            caseId: CASE_ID,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        expect(
          mocks.runBatch,
        ).toHaveBeenCalledWith(
          CASE_ID,
          INVESTIGATION_ID,
        );
      },
    );

    it(
      "preserves an explicitly supplied investigationId",
      async () => {
        await runGraphHoleReassessment(
          CASE_ID,
          INVESTIGATION_ID,
        );

        expect(
          mocks.findFirst,
        ).not.toHaveBeenCalled();

        expect(
          mocks.runBatch,
        ).toHaveBeenCalledWith(
          CASE_ID,
          INVESTIGATION_ID,
        );
      },
    );

    it(
      "fails closed when a case has no InvestigationRun",
      async () => {
        mocks.findFirst.mockResolvedValue(null);

        await expect(
          runGraphHoleReassessment(
            CASE_ID,
            null,
          ),
        ).rejects.toThrow(
          `No InvestigationRun found for case ${CASE_ID}`,
        );

        expect(
          mocks.runBatch,
        ).not.toHaveBeenCalled();
      },
    );
  },
);