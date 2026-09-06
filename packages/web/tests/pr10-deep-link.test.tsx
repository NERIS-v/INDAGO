// ============================================================================
// PR-10 §49 — Deep-link integrity (PR-8 deep-dive bridges + ?focus works)
//
// Every deep-dive href is built through the central URL helpers so ?caseId= is
// NEVER dropped, and availability follows the RESOLVED context data — a bridge
// whose slice is null reports available:false with an honest note, never a
// fabricated enabled link. PR-10 also locks the shell path: an initial focus
// deep link must actually select/center the owning graph node.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { WorkspaceBoundary } from "@/lib/providers/workspace/boundary";
import { GraphPanel } from "@/components/graph/graph-panel";
import {
  relationDeepDiveLinks,
  entityDeepDiveLinks,
  type DeepDiveSource,
} from "@/lib/context/deep-dive-links";
import type {
  EntityContextDetails,
  RelationContextDetails,
} from "@/lib/context/context-details";
import { DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import {
  CASE_ID,
  INVESTIGATION_ID,
  ENT_VICTOR,
  GN_VICTOR,
} from "@/lib/providers/demo/demo-fixtures/lookup";

const source: DeepDiveSource = {
  investigationId: INVESTIGATION_ID,
  caseId: CASE_ID,
};

const entityDetails = (present: boolean): EntityContextDetails =>
  ({
    status: "resolved",
    kind: "entity",
    id: ENT_VICTOR,
    entity: { id: ENT_VICTOR },
    observations: present ? [] : null,
    relations: present ? [] : null,
    evidence: present ? [] : null,
    hypotheses: present ? [] : null,
    openGaps: present ? [] : null,
    activeLeads: present ? [] : null,
    contradictions: present ? [] : null,
    foreignOverlays: present ? [] : null,
  }) as unknown as EntityContextDetails;

const relationDetails = (present: boolean): RelationContextDetails =>
  ({
    status: "resolved",
    kind: "relation",
    relation: { sourceEntityId: ENT_VICTOR },
    sourceName: null,
    targetName: null,
    linkedObservations: present ? [] : null,
    linkedHypotheses: present ? [] : null,
  }) as unknown as RelationContextDetails;

describe("PR-10 §49 — relation deep-dive links", () => {
  it("never drops ?caseId= and always reuses the central URL helpers", () => {
    const links = relationDeepDiveLinks(source, relationDetails(true));
    for (const link of links) {
      expect(link.href.startsWith(`/investigations/${INVESTIGATION_ID}`)).toBe(true);
      expect(link.href).toContain("caseId=" + encodeURIComponent(CASE_ID));
    }
  });

  it("the network bridge focuses the relation's source entity", () => {
    const links = relationDeepDiveLinks(source, relationDetails(true));
    const network = links.find((l) => l.id === "network")!;
    expect(network.available).toBe(true);
    expect(network.href).toBe(
      `/investigations/${INVESTIGATION_ID}/graph?caseId=${CASE_ID}&focus=${encodeURIComponent(ENT_VICTOR)}`,
    );
    expect(network.label).toBe("Network");
  });

  it("honest unavailability: a null slice yields note + available:false", () => {
    const links = relationDeepDiveLinks(source, relationDetails(false));
    const observations = links.find((l) => l.id === "observations")!;
    const hypotheses = links.find((l) => l.id === "hypotheses")!;
    expect(observations.available).toBe(false);
    expect(observations.note).toBe("Observations are not exposed in this data mode.");
    expect(hypotheses.available).toBe(false);
    expect(hypotheses.note).toBe("Hypotheses are not exposed in this data mode.");
    // Page-level destinations stay available regardless of slices.
    for (const pageId of ["evidence", "leads", "gaps", "review", "robustness", "ledger", "cross-case"]) {
      expect(links.find((l) => l.id === pageId)!.available).toBe(true);
    }
  });

  it("a present slice flips the bridge on without a note", () => {
    const links = relationDeepDiveLinks(source, relationDetails(true));
    const observations = links.find((l) => l.id === "observations")!;
    expect(observations.available).toBe(true);
    expect(observations.note).toBeUndefined();
    expect(observations.href).toBe(
      `/investigations/${INVESTIGATION_ID}/observations?caseId=${CASE_ID}&entity=${encodeURIComponent(ENT_VICTOR)}`,
    );
  });
});

describe("PR-10 §49 — entity deep-dive links", () => {
  it("never drops ?caseId= and carries the entity focus", () => {
    const links = entityDeepDiveLinks(source, entityDetails(true));
    for (const link of links) {
      expect(link.href.startsWith(`/investigations/${INVESTIGATION_ID}`)).toBe(true);
      expect(link.href).toContain("caseId=" + encodeURIComponent(CASE_ID));
    }
    const network = links.find((l) => l.id === "network")!;
    expect(network.available).toBe(true);
    expect(network.href).toBe(
      `/investigations/${INVESTIGATION_ID}/graph?caseId=${CASE_ID}&focus=${encodeURIComponent(ENT_VICTOR)}`,
    );
  });

  it("each null-bound slice reports its own honest note", () => {
    const links = entityDeepDiveLinks(source, entityDetails(false));
    const expectations: Record<string, string> = {
      observations: "Observations are not exposed in this data mode.",
      evidence: "Evidence is not exposed in this data mode.",
      hypotheses: "Hypotheses are not exposed in this data mode.",
      leads: "Leads are not exposed in this data mode.",
      gaps: "Gaps are not exposed in this data mode.",
      "cross-case": "Cross-case data is not exposed in this data mode.",
    };
    for (const [id, note] of Object.entries(expectations)) {
      const link = links.find((l) => l.id === id)!;
      expect(link.available).toBe(false);
      expect(link.note).toBe(note);
    }
    for (const pageId of ["review", "robustness", "ledger"]) {
      expect(links.find((l) => l.id === pageId)!.available).toBe(true);
    }
  });

  it("a fully present entity flips every object-bound bridge on", () => {
    const links = entityDeepDiveLinks(source, entityDetails(true));
    for (const link of links) expect(link.available).toBe(true);
    for (const link of links) expect(link.note).toBeUndefined();
  });

  it("URL-encodes the entity id so focus never carries a broken query", () => {
    const weirdId = "victor & sons/inc";
    const details = entityDetails(true);
    const withWeirdId = {
      ...details,
      id: weirdId,
      entity: { id: weirdId },
    } as unknown as EntityContextDetails;
    const network = entityDeepDiveLinks(source, withWeirdId).find((l) => l.id === "network")!;
    expect(network.href).toBe(
      `/investigations/${INVESTIGATION_ID}/graph?caseId=${CASE_ID}&focus=${encodeURIComponent(weirdId)}`,
    );
    expect(network.href).not.toContain(weirdId);
  });
});

// ---------------------------------------------------------------------------
// Shell path: an initial ?focus deep link selects the owning graph node
// ---------------------------------------------------------------------------

const lanes = vi.hoisted(() => ({
  pathnameRef: { current: "/investigations/i-1/graph" },
  searchParamsRef: { current: new URLSearchParams() },
  paramsRef: { current: { id: "i-1" } },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => lanes.pathnameRef.current,
  useSearchParams: () => lanes.searchParamsRef.current,
  useParams: () => lanes.paramsRef.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const mediaPrefs = vi.hoisted(() => ({ reduce: false }));

function stubPlatform() {
  class ResizeObserverStub implements ResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(target: Element) {
      const entry = {
        target,
        contentRect: {
          x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}),
        },
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      } as unknown as ResizeObserverEntry;
      this.cb([entry], this);
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: mediaPrefs.reduce,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  );
}

const PREV_ENV = {
  [DATA_MODE_ENV]: process.env.NEXT_PUBLIC_DATA_MODE,
  [DEMO_CASE_ID_ENV]: process.env.NEXT_PUBLIC_DEMO_CASE_ID,
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_DATA_MODE = "demo";
  process.env.NEXT_PUBLIC_DEMO_CASE_ID = CASE_ID;
  mediaPrefs.reduce = false;
  lanes.pathnameRef.current = "/investigations/i-1/graph";
  lanes.searchParamsRef.current = new URLSearchParams({ caseId: CASE_ID });
  lanes.paramsRef.current = { id: INVESTIGATION_ID };
  stubPlatform();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  process.env.NEXT_PUBLIC_DATA_MODE = PREV_ENV[DATA_MODE_ENV];
  process.env.NEXT_PUBLIC_DEMO_CASE_ID = PREV_ENV[DEMO_CASE_ID_ENV];
});

describe("PR-10 §49 — ?focus deep link selects the owning graph node", () => {
  it("applies the initial focus node and presses it in the canvas", async () => {
    const utils = render(
      <WorkspaceBoundary>
        <GraphPanel activeTimeRange={null} initialFocusNodeId={GN_VICTOR} />
      </WorkspaceBoundary>,
    );
    await waitFor(() => {
      const target = utils.container.querySelector(
        `circle[role='button'][data-nodeid='${GN_VICTOR}']`,
      );
      expect(target).not.toBeNull();
    });
    await waitFor(() => {
      const target = utils.container.querySelector(
        `circle[role='button'][data-nodeid='${GN_VICTOR}']`,
      );
      expect(target?.getAttribute("aria-pressed")).toBe("true");
    });
  });
});