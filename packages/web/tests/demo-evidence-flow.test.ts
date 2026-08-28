import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DemoEvidenceProvider, DemoInvestigationProvider } from "@/lib/providers/demo/providers";
import { createDemoWorkspaceState } from "@/lib/providers/demo/state";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import {
  addDemoSessionEvidence,
  listDemoSessionEvidence,
  resetDemoSession,
} from "@/lib/providers/demo/session";
import { CASE_ID, INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";
import { demoFixtures } from "@/lib/providers/demo/demo-fixtures";
import type { DataModeConfig } from "@/lib/providers/types";
import type { Evidence, UploadedFileReference } from "@indago/contracts";

// Near-instant simulated latency so the flow runs fast but stays deterministic.
const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

function buildProviderSet() {
  const state = createDemoWorkspaceState("demo-flow:test");
  return {
    state,
    evidence: new DemoEvidenceProvider(state, config),
    investigations: new DemoInvestigationProvider(state, config),
  };
}

describe("F-PR3 §40 demo evidence flow", () => {
  beforeEach(() => {
    resetDemoSession();
  });
  afterEach(() => {
    resetDemoSession();
  });

  it("submits evidence during intake and the session registry retains it across a fresh workspace bundle", async () => {
    const { evidence, investigations } = buildProviderSet();

    // 1. Demo mode: resolve the deterministic investigation for the demo case.
    const list = await investigations.listByCase(CASE_ID, { pageSize: 1 });
    const investigationId = list.items[0]?.id ?? INVESTIGATION_ID;
    expect(investigationId).toBe(INVESTIGATION_ID);
    await investigations.start(CASE_ID, investigationId);

    // 2. Prepare upload (synthesizes deterministic references, no network).
    const file = new File([new Uint8Array(4096)], "ledger.csv", { type: "text/csv" });
    const refs = await evidence.prepareUpload(investigationId, [file]);
    expect(refs).toHaveLength(1);
    expect(refs[0].fileName).toBe("ledger.csv");
    expect(refs[0].fileKey.startsWith("demo:")).toBe(true);

    // 3. Submit evidence through the provider.
    const response = await evidence.submit(investigationId, {
      sourceName: "Registry export",
      evidenceType: "FINANCIAL",
      evidenceTitle: "Ledger rows for shell",
      files: refs satisfies UploadedFileReference[],
    });
    expect(response.fileCount).toBe(1);
    expect(response.jobsEnqueued).toBe(1);

    // 4. Session registry now contains the submitted evidence.
    const submitted = listDemoSessionEvidence(investigationId);
    expect(submitted).toHaveLength(1);
    expect(submitted[0].title).toBe("Ledger rows for shell");
    expect(submitted[0].caseId).toBe(CASE_ID);
    expect(submitted[0].artifactIds.length).toBe(1);
    // The registry holds canonical Evidence records only — never File objects/bytes.
    expect(submitted[0]).not.toHaveProperty("bytes");

    // 5. Simulate navigation: a FRESH provider bundle lists fixture + submitted.
    const workspace = buildProviderSet().evidence;
    const page = await workspace.listByInvestigation(investigationId, { pageSize: 100 });
    const titles = page.items.map((e: Evidence) => e.title);
    const fixtureTitles = [...demoFixtures.evidence].map((e) => e.title);
    for (const title of fixtureTitles) {
      expect(titles).toContain(title);
    }
    expect(titles).toContain("Ledger rows for shell");
  });

  it("reset clears submitted evidence so a fresh workspace sees only fixtures", async () => {
    const { evidence, investigations } = buildProviderSet();
    const list = await investigations.listByCase(CASE_ID, { pageSize: 1 });
    const investigationId = list.items[0]?.id ?? INVESTIGATION_ID;

    const refs = await evidence.prepareUpload(investigationId, [
      new File([new Uint8Array(100)], "doc.pdf", { type: "application/pdf" }),
    ]);
    await evidence.submit(investigationId, {
      sourceName: "Source A",
      evidenceType: "DOCUMENT",
      evidenceTitle: "Submitted doc",
      files: refs,
    });
    expect(listDemoSessionEvidence(investigationId)).toHaveLength(1);

    resetDemoSession();
    expect(listDemoSessionEvidence(investigationId)).toHaveLength(0);

    const after = await buildProviderSet().evidence.listByInvestigation(investigationId, {
      pageSize: 100,
    });
    const titles = after.items.map((e: Evidence) => e.title);
    expect(titles).not.toContain("Submitted doc");
    expect(titles.length).toBe(demoFixtures.evidence.length);
  });

  it("the demo provider never stores raw File objects in the session registry", async () => {
    const { evidence, investigations } = buildProviderSet();
    const list = await investigations.listByCase(CASE_ID, { pageSize: 1 });
    const investigationId = list.items[0]?.id ?? INVESTIGATION_ID;
    const file = new File([new Uint8Array(64)], "x.txt", { type: "text/plain" });
    const refs = await evidence.prepareUpload(investigationId, [file]);
    await evidence.submit(investigationId, {
      sourceName: "S",
      evidenceType: "DOCUMENT",
      evidenceTitle: "T",
      files: refs,
    });
    const stored = listDemoSessionEvidence(investigationId)[0];
    const json = JSON.stringify(stored);
    expect(json).not.toContain("data:application/");
    expect(json).not.toContain(`"name":"x.txt"`);
    expect(stored.artifactIds.length).toBe(1);
  });
});
