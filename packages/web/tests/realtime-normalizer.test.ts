import { describe, it, expect } from "vitest";
import {
  eventIdentity,
  normalizeEvent,
  EventDeduplicator,
  consolidateStatus,
  runStateAction,
  evidenceSubmittedDescription,
} from "@/lib/providers/realtime/normalizer";
import type { SseEvent } from "@/lib/realtime/sse-client";
import { INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";

describe("realtime event normalization", () => {
  it("normalizes a known event, preserving canonical fields", () => {
    const raw: SseEvent = {
      id: "evt-1",
      investigationId: "",
      action: "EVIDENCE_INGESTED",
      targetType: "EVIDENCE",
      targetId: "ev-1",
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const out = normalizeEvent(raw, INVESTIGATION_ID);
    expect(out.id).toBe("evt-1");
    expect(out.action).toBe("EVIDENCE_INGESTED");
    expect(out.targetId).toBe("ev-1");
    expect(out.investigationId).toBe(INVESTIGATION_ID);
  });

  it("fills a missing investigation id from the provided context", () => {
    const raw: SseEvent = { id: "evt-2", investigationId: "" };
    const out = normalizeEvent(raw, INVESTIGATION_ID);
    expect(out.investigationId).toBe(INVESTIGATION_ID);
  });

  it("derives a deterministic identity from action+target+timestamp when id is absent", () => {
    const base: SseEvent = {
      investigationId: INVESTIGATION_ID,
      action: "ENTITY_CREATED",
      targetId: "ent-1",
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const a = eventIdentity(base);
    const b = eventIdentity({ ...base, targetId: "ent-9" });
    expect(a).not.toBe(b);
    // Stable across calls (deterministic, not Date.now()).
    expect(a).toBe(eventIdentity(base));
  });
});

describe("realtime event dedupe", () => {
  it("accepts unique events and rejects duplicates", () => {
    const dedupe = new EventDeduplicator();
    const ev: SseEvent = { id: "evt-1", investigationId: INVESTIGATION_ID, action: "X" };
    expect(dedupe.accept(ev)).toBe(true);
    expect(dedupe.accept({ ...ev })).toBe(false);
  });

  it("dedupes by signature when no canonical id is present", () => {
    const dedupe = new EventDeduplicator();
    const a: SseEvent = { investigationId: INVESTIGATION_ID, action: "X", targetId: "t", timestamp: "2024-01-01" };
    expect(dedupe.accept(a)).toBe(true);
    expect(dedupe.accept({ ...a })).toBe(false);
  });

  it("respects the bounded window and can be reset", () => {
    const dedupe = new EventDeduplicator(3);
    const events: SseEvent[] = [1, 2, 3, 4].map((n) => ({
      id: `evt-${n}`,
      investigationId: INVESTIGATION_ID,
    }));
    events.forEach((e) => expect(dedupe.accept(e)).toBe(true));
    // evt-1 evicted (window 3), so it is accepted again.
    expect(dedupe.accept({ id: "evt-1", investigationId: INVESTIGATION_ID })).toBe(true);
    dedupe.reset();
    expect(dedupe.size).toBe(0);
  });
});

describe("realtime status consolidation", () => {
  it("maps transport states to a single status", () => {
    expect(consolidateStatus(false, false)).toBe("disconnected");
    expect(consolidateStatus(true, false)).toBe("connected");
    expect(consolidateStatus(true, true)).toBe("error");
    expect(consolidateStatus(false, true)).toBe("error");
  });
});

describe("platform payload normalization (Prompt 2/3 live convergence)", () => {
  it("maps a run-progress frame (state/message) into action + description", () => {
    const raw: SseEvent = {
      investigationId: INVESTIGATION_ID,
      state: "INGESTING",
      message: "extracting financial records",
      timestamp: "2026-01-01T00:00:00.000Z",
      runId: "run-1",
    };
    const out = normalizeEvent(raw, INVESTIGATION_ID);
    expect(out.action).toBe("RUN_PHASE_INGESTING");
    expect(out.description).toBe("extracting financial records");
    expect(out.runId).toBe("run-1");
  });

  it("maps the CONNECTED control frame to a STREAM_CONNECTED action", () => {
    const out = normalizeEvent(
      { investigationId: INVESTIGATION_ID, type: "CONNECTED", message: "Stream initialized" },
      INVESTIGATION_ID,
    );
    expect(out.action).toBe("STREAM_CONNECTED");
    expect(out.description).toBe("Stream initialized");
  });

  it("maps the EVIDENCE_SUBMITTED control frame to a canonical evidence event", () => {
    const out = normalizeEvent(
      {
        investigationId: INVESTIGATION_ID,
        type: "EVIDENCE_SUBMITTED",
        evidenceTitle: "Bank statements",
        fileCount: 3,
        operationId: "op-5",
      },
      INVESTIGATION_ID,
    );
    expect(out.action).toBe("EVIDENCE_SUBMITTED");
    expect(out.description).toBe("Evidence submitted: Bank statements (3 file(s))");
    expect(out.targetType).toBe("EVIDENCE");
    expect(out.targetId).toBe("op-5");
  });

  it("leaves canonical-shaped events (action present) untouched", () => {
    const raw: SseEvent = {
      investigationId: INVESTIGATION_ID,
      action: "EVIDENCE_INGESTED",
      description: "Ingested ledger",
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    const out = normalizeEvent(raw, INVESTIGATION_ID);
    expect(out.action).toBe("EVIDENCE_INGESTED");
    expect(out.description).toBe("Ingested ledger");
  });

  it("leaves demo-style events untouched (deterministic seed stream parity)", () => {
    const demoStyle: SseEvent = {
      id: "evt-0001",
      investigationId: "",
      action: "EVIDENCE_INGESTED",
      actor: "sync.platform",
      targetType: "EVIDENCE",
      targetId: "ev-1",
      description: "Ingested Account 0092 ledger.",
      timestamp: "2024-05-21T08:01:00.000Z",
    };
    const out = normalizeEvent(demoStyle, INVESTIGATION_ID);
    expect(out.action).toBe("EVIDENCE_INGESTED");
    expect(out.investigationId).toBe(INVESTIGATION_ID);
  });

  it("exposes deterministic vocabulary helpers", () => {
    expect(runStateAction("ANALYZING")).toBe("RUN_PHASE_ANALYZING");
    expect(
      evidenceSubmittedDescription({
        investigationId: INVESTIGATION_ID,
        evidenceTitle: "Docs",
        fileCount: 2,
      }),
    ).toBe("Evidence submitted: Docs (2 file(s))");
  });
});

describe("PR-23 — OBSERVATION_EXTRACTED + ANALYSIS_PROGRESS frame verification", () => {
  it("normalizes an OBSERVATION_EXTRACTED frame: action, count, investigation association, targetId=evidenceId", () => {
    const out = normalizeEvent(
      {
        investigationId: "",
        type: "OBSERVATION_EXTRACTED",
        caseId: "case-1",
        evidenceId: "ev-7",
        sourceId: "src-9",
        observationCount: 3,
        observationIds: ["obs-a", "obs-b", "obs-c"],
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      INVESTIGATION_ID,
    );
    expect(out.action).toBe("OBSERVATION_EXTRACTED");
    expect(out.description).toBe("3 observations extracted");
    expect(out.targetType).toBe("OBSERVATION");
    expect(out.targetId).toBe("ev-7");
    expect(out.investigationId).toBe(INVESTIGATION_ID);
  });

  it("retains ids/count metadata after normalization (no lossy reshaping)", () => {
    const out = normalizeEvent(
      {
        investigationId: INVESTIGATION_ID,
        type: "OBSERVATION_EXTRACTED",
        evidenceId: "ev-7",
        observationCount: 2,
        observationIds: ["obs-a", "obs-b"],
      },
      INVESTIGATION_ID,
    );
    expect(out.observationCount).toBe(2);
    expect(out.observationIds).toEqual(["obs-a", "obs-b"]);
    expect(out.evidenceId).toBe("ev-7");
  });

  it("dedupes identical OBSERVATION_EXTRACTED frames after normalization (no duplication)", () => {
    const dedupe = new EventDeduplicator();
    const frame = (): SseEvent => ({
      investigationId: INVESTIGATION_ID,
      type: "OBSERVATION_EXTRACTED",
      evidenceId: "ev-7",
      observationCount: 3,
      observationIds: ["obs-a", "obs-b", "obs-c"],
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    const first = normalizeEvent(frame(), INVESTIGATION_ID);
    const second = normalizeEvent(frame(), INVESTIGATION_ID);
    expect(dedupe.accept(first)).toBe(true);
    expect(dedupe.accept(second)).toBe(false);
  });

  it("normalizes an ANALYSIS_PROGRESS frame: phase retained in action, message retained as description", () => {
    const out = normalizeEvent(
      {
        investigationId: "",
        type: "ANALYSIS_PROGRESS",
        caseId: "case-1",
        phase: "CANDIDATES_DETECTED",
        message: "Detected 3 bridge candidates",
        detail: { bridges: 3 },
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      INVESTIGATION_ID,
    );
    expect(out.action).toBe("ANALYSIS_PROGRESS_CANDIDATES_DETECTED");
    expect(out.description).toBe("Detected 3 bridge candidates");
    expect(out.phase).toBe("CANDIDATES_DETECTED");
    expect(out.investigationId).toBe(INVESTIGATION_ID);
  });

  it("handles repeated ANALYSIS_PROGRESS frames deterministically (no duplicate activity entries)", () => {
    const dedupe = new EventDeduplicator();
    const frame = (phase: string): SseEvent => ({
      investigationId: INVESTIGATION_ID,
      type: "ANALYSIS_PROGRESS",
      phase,
      message: `phase ${phase}`,
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    const started = normalizeEvent(frame("ANALYSIS_STARTED"), INVESTIGATION_ID);
    const detected = normalizeEvent(frame("CANDIDATES_DETECTED"), INVESTIGATION_ID);
    const completed = normalizeEvent(frame("ANALYSIS_COMPLETED"), INVESTIGATION_ID);
    // All distinct phases accepted.
    expect(dedupe.accept(started)).toBe(true);
    expect(dedupe.accept(detected)).toBe(true);
    expect(dedupe.accept(completed)).toBe(true);
    // The same phase re-sent (a repeated progress event) is dropped after dedupe.
    expect(dedupe.accept(normalizeEvent(frame("ANALYSIS_COMPLETED"), INVESTIGATION_ID))).toBe(false);
  });

  it("maps an ANALYSIS_PROGRESS phase to a stable, distinct action per phase", () => {
    expect(normalizeEvent({ investigationId: INVESTIGATION_ID, type: "ANALYSIS_PROGRESS", phase: "LEAD_CREATED" }).action)
      .toBe("ANALYSIS_PROGRESS_LEAD_CREATED");
    expect(normalizeEvent({ investigationId: INVESTIGATION_ID, type: "ANALYSIS_PROGRESS", phase: "ANALYSIS_STARTED" }).action)
      .toBe("ANALYSIS_PROGRESS_ANALYSIS_STARTED");
  });

  it("handles a malformed/unknown frame without inventing vocabulary", () => {
    const out = normalizeEvent(
      { investigationId: INVESTIGATION_ID, type: "UNKNOWN_THING", foo: 1 },
      INVESTIGATION_ID,
    );
    expect(out.action).toBeUndefined();
    // investigation association still backfilled.
    expect(out.investigationId).toBe(INVESTIGATION_ID);
  });
});
