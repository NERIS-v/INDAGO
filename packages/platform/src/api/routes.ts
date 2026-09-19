import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "../db/prisma.js";
import { investigationQueue } from "../queue/orchestrator.js";
import { logAuditEvent } from "../audit/logger.js";
import { streamEventsHandler } from "../realtime/sse.js";
import { realtimeEvents } from "../realtime/sse.js";
import { observationStore } from "../persistence/observation-store.js";
import { caseStore } from "../persistence/case-store.js";
import { entityMentionStore } from "../persistence/entity-mention-store.js";
import { entityHypothesisStore } from "../persistence/entity-hypothesis-store.js";
import { entityStore } from "../persistence/entity-store.js";
import { relationHypothesisStore } from "../persistence/relation-hypothesis-store.js";
import { ingestionStore } from "../persistence/ingestion-store.js";
import {
  finalizeRunIfComplete,
  checkInvestigationAnalysisComplete,
} from "../queue/run-completion.js";
import { relationStore } from "../persistence/relation-store.js";
import { graphRuntime } from "../relations/graph-runtime.js";
import { graphProjectionService, normalizeBuiltGraph } from "../relations/graph-version-service.js";
import { graphVersionStore } from "../persistence/graph-version-store.js";
import { materializeCanonicalEntityFromAcceptedHypothesis, EntityMaterializationError } from "../entities/entity-materialization.js";
import { leadRuntime } from "../leads/lead-runtime.js";
import { leadStore, IllegalLeadStatusTransitionError, LeadNotFoundError } from "../leads/lead-store.js";
import { crossCaseDiscoveryService } from "../leads/cross-case-discovery.js";
import {
  runStateMachine,
  RunNotFoundError,
  RunNotPausedError,
  RunNotInReviewError,
  RunAlreadyTerminalError,
  IllegalRunStateTransitionError,
} from "../execution/run-state-machine.js";
import {
  materializeCanonicalRelationFromAcceptedHypothesis,
  rejectRelationHypothesis,
  reverseRelationHypothesis,
  RelationMaterializationError,
} from "../relations/relation-materialization.js";
import { requireAuth, requireRole, requireCaseAccess, verifyCaseAccess } from "./auth.js";
import {
  EvidenceSubmissionRequestSchema,
  SourceCatalogSchema,
  CaseIdSchema,
  ProjectedGraphSchema,
  BridgeCandidateSchema,
  TemporalBurstCandidateSchema,
  CommunityCandidateSchema,
  ConnectingPathCandidateSchema,
  LeadStatusSchema,
  AttachLeadEvidenceRequestSchema,
  CrossCaseMatchSchema,
} from "@indago/contracts";

export const apiRouter: Router = Router();

// ============================================================================
// Graph query-parameter BOUNDS + validation (M-A10 Fix 6)
//
// The Graphology projection caps are enforced here at the HTTP boundary so a
// malformed / NaN / decimal / negative / oversized value NEVER reaches the
// runtime unchecked. Every bound mirrors the graphology-projection caps:
//   - hops      ∈ [0, 4]          (integer; absent → false → runtime default)
//   - maxPaths  ∈ [1, 1000]       (integer; absent → runtime default ≤ 1000)
//   - maxResults∈ [1, 1000]       (integer; absent → runtime default ≤ 1000)
//
// `strictInt` rejects non-numeric strings, floats, and out-of-range values;
// it does NOT accept "Infinity"/"NaN" because Number coercion of those yields
// a non-finite number which fails the integer + range guards below.
// ============================================================================
const GRAPH_HOPS_MAX = 4;
const GRAPH_LIMIT_MAX = 1000;

type GraphLimitResult =
  | { readonly ok: true; readonly value: number | undefined }
  | { readonly ok: false; readonly error: string };

function parseBoundedInt(
  raw: unknown,
  min: number,
  max: number,
  name: string,
): GraphLimitResult {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    // Absent / empty → caller falls through to the runtime default.
    return { ok: true, value: undefined };
  }
  const s = String(raw).trim();
  const parsed = Number(s);
  if (!Number.isInteger(parsed) || !Number.isFinite(parsed)) {
    return { ok: false, error: `${name} must be an integer` };
  }
  if (parsed < min || parsed > max) {
    return { ok: false, error: `${name} must be between ${min} and ${max}` };
  }
  return { ok: true, value: parsed };
}

export function parseGraphQueryParam(
  raw: unknown,
  name: "hops" | "maxPaths" | "maxResults",
): GraphLimitResult {
  const bounds = {
    hops: { min: 0, max: GRAPH_HOPS_MAX },
    maxPaths: { min: 1, max: GRAPH_LIMIT_MAX },
    maxResults: { min: 1, max: GRAPH_LIMIT_MAX },
  } as const;
  const { min, max } = bounds[name];
  return parseBoundedInt(raw, min, max, name);
}


// Schema for the incoming webhook/API request
//
// caseId MUST be a canonical CaseIdSchema UUID. The canonical case identity
// is persisted once on InvestigationRun.caseId and flows verbatim through the
// queue into the worker. No random/fabricated caseId is ever generated.
const StartInvestigationSchema = z.object({
  caseId: CaseIdSchema,
  investigationId: z.string().uuid(),
});

// 1. Lock down the Realtime Stream
//
// The SSE stream is case-scoped exactly like the GET status endpoint:
//   authenticate → resolve investigation → canonical run.caseId →
//   verifyCaseAccess(user, run.caseId)
// The client NEVER supplies the case boundary; the persisted run row is the
// only source of truth. Unauthenticated, nonexistent, and cross-case
// investigations are rejected before the stream handler subscribes.
apiRouter.get(
  "/investigations/:investigationId/stream",
  requireAuth,
  async (req, res, next) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }

      const run = await db.investigationRun.findUnique({
        where: { investigationId },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }

      const caseId = run.caseId;
      if (!caseId) {
        return res.status(400).json({ error: "Investigation has no associated case" });
      }

      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      // Authorized: carry the canonical identity for the stream handler.
      res.locals.caseId = caseId;
      res.locals.runId = run.id;
      return next();
    } catch (error: unknown) {
      console.error("Failed to authorize realtime stream:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  streamEventsHandler
);

// 1a. List Cases (case catalogue / dashboard)
apiRouter.get(
  "/cases",
  requireAuth,
  async (req, res) => {
    try {
      let cases = await caseStore.listCases();
      // Case-scoped catalogue in EVERY environment: the authenticated
      // principal's allowedCases drive the listing (fail-closed, consistent
      // with verifyCaseAccess now enforcing the allow-list in all modes — the
      // dev demo principal is scoped to DEMO_ALLOWED_CASES + explicit
      // INDAGO_DEV_ALLOWED_CASES grants).
      const allowed = new Set(req.user?.allowedCases ?? []);
      cases = cases.filter((c) => allowed.has(c.id));
      return res.status(200).json({
        count: cases.length,
        cases,
      });
    } catch (error: unknown) {
      console.error("Failed to list cases:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1a/i. Delete Case (case catalogue). Hard-remove the boundary and every
// durable row scoped to it; refuses while an active investigation run exists
// (409) so the orchestrator never orphans in-flight work. Deleting unblocks the
// whole case — this is intended destructive tooling for INV/ADMIN roles only.
apiRouter.delete(
  "/cases/:caseId",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  async (req, res) => {
    try {
      const caseId = String(req.params.caseId);
      if (!CaseIdSchema.safeParse(caseId).success) {
        return res.status(400).json({ error: "Invalid case ID" });
      }
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const result = await caseStore.deleteCase(caseId);
      if (result.outcome === "not_found") {
        return res.status(404).json({ error: "Case not found" });
      }
      if (result.outcome === "active_runs") {
        return res.status(409).json({
          error: "Case has active investigations; wait for them to finish",
        });
      }
      return res.status(200).json({ deleted: true, caseId });
    } catch (error: unknown) {
      console.error("Failed to delete case:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1b. Get Investigation Status
apiRouter.get(
  "/investigations/:investigationId",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      const caseId = String(req.query.caseId || "");

      if (!caseId) {
        return res.status(400).json({ error: "caseId query parameter is required" });
      }

      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });

      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }

      // 4b. Cross-check: the persisted run MUST belong to the requested case boundary.
      //     Catches any caseId fabrication / cross-case data leakage.
      if (run.caseId !== caseId) {
        return res.status(403).json({
          error: `Security Violation: Investigation ${investigationId} does not belong to case boundary ${caseId}`,
        });
      }

      return res.status(200).json({
        id: run.id,
        investigationId: run.investigationId,
        status: run.status,
        state: run.state,
        currentStage: run.currentStage,
        error: run.error,
        retryCount: run.retryCount,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
      });
    } catch (error: unknown) {
      console.error("Failed to get investigation:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1c. List Observations (M-A06)
//
// Server-side caseId derivation (edit #5): the client NEVER supplies the case
// boundary. Auth → latest run → authoritative run.caseId → case-access check →
// scoped read. Returns full ObservationSchema records for the investigation.
apiRouter.get(
  "/investigations/:investigationId/observations",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }

      // The persisted run is the ONLY source of truth for the case boundary —
      // never trust a client-supplied caseId here.
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }

      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const observations = await observationStore.listObservations({
        investigationId,
        caseId,
      });

      return res.status(200).json({
        investigationId,
        caseId,
        count: observations.length,
        observations,
      });
    } catch (error: unknown) {
      console.error("Failed to list observations:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1d. List Evidence (M-A06)
//
// Mirrors the observations seam: auth → latest run → authoritative run.caseId →
// case-access check → scoped read. Returns the documented EvidenceProjection
// shape — the platform persists a narrower Evidence row than the canonical
// EvidenceSchema and refuses to fabricate the missing fields.
apiRouter.get(
  "/investigations/:investigationId/evidence",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }

      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }

      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const evidence = await observationStore.listEvidenceByInvestigation({
        investigationId,
        caseId,
      });

      return res.status(200).json({
        investigationId,
        caseId,
        count: evidence.length,
        evidence,
      });
    } catch (error: unknown) {
      console.error("Failed to list evidence:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1e. List Entity Hypotheses (M-A09) — the reviewable candidate-identity
// universe before any canonical-entity decision is made.
apiRouter.get(
  "/investigations/:investigationId/entity-hypotheses",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }

      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const hypotheses = await entityHypothesisStore.listByCase(caseId, {
        investigationId,
      });
      return res.status(200).json({
        investigationId,
        caseId,
        count: hypotheses.length,
        hypotheses,
      });
    } catch (error: unknown) {
      console.error("Failed to list entity hypotheses:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1f. Accept an Entity Hypothesis → materialize a canonical Entity (M-A09.5).
//
// This is the SMALLEST explicit authority/identity-decision boundary that
// turns a PROPOSED hypothesis into a durable canonical Entity — the
// prerequisite M-A10 relation resolution consumes. Deterministic identity,
// case-scoped, refuse-repeatable:
//   - Only a PROPOSED hypothesis in this case may be accepted.
//   - A retry that already ACCEPTED/rejected/reversed is refused (never
//     clobbered) — the caller sees the current durable status.
apiRouter.post(
  "/investigations/:investigationId/entity-hypotheses/:hypothesisId/accept",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      const hypothesisId = String(req.params.hypothesisId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }

      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      let result: {
        entityId: string;
        hypothesis: import("@indago/contracts").EntityHypothesis;
        materialized: boolean;
        reused: boolean;
      };
      try {
        result = await materializeCanonicalEntityFromAcceptedHypothesis({
          caseId,
          investigationId,
          hypothesisId,
          actor: req.user!.id,
        });
      } catch (cause) {
        if (cause instanceof EntityMaterializationError) {
          if (cause.code === "HYPOTHESIS_NOT_FOUND") {
            return res.status(404).json({ error: "Entity hypothesis not found" });
          }
          return res.status(409).json({
            error: "Entity hypothesis cannot be accepted",
            code: cause.code,
            detail: cause.message,
          });
        }
        throw cause;
      }

      await logAuditEvent({
        investigationId,
        action: "ENTITY_HYPOTHESIS_ACCEPTED",
        actor: req.user!.id,
        targetType: "ENTITY_HYPOTHESIS",
        targetId: hypothesisId,
        description: `Accepted entity hypothesis ${hypothesisId}; materialized canonical entity ${result.entityId} (case ${caseId})`,
      });
      if (result.materialized && !result.reused) {
        await logAuditEvent({
          investigationId,
          action: "ENTITY_CREATED",
          actor: req.user!.id,
          targetType: "ENTITY",
          targetId: result.entityId,
          description: `Created canonical entity ${result.entityId} (case ${caseId}) from accepted hypothesis ${hypothesisId}`,
        });
      }

      return res.status(200).json({
        entityId: result.entityId,
        hypothesisId,
        status: result.hypothesis.status,
        materialized: result.materialized,
        reusedExisting: result.reused,
      });
    } catch (error: unknown) {
      console.error("Failed to accept entity hypothesis:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1g. List Relation Hypotheses (M-A10) — the reversible relationship
// propositions over canonical entities, source-grounded and PostgreSQL-backed.
apiRouter.get(
  "/investigations/:investigationId/relations",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }

      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const relations = await relationHypothesisStore.listByCase(caseId, {
        investigationId,
      });
      return res.status(200).json({
        investigationId,
        caseId,
        count: relations.length,
        relations,
      });
    } catch (error: unknown) {
      console.error("Failed to list relations:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1g-2. List Canonical Relations (M-A10 relation authority output) — the
// ACCEPTED, materialized relations that the Graphology projection consumes.
apiRouter.get(
  "/investigations/:investigationId/canonical-relations",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }
      const relations = await relationStore.listActiveByCase(caseId, {
        investigationId,
      });
      return res.status(200).json({
        investigationId,
        caseId,
        count: relations.length,
        relations,
      });
    } catch (error: unknown) {
      console.error("Failed to list canonical relations:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1g-2b. Graph Projection (M-A10) — the DERIVED Graphology graph for the case,
// rebuilt on demand from canonical entities + ACTIVE canonical relations.
// Case-isolated (server-side caseId) and bounded by graphology-projection caps.
// M-A13: serializes to the canonical ProjectedGraph response contract (node/edge
// objects + explicit truncation metadata), validated at this boundary.
apiRouter.get(
  "/investigations/:investigationId/graph",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const view = await graphRuntime.graph({ investigationId, caseId });
      const snap = normalizeBuiltGraph(view.graph, caseId, view);
      const contract = ProjectedGraphSchema.safeParse(snap);
      if (!contract.success) {
        console.error("Projected graph contract violation:", contract.error.issues);
        return res.status(500).json({
          error: "Projected graph response failed contract validation",
        });
      }
      return res.status(200).json({
        investigationId,
        caseId,
        nodeCount: contract.data.nodeCount,
        edgeCount: contract.data.edgeCount,
        graph: contract.data,
      });
    } catch (error: unknown) {
      console.error("Failed to serve case graph:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1g-2c. Bounded N-hop Traversal (M-A10) from a canonical entity, case-isolated.
apiRouter.get(
  "/investigations/:investigationId/graph/traversal",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      const startEntityId = String(req.query.startEntityId || "");
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      if (!startEntityId) {
        return res.status(400).json({ error: "startEntityId query parameter is required" });
      }
      if (!z.string().uuid().safeParse(startEntityId).success) {
        return res.status(400).json({ error: "startEntityId must be a valid UUID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const hopsParam = req.query.hops;
      const maxPathsParam = req.query.maxPaths;
      const hopsResult = parseGraphQueryParam(hopsParam, "hops");
      const maxPathsResult = parseGraphQueryParam(maxPathsParam, "maxPaths");
      if (!hopsResult.ok) {
        return res.status(400).json({ error: hopsResult.error });
      }
      if (!maxPathsResult.ok) {
        return res.status(400).json({ error: maxPathsResult.error });
      }

      const paths = await graphRuntime.traversal(
        { investigationId, caseId },
        startEntityId,
        hopsResult.value,
        maxPathsResult.value,
      );
      return res.status(200).json({
        investigationId,
        caseId,
        startEntityId,
        pathCount: paths.length,
        paths,
      });
    } catch (error: unknown) {
      console.error("Failed to serve case traversal:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1g-2d. Degree Centrality (M-A10) over the case's ACTIVE canonical relations.
apiRouter.get(
  "/investigations/:investigationId/graph/centrality",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const maxResultsParam = req.query.maxResults;
      const maxResultsResult = parseGraphQueryParam(maxResultsParam, "maxResults");
      if (!maxResultsResult.ok) {
        return res.status(400).json({ error: maxResultsResult.error });
      }
      const centrality = await graphRuntime.centrality(
        { investigationId, caseId },
        maxResultsResult.value,
      );
      return res.status(200).json({
        investigationId,
        caseId,
        centrality,
      });
    } catch (error: unknown) {
      console.error("Failed to serve case centrality:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1g-2e. Community Detection (M-A10) — deterministic Louvain on the case's
// undirected accepted-relation derivative.
apiRouter.get(
  "/investigations/:investigationId/graph/communities",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const communities = await graphRuntime.communities({ investigationId, caseId });
      return res.status(200).json({
        investigationId,
        caseId,
        communityCount: communities.length,
        communities,
      });
    } catch (error: unknown) {
      console.error("Failed to serve case communities:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1g-2f. P4 Bridge/Connector Candidates — edges whose removal would disconnect
// the case graph. Structural signal only (never criminal relevance).
apiRouter.get(
  "/investigations/:investigationId/graph/bridges",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const maxResultsParam = req.query.maxResults;
      const maxResultsResult = parseGraphQueryParam(maxResultsParam, "maxResults");
      if (!maxResultsResult.ok) {
        return res.status(400).json({ error: maxResultsResult.error });
      }

      const bridges = await graphRuntime.bridgeCandidates(
        { investigationId, caseId },
        maxResultsResult.value,
      );
      const contract = z.array(BridgeCandidateSchema).safeParse(bridges);
      if (!contract.success) {
        console.error("Bridge candidate contract violation:", contract.error.issues);
        return res.status(500).json({ error: "Bridge candidate response failed contract validation" });
      }
      return res.status(200).json({
        investigationId,
        caseId,
        bridgeCount: contract.data.length,
        bridges: contract.data,
      });
    } catch (error: unknown) {
      console.error("Failed to serve bridge candidates:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1g-2g. P4 Temporal Burst Candidates — entities whose incident relations
// cluster anomalously against their own baseline activity rate.
apiRouter.get(
  "/investigations/:investigationId/graph/bursts",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const bursts = await graphRuntime.temporalBurstCandidates({ investigationId, caseId });
      const contract = z.array(TemporalBurstCandidateSchema).safeParse(bursts);
      if (!contract.success) {
        console.error("Temporal burst contract violation:", contract.error.issues);
        return res.status(500).json({ error: "Temporal burst response failed contract validation" });
      }
      return res.status(200).json({
        investigationId,
        caseId,
        burstCount: contract.data.length,
        bursts: contract.data,
      });
    } catch (error: unknown) {
      console.error("Failed to serve temporal burst candidates:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1g-2h. P4 Community Candidates — cohesion-scored Louvain communities dense
// and large enough to be worth surfacing as an investigative signal.
apiRouter.get(
  "/investigations/:investigationId/graph/community-candidates",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const candidates = await graphRuntime.communityCandidates({ investigationId, caseId });
      const contract = z.array(CommunityCandidateSchema).safeParse(candidates);
      if (!contract.success) {
        console.error("Community candidate contract violation:", contract.error.issues);
        return res.status(500).json({ error: "Community candidate response failed contract validation" });
      }
      return res.status(200).json({
        investigationId,
        caseId,
        candidateCount: contract.data.length,
        candidates: contract.data,
      });
    } catch (error: unknown) {
      console.error("Failed to serve community candidates:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1g-2i. P4 Connecting Paths — bounded paths between two specific canonical
// entities (e.g. the endpoints of a candidate cross-case link, or two
// entities surfaced independently by separate leads).
apiRouter.get(
  "/investigations/:investigationId/graph/paths",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      const fromEntityId = String(req.query.from || "");
      const toEntityId = String(req.query.to || "");
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      if (!z.string().uuid().safeParse(fromEntityId).success) {
        return res.status(400).json({ error: "from query parameter must be a valid UUID" });
      }
      if (!z.string().uuid().safeParse(toEntityId).success) {
        return res.status(400).json({ error: "to query parameter must be a valid UUID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const hopsResult = parseGraphQueryParam(req.query.hops, "hops");
      if (!hopsResult.ok) {
        return res.status(400).json({ error: hopsResult.error });
      }

      const paths = await graphRuntime.connectingPaths(
        { investigationId, caseId },
        fromEntityId,
        toEntityId,
        hopsResult.value,
      );
      const contract = z.array(ConnectingPathCandidateSchema).safeParse(paths);
      if (!contract.success) {
        console.error("Connecting path contract violation:", contract.error.issues);
        return res.status(500).json({ error: "Connecting path response failed contract validation" });
      }
      return res.status(200).json({
        investigationId,
        caseId,
        from: fromEntityId,
        to: toEntityId,
        pathCount: contract.data.length,
        paths: contract.data,
      });
    } catch (error: unknown) {
      console.error("Failed to serve connecting paths:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1h-1. P4 — Generate structural leads (bridge/burst/community candidates -> Lead).
// Idempotent: re-running over unchanged graph state creates nothing new.
apiRouter.post(
  "/investigations/:investigationId/leads/generate",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const result = await leadRuntime.generateStructuralLeads(
        { investigationId, caseId },
        { actor: req.user.id, runId: run.id },
      );
      return res.status(200).json({
        investigationId,
        caseId,
        candidatesConsidered: result.candidatesConsidered,
        leadsCreated: result.leadsCreated.length,
        leadsAlreadyExisted: result.leadsAlreadyExisted.length,
        skipped: result.skipped,
        reviewTriggered: result.reviewTriggered,
      });
    } catch (error: unknown) {
      console.error("Failed to generate structural leads:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1h-2. P4 — List leads for a case, optionally filtered by status.
apiRouter.get(
  "/investigations/:investigationId/leads",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      let status: string | undefined;
      if (req.query.status !== undefined) {
        const statusResult = LeadStatusSchema.safeParse(req.query.status);
        if (!statusResult.success) {
          return res.status(400).json({ error: "Invalid status query parameter" });
        }
        status = statusResult.data;
      }

      const leads = await leadStore.listByCase(caseId, status ? { status: status as never } : {});
      return res.status(200).json({
        investigationId,
        caseId,
        leadCount: leads.length,
        leads,
      });
    } catch (error: unknown) {
      console.error("Failed to list leads:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1h-3. P4 — Fetch a single lead.
apiRouter.get(
  "/investigations/:investigationId/leads/:leadId",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      const leadId = String(req.params.leadId);
      if (!z.string().uuid().safeParse(investigationId).success || !z.string().uuid().safeParse(leadId).success) {
        return res.status(400).json({ error: "Invalid investigation or lead ID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const lead = await leadStore.findById(leadId, { caseId });
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      const events = await leadStore.listEvents(leadId);
      const evidence = await leadStore.listEvidence(leadId);
      return res.status(200).json({ lead, events, evidence });
    } catch (error: unknown) {
      console.error("Failed to fetch lead:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1h-4. P4 — Dedicated evidence FOR/AGAINST attach surface.
apiRouter.post(
  "/investigations/:investigationId/leads/:leadId/evidence",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      const leadId = String(req.params.leadId);
      if (!z.string().uuid().safeParse(investigationId).success || !z.string().uuid().safeParse(leadId).success) {
        return res.status(400).json({ error: "Invalid investigation or lead ID" });
      }
      const bodyResult = AttachLeadEvidenceRequestSchema.safeParse(req.body);
      if (!bodyResult.success) {
        return res.status(400).json({ error: "Invalid request body", issues: bodyResult.error.issues });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      try {
        const { lead, link, created } = await leadStore.attachEvidence(leadId, {
          caseId,
          observationId: bodyResult.data.observationId,
          verdict: bodyResult.data.verdict,
          rationale: bodyResult.data.rationale,
          actor: req.user.id,
        });
        return res.status(created ? 201 : 200).json({ lead, link, created });
      } catch (err: unknown) {
        if (err instanceof LeadNotFoundError) {
          return res.status(404).json({ error: err.message });
        }
        throw err;
      }
    } catch (error: unknown) {
      console.error("Failed to attach lead evidence:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1h-5. P4 — Lead status transitions (guarded by LEAD_STATUS_TRANSITIONS).
apiRouter.post(
  "/investigations/:investigationId/leads/:leadId/status",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      const leadId = String(req.params.leadId);
      if (!z.string().uuid().safeParse(investigationId).success || !z.string().uuid().safeParse(leadId).success) {
        return res.status(400).json({ error: "Invalid investigation or lead ID" });
      }
      const bodySchema = z.object({ toStatus: LeadStatusSchema }).strict();
      const bodyResult = bodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        return res.status(400).json({ error: "Invalid request body", issues: bodyResult.error.issues });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      try {
        const lead = await leadStore.transitionStatus(leadId, {
          caseId,
          toStatus: bodyResult.data.toStatus,
          actor: req.user.id,
        });
        return res.status(200).json({ lead });
      } catch (err: unknown) {
        if (err instanceof LeadNotFoundError) {
          return res.status(404).json({ error: err.message });
        }
        if (err instanceof IllegalLeadStatusTransitionError) {
          return res.status(409).json({ error: err.message });
        }
        throw err;
      }
    } catch (error: unknown) {
      console.error("Failed to transition lead status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1h-6. P4 — Cross-case shared-entity discovery (read-only preview, no persistence).
// Requires access to BOTH case boundaries.
apiRouter.get(
  "/investigations/:investigationId/cross-case-links",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      const targetCaseId = String(req.query.targetCaseId || "");
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      if (!z.string().uuid().safeParse(targetCaseId).success) {
        return res.status(400).json({ error: "targetCaseId query parameter must be a valid UUID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      const targetRun = await db.investigationRun.findFirst({
        where: { caseId: targetCaseId },
        orderBy: { createdAt: "desc" },
      });
      if (!targetRun) {
        return res.status(404).json({ error: "Target case not found" });
      }
      if (
        !req.user ||
        !verifyCaseAccess(req.user, caseId) ||
        !verifyCaseAccess(req.user, targetCaseId)
      ) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}/${targetCaseId}`,
        });
      }

      const matches = await crossCaseDiscoveryService.findMatches(
        { caseId, investigationId },
        { caseId: targetCaseId, investigationId: targetRun.investigationId },
      );
      const contract = z.array(CrossCaseMatchSchema).safeParse(matches);
      if (!contract.success) {
        console.error("Cross-case match contract violation:", contract.error.issues);
        return res.status(500).json({ error: "Cross-case match response failed contract validation" });
      }
      return res.status(200).json({
        caseId,
        targetCaseId,
        matchCount: contract.data.length,
        matches: contract.data,
      });
    } catch (error: unknown) {
      console.error("Failed to discover cross-case links:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1h-7. P4 — Cross-case discovery, persisted as CROSS_CASE leads under this case.
apiRouter.post(
  "/investigations/:investigationId/cross-case-links/generate",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      const targetCaseId = String(req.query.targetCaseId || "");
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      if (!z.string().uuid().safeParse(targetCaseId).success) {
        return res.status(400).json({ error: "targetCaseId query parameter must be a valid UUID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      const targetRun = await db.investigationRun.findFirst({
        where: { caseId: targetCaseId },
        orderBy: { createdAt: "desc" },
      });
      if (!targetRun) {
        return res.status(404).json({ error: "Target case not found" });
      }
      if (
        !req.user ||
        !verifyCaseAccess(req.user, caseId) ||
        !verifyCaseAccess(req.user, targetCaseId)
      ) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}/${targetCaseId}`,
        });
      }

      const result = await leadRuntime.generateCrossCaseLeads(
        { caseId, investigationId },
        { caseId: targetCaseId, investigationId: targetRun.investigationId },
        { actor: req.user.id, runId: run.id },
      );
      return res.status(200).json({
        caseId,
        targetCaseId,
        candidatesConsidered: result.candidatesConsidered,
        leadsCreated: result.leadsCreated.length,
        leadsAlreadyExisted: result.leadsAlreadyExisted.length,
        skipped: result.skipped,
        reviewTriggered: result.reviewTriggered,
      });
    } catch (error: unknown) {
      console.error("Failed to generate cross-case leads:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1h-8. P4-PR3 — Human-invoked pause. Freezes execution status without
// disturbing the pipeline stage, so resume() returns to the same place.
apiRouter.post(
  "/investigations/:investigationId/pause",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      const bodySchema = z.object({ reason: z.string().min(1).max(2000) }).strict();
      const bodyResult = bodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        return res.status(400).json({ error: "Invalid request body", issues: bodyResult.error.issues });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      if (!req.user || !verifyCaseAccess(req.user, run.caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${run.caseId}`,
        });
      }

      const snapshot = await runStateMachine.pause(run.id, { actor: req.user.id, reason: bodyResult.data.reason });
      return res.status(200).json({ run: snapshot });
    } catch (error: unknown) {
      if (error instanceof RunNotFoundError) {
        return res.status(404).json({ error: error.message });
      }
      if (error instanceof RunAlreadyTerminalError) {
        return res.status(409).json({ error: error.message });
      }
      console.error("Failed to pause investigation run:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1h-9. P4-PR3 — Resume a PAUSED run. This was the missing half of PAUSED:
// previously only reachable via queue/recovery.ts's circuit-breaker
// escalation, with no way back (tracker gap: "Add pause/resume behavior").
apiRouter.post(
  "/investigations/:investigationId/resume",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      if (!req.user || !verifyCaseAccess(req.user, run.caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${run.caseId}`,
        });
      }

      try {
        const snapshot = await runStateMachine.resume(run.id, { actor: req.user.id });
        return res.status(200).json({ run: snapshot });
      } catch (err: unknown) {
        if (err instanceof RunNotPausedError) {
          return res.status(409).json({ error: err.message });
        }
        if (err instanceof IllegalRunStateTransitionError) {
          return res.status(409).json({ error: err.message });
        }
        throw err;
      }
    } catch (error: unknown) {
      if (error instanceof RunNotFoundError) {
        return res.status(404).json({ error: error.message });
      }
      console.error("Failed to resume investigation run:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1h-10. P4-PR3 — Human resolution of REVIEW_REQUIRED (Phase 4 joint
// checkpoint: STRUCTURAL SIGNAL > LEAD > EVIDENCE FOR/AGAINST > HUMAN REVIEW).
// APPROVED -> COMPLETED, or NEEDS_EVIDENCE -> WAITING_FOR_EVIDENCE.
apiRouter.post(
  "/investigations/:investigationId/review/resolve",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      const bodySchema = z
        .object({
          outcome: z.enum(["APPROVED", "NEEDS_EVIDENCE"]),
          notes: z.string().max(2000).optional(),
        })
        .strict();
      const bodyResult = bodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        return res.status(400).json({ error: "Invalid request body", issues: bodyResult.error.issues });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      if (!req.user || !verifyCaseAccess(req.user, run.caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${run.caseId}`,
        });
      }

      try {
        const snapshot = await runStateMachine.resolveReview(run.id, {
          outcome: bodyResult.data.outcome,
          actor: req.user.id,
          notes: bodyResult.data.notes,
        });
        return res.status(200).json({ run: snapshot });
      } catch (err: unknown) {
        if (err instanceof RunNotInReviewError) {
          return res.status(409).json({ error: err.message });
        }
        throw err;
      }
    } catch (error: unknown) {
      if (error instanceof RunNotFoundError) {
        return res.status(404).json({ error: error.message });
      }
      console.error("Failed to resolve investigation review:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1g-3. Accept a Relation Hypothesis → materialize a canonical Relation (M-A10).
//
// The explicit relation-authority boundary. Only a PROPOSED hypothesis in this
// case may be accepted; a retry that already resolved the hypothesis is refused
// (never clobbered) and the durable status is surfaced. The canonical Relation
// is materialized durably only AFTER the hypothesis is transitioned ACCEPTED
// (durable-state-first), then the authority audit event is emitted with the
// ACTUAL canonical RelationId.
apiRouter.post(
  "/investigations/:investigationId/relation-hypotheses/:hypothesisId/accept",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      const hypothesisId = String(req.params.hypothesisId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }

      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      let result: {
        hypothesis: import("../persistence/relation-hypothesis-store.js").DurableRelationHypothesis;
        relationId: string;
        materialized: boolean;
        reused: boolean;
      };
      try {
        result = await materializeCanonicalRelationFromAcceptedHypothesis({
          caseId,
          hypothesisId,
          actor: req.user!.id,
        });
      } catch (cause) {
        if (cause instanceof RelationMaterializationError) {
          if (cause.code === "HYPOTHESIS_NOT_FOUND") {
            return res.status(404).json({ error: "Relation hypothesis not found" });
          }
          return res.status(409).json({
            error: "Relation hypothesis cannot be accepted",
            code: cause.code,
            detail: cause.message,
          });
        }
        throw cause;
      }

      await logAuditEvent({
        investigationId,
        action: "RELATION_HYPOTHESIS_ACCEPTED",
        actor: req.user!.id,
        targetType: "RELATION_HYPOTHESIS",
        targetId: hypothesisId,
        description: `Accepted relation hypothesis ${hypothesisId} (case ${caseId})`,
      });
      await logAuditEvent({
        investigationId,
        action: "RELATION_CREATED",
        actor: req.user!.id,
        targetType: "RELATION",
        targetId: result.relationId,
        description: `Accepted relation hypothesis ${hypothesisId}; materialized canonical relation ${result.relationId} (case ${caseId}, ${result.hypothesis.sourceEntityId} → ${result.hypothesis.targetEntityId}, type ${result.hypothesis.relationType})`,
      });

      return res.status(200).json({
        relationId: result.relationId,
        hypothesisId,
        status: result.hypothesis.status,
        materialized: result.materialized,
        reusedExisting: result.reused,
      });
    } catch (error: unknown) {
      console.error("Failed to accept relation hypothesis:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1g-4. Reject a Relation Hypothesis (M-A10). No canonical relation is created.
apiRouter.post(
  "/investigations/:investigationId/relation-hypotheses/:hypothesisId/reject",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      const hypothesisId = String(req.params.hypothesisId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }
      let updated!: import("../persistence/relation-hypothesis-store.js").DurableRelationHypothesis;
      try {
        updated = await rejectRelationHypothesis({ caseId, hypothesisId });
      } catch (cause) {
        if (cause instanceof RelationMaterializationError) {
          if (cause.code === "HYPOTHESIS_NOT_FOUND") {
            return res.status(404).json({ error: "Relation hypothesis not found" });
          }
          return res.status(409).json({
            error: "Relation hypothesis cannot be rejected",
            code: cause.code,
            detail: cause.message,
          });
        }
        throw cause;
      }
      await logAuditEvent({
        investigationId,
        action: "RELATION_HYPOTHESIS_REJECTED",
        actor: req.user!.id,
        targetType: "RELATION_HYPOTHESIS",
        targetId: hypothesisId,
        description: `Rejected relation hypothesis ${hypothesisId} (case ${caseId}); no canonical relation created`,
      });
      return res.status(200).json({ status: updated.status, hypothesisId });
    } catch (error: unknown) {
      console.error("Failed to reject relation hypothesis:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1g-5. Reverse a Relation Hypothesis (M-A10). ACCEPTED/REJECTED → REVERSED;
// any ACTIVE canonical relation is also flipped to REVERSED (REVERSED != MERGED).
apiRouter.post(
  "/investigations/:investigationId/relation-hypotheses/:hypothesisId/reverse",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      const hypothesisId = String(req.params.hypothesisId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }
      let updated!: import("../persistence/relation-hypothesis-store.js").DurableRelationHypothesis;
      let reverseResult!: import("../relations/relation-materialization.js").ReverseRelationResult;
      try {
        reverseResult = await reverseRelationHypothesis({ caseId, hypothesisId });
        updated = reverseResult.hypothesis;
      } catch (cause) {
        if (cause instanceof RelationMaterializationError) {
          if (cause.code === "HYPOTHESIS_NOT_FOUND") {
            return res.status(404).json({ error: "Relation hypothesis not found" });
          }
          return res.status(409).json({
            error: "Relation hypothesis cannot be reversed",
            code: cause.code,
            detail: cause.message,
          });
        }
        throw cause;
      }
      // Hypothesis-level reversal audit (authority decision on the hypothesis).
      await logAuditEvent({
        investigationId,
        action: "RELATION_HYPOTHESIS_REVERSED",
        actor: req.user!.id,
        targetType: "RELATION_HYPOTHESIS",
        targetId: hypothesisId,
        description: `Reversed relation hypothesis ${hypothesisId} (case ${caseId})`,
      });
      // Canonical-relation reversal audit — only when an ACTIVE canonical
      // relation was actually flipped (REVERSED != MERGED; history kept).
      if (reverseResult.canonicalReversed && reverseResult.canonicalRelationId) {
        await logAuditEvent({
          investigationId,
          action: "RELATION_REVERSED",
          actor: req.user!.id,
          targetType: "RELATION",
          targetId: reverseResult.canonicalRelationId,
          description: `Marked canonical relation ${reverseResult.canonicalRelationId} REVERSED (case ${caseId}) following acceptance reversal of hypothesis ${hypothesisId}`,
        });
      }
      return res.status(200).json({ status: updated.status, hypothesisId });
    } catch (error: unknown) {
      console.error("Failed to reverse relation hypothesis:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);
apiRouter.get(
  "/investigations/:investigationId/entities",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }

      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const entities = await entityStore.listByCase(caseId, { investigationId });
      // Entity mention candidates for the case (M-A07) — informational, so the
      // review surface can distinguish materialized entities from raw mentions.
      const mentions = await entityMentionStore.listByCase(caseId, {
        investigationId,
      });
      return res.status(200).json({
        investigationId,
        caseId,
        entityCount: entities.length,
        mentionCount: mentions.length,
        entities,
      });
    } catch (error: unknown) {
      console.error("Failed to list entities:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 2. Lock down the Start Investigation Endpoint
apiRouter.post(
  "/investigations/start",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  requireCaseAccess,
  async (req, res) => {
    try {
      const parsed = StartInvestigationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error });
      }

      const { caseId, investigationId } = parsed.data;

      const run = await db.investigationRun.create({
        data: {
          investigationId,
          caseId,
          status: "QUEUED",
          state: "CREATED",
          contextData: { caseId },
        }
      });

      // Case catalogue (P-09): the case boundary is provisioned the moment a
      // run is created (idempotent), so the dashboard never lags a newly seen
      // case. The authorized principal is persisted as the assignee.
      await caseStore.ensureCase(caseId, req.user!.id);

      await logAuditEvent({
        investigationId,
        action: "INVESTIGATION_OPENED",
        actor: req.user!.id,
        targetType: "INVESTIGATION_RUN",
        targetId: run.id,
        description: `Investigation run queued for case ${caseId}`
      });

      // Run-state jobs are ONLY enqueued when the legacy pipeline is enabled.
      // Otherwise the run waits in CREATED until evidence arrives and the
      // canonical @indago/ingestion path drives INGESTING → NORMALIZING.
      if (process.env.LEGACY_PIPELINE_ENABLED === "true") {
        await investigationQueue.add("investigation-pipeline", {
          runId: run.id
        });
      }

      return res.status(202).json({
        message: "Investigation queued successfully",
        runId: run.id
      });

    } catch (error: unknown) {
      console.error("Failed to start investigation:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 3. Evidence Submission Endpoint (I-PR2 boundary)
apiRouter.post(
  "/investigations/:investigationId/evidence",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);

      // 1. Resolve investigation from DB
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }

      // 2. Resolve caseId from canonical Prisma column
      const caseId = run.caseId;
      if (!caseId) {
        return res.status(400).json({ error: "Investigation has no associated case" });
      }

      // 3. Case boundary authorization
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      // 3b. Terminal-run guard (PR-26). Evidence submitted after a run has
      // already reached a terminal lifecycle state must NOT resurrect or
      // mutate it, and a freshly-registered QUEUED placeholder would reset a
      // completed attempt and leave the run permanently unable to re-complete.
      // Mirrors the worker-side terminal guard in ingest-evidence.ts.
      if (
        run.state === "COMPLETED" ||
        run.state === "FAILED" ||
        run.status === "COMPLETED" ||
        run.status === "FAILED" ||
        run.status === "CANCELLED"
      ) {
        return res.status(409).json({
          error: "RUN_TERMINAL",
          message: `Investigation ${investigationId} is ${run.status}/${run.state}; no further evidence can be submitted`,
        });
      }

      // 4. Validate payload
      const parsed = EvidenceSubmissionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "VALIDATION_FAILED",
          details: parsed.error.flatten(),
        });
      }
      const submission = parsed.data;

      // 5. System-generated IDs for this submission batch
      const operationId = randomUUID();
      const correlationId = randomUUID();

      // 5b. M-A06: resolve the untrusted client catalog string against the
      // canonical SourceCatalog set (exact match wins, everything else falls
      // back to MANUAL — matching the evidence-submission contract doctrine).
      const parsedCatalog = SourceCatalogSchema.safeParse(submission.sourceCatalog);
      const resolvedSourceCatalog = parsedCatalog.success ? parsedCatalog.data : "MANUAL";

      // 6. Durable expected-work registry + enqueue one job per file.
      //
      // PR-26: register a QUEUED IngestionAttempt for EVERY expected file
      // BEFORE enqueuing ANY job. The completion predicate (run-completion.ts)
      // reads this registry, so a fast job must never observe "no pending
      // attempt" merely because its sibling job has not been enqueued yet.
      // Enqueue-time placeholders are only rolled back for rows this request
      // created — a pre-existing attempt is left intact.
      const expectedKeys: string[] = [];
      const createdKeys = new Set<string>();
      for (const file of submission.files) {
        const idempotencyKey = `evidence-${investigationId}-${file.fileKey}`;
        expectedKeys.push(idempotencyKey);

        const existing = await ingestionStore.findAttempt(investigationId, idempotencyKey);
        // Never downgrade an already-succeeded file to QUEUED. Re-submitting a
        // file whose canonical ingestion already completed is a no-op (the
        // BullMQ jobId dedup returns the retained job), so resetting it would
        // strand the run in ANALYZING forever. Failed/queued/running attempts
        // (and brand-new files) are registered as expected work.
        if (existing?.status === "SUCCEEDED") {
          continue;
        }
        createdKeys.add(idempotencyKey);

        await ingestionStore.upsertAttempt({
          investigationId,
          caseId,
          idempotencyKey,
          operationId,
          correlationId,
          attemptNumber: 0,
          status: "QUEUED",
          sourceId: undefined,
          artifactId: undefined,
          parserId: undefined,
          parserVersion: undefined,
          format: undefined,
          error: undefined,
        });
      }

      const jobIds: string[] = [];
      let enqueued = 0;
      try {
        for (const file of submission.files) {
          const idempotencyKey = `evidence-${investigationId}-${file.fileKey}`;

          const artifactReference = {
            url: file.fileUrl,
            originalFilename: file.fileName,
            declaredMimeType: file.mimeType,
            declaredSizeBytes: file.fileSize,
            ...(file.sha256Hash !== undefined
              ? { declaredContentHash: file.sha256Hash }
              : {}),
            sourceType: "FILE_UPLOAD",
            idempotencyKey,
            providerMetadata: { fileKey: file.fileKey },
          };

          const job = await investigationQueue.add(
            "ingest-evidence",
            {
              investigationId,
              caseId,
              artifactReference,
              sourceName: submission.sourceName,
              sourceDescription: submission.sourceDescription,
              // Source catalog (M-A06): the client string is untrusted. A strict
              // SourceCatalogSchema match is used; anything else (or absent)
              // falls back to MANUAL. The verbatim declaration is preserved so
              // any fallback is auditable on the persisted Source row.
              sourceCatalog: resolvedSourceCatalog,
              declaredSourceCatalog: submission.sourceCatalog,
              evidenceType: submission.evidenceType,
              evidenceTitle: submission.evidenceTitle,
              evidenceDescription: submission.evidenceDescription,
              observedAt: submission.observedAt,
              operationId,
              correlationId,
              idempotencyKey,
            },
            { jobId: idempotencyKey },
          );

          jobIds.push(job.id!);
          enqueued += 1;
        }
      } catch (enqueueError) {
        // Best-effort rollback: remove placeholders for files that were never
        // enqueued so a failed submission cannot leave a dangling expected-work
        // marker that blocks run completion forever.
        for (let i = enqueued; i < expectedKeys.length; i += 1) {
          const key = expectedKeys[i];
          if (key === undefined || !createdKeys.has(key)) continue;
          try {
            await ingestionStore.deleteAttempt(investigationId, key);
          } catch {
            // Non-fatal: the retried submission re-registers the placeholder.
          }
        }
        throw enqueueError;
      }

      // 7. Audit — EVIDENCE_QUEUED: submission accepted and jobs enqueued
      await logAuditEvent({
        investigationId,
        action: "EVIDENCE_QUEUED",
        actor: req.user!.id,
        targetType: "EVIDENCE",
        targetId: investigationId,
        description: `Evidence queued: ${submission.evidenceTitle} (${submission.files.length} file(s), case: ${caseId})`,
      });

      // 8. Broadcast to SSE listeners
      realtimeEvents.emit("progress", {
        investigationId,
        type: "EVIDENCE_SUBMITTED",
        evidenceTitle: submission.evidenceTitle,
        fileCount: submission.files.length,
        operationId,
      });

      return res.status(202).json({
        message: "Evidence submission accepted",
        operationId,
        correlationId,
        jobsEnqueued: jobIds.length,
        fileCount: submission.files.length,
      });

    } catch (error: unknown) {
      console.error("Failed to submit evidence:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 3c. Explicit finalize (PR-26). Completion is a deliberate, authorized act —
// never automatic. The canonical pipeline rests in ANALYZING after ingesting
// the current evidence; a human (or an authorized system caller) finalizes once
// the durable prerequisite check passes: every expected evidence job has
// durably succeeded and nothing is queued, running or failed. The transition
// itself is a single guarded UPDATE, so concurrent finalize calls complete the
// run exactly once.
apiRouter.post(
  "/investigations/:investigationId/finalize",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }

      const run = await db.investigationRun.findFirst({ where: { investigationId } });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }

      const caseId = run.caseId;
      if (!caseId) {
        return res.status(400).json({ error: "Investigation has no associated case" });
      }
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      if (
        run.state === "COMPLETED" ||
        run.state === "FAILED" ||
        run.status === "FAILED" ||
        run.status === "CANCELLED"
      ) {
        return res.status(409).json({
          error: "RUN_TERMINAL",
          message: `Investigation ${investigationId} is ${run.status}/${run.state}; nothing to finalize`,
        });
      }
      if (run.state !== "ANALYZING") {
        return res.status(409).json({
          error: "RUN_NOT_ANALYZING",
          message: `Investigation ${investigationId} is ${run.state}; only an ANALYZING run can be finalized`,
        });
      }
      if (run.status === "PAUSED") {
        return res.status(409).json({
          error: "RUN_PAUSED",
          message: `Investigation ${investigationId} is PAUSED; resume before finalizing`,
        });
      }

      const check = await checkInvestigationAnalysisComplete(investigationId);
      if (!check.complete) {
        return res.status(409).json({
          error: "PREREQUISITES_UNMET",
          message: check.reason,
          attemptCount: check.attemptCount,
          pendingCount: check.pendingCount,
          failedCount: check.failedCount,
        });
      }

      const applied = await finalizeRunIfComplete({
        runId: run.id,
        investigationId,
        actor: req.user.id,
        reason: `Investigation finalized by ${req.user.id}: ${check.reason}`,
      });
      if (!applied) {
        return res.status(409).json({
          error: "FINALIZE_CONFLICT",
          message: "Run state changed concurrently; re-read and retry",
        });
      }

      const updated = await db.investigationRun.findFirst({ where: { investigationId } });
      return res.status(200).json({
        message: "Investigation finalized",
        run: {
          id: updated?.id ?? run.id,
          state: updated?.state ?? "COMPLETED",
          status: updated?.status ?? "COMPLETED",
        },
      });
    } catch (error: unknown) {
      console.error("Failed to finalize investigation run:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ============================================================================
// M-A12-PR3 — Case-scoped graph temporal endpoints (§17 API Plan)
//
// These are the case-scoped public endpoints the PR0 design specifies.
// Backward-compat: the existing /investigations/:id/graph endpoint is
// untouched; the new endpoints use /cases/:caseId/graph/*.
//
// Auth: every endpoint derives the case boundary from the URL path param,
// NOT from a client-supplied query/body field. verifyCaseAccess enforces
// the allow-list (fail-closed). cross-case data never leaks.
//
// Historical graph delegates to graphProjectionService (never raw SQL,
// never Graphology-as-truth). as-of is DEFERRED (501) because PR0 does
// not define sufficient temporal-boundary semantics.
// ============================================================================

const GRAPH_VERSION_LIMIT_MAX = 100;

/**
 * Case-scoped auth helper — resolves caseId from the route param, verifies
 * access, and returns the case boundary. Returns null (with 4xx sent) when
 * the caller is unauthorized or the caseId is invalid.
 */
async function resolveCaseBoundary(
  req: Request,
  res: Response,
): Promise<string | null> {
  const caseId = String(req.params.caseId || "");
  if (!caseId || !CaseIdSchema.safeParse(caseId).success) {
    res.status(400).json({ error: "Invalid case ID" });
    return null;
  }
  if (!req.user || !verifyCaseAccess(req.user, caseId)) {
    res.status(403).json({
      error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
    });
    return null;
  }
  return caseId;
}

/**
 * Resolve the latest InvestigationRun for a case and return its
 * investigationId. The projection service requires an investigationId;
 * this provides it from the authoritative persisted run.
 */
async function resolveInvestigationIdForCase(caseId: string): Promise<string | null> {
  const run = await db.investigationRun.findFirst({
    where: { caseId },
    orderBy: { createdAt: "desc" },
  });
  return run?.investigationId ?? null;
}

// PR3-1. GET /cases/:caseId/graph/current — current canonical graph for a case.
apiRouter.get(
  "/cases/:caseId/graph/current",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  async (req, res) => {
    try {
      const caseId = await resolveCaseBoundary(req, res);
      if (!caseId) return;

      const investigationId = await resolveInvestigationIdForCase(caseId);
      const built = await graphProjectionService.projectCurrentGraph({
        caseId,
        investigationId: investigationId ?? "",
      });
      const snap = normalizeBuiltGraph(built.graph, caseId, built);
      const contract = ProjectedGraphSchema.safeParse(snap);
      if (!contract.success) {
        console.error("Projected graph contract violation:", contract.error.issues);
        return res.status(500).json({
          error: "Projected graph response failed contract validation",
        });
      }

      return res.status(200).json({
        caseId,
        nodeCount: contract.data.nodeCount,
        edgeCount: contract.data.edgeCount,
        graph: contract.data,
      });
    } catch (error: unknown) {
      console.error("Failed to serve case current graph:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PR3-2. GET /cases/:caseId/graph/versions — paginated version listing.
//
// limit ∈ [1, 100] (default 20), offset ∈ [0, ∞) (default 0).
// Ordered by versionNumber ascending (the deterministic replay seam).
apiRouter.get(
  "/cases/:caseId/graph/versions",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  async (req, res) => {
    try {
      const caseId = await resolveCaseBoundary(req, res);
      if (!caseId) return;

      const limitResult = parseBoundedInt(req.query.limit, 1, GRAPH_VERSION_LIMIT_MAX, "limit");
      if (!limitResult.ok) {
        return res.status(400).json({ error: limitResult.error });
      }
      const offsetRaw = req.query.offset;
      let offset = 0;
      if (offsetRaw !== undefined && offsetRaw !== null && String(offsetRaw).trim() !== "") {
        const offResult = parseBoundedInt(offsetRaw, 0, 1_000_000, "offset");
        if (!offResult.ok) {
          return res.status(400).json({ error: offResult.error });
        }
        offset = offResult.value!;
      }
      const limit = limitResult.value ?? 20;

      const { versions, total } = await graphVersionStore.listByCasePaginated(caseId, {
        limit,
        offset,
      });

      return res.status(200).json({
        caseId,
        total,
        offset,
        limit,
        count: versions.length,
        versions: versions.map((v) => ({
          id: v.id,
          caseId: v.caseId,
          versionNumber: v.versionNumber,
          status: v.status,
          projectionStatus: v.projectionStatus,
          parentGraphVersionId: v.parentGraphVersionId,
          checkpointId: v.checkpointId,
          nodeCount: v.nodeCount,
          edgeCount: v.edgeCount,
          reason: v.reason,
          createdAt: v.createdAt.toISOString(),
          updatedAt: v.updatedAt.toISOString(),
        })),
      });
    } catch (error: unknown) {
      console.error("Failed to list graph versions:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PR3-3. GET /cases/:caseId/graph/versions/:vid — historical graph for a
// specific version. `:vid` accepts either a versionNumber (positive integer)
// or a GraphVersion UUID id. The projection service delegates to
// projectGraphVersion which never falls back to the current graph.
apiRouter.get(
  "/cases/:caseId/graph/versions/:vid",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  async (req, res) => {
    try {
      const caseId = await resolveCaseBoundary(req, res);
      if (!caseId) return;

      const vid = String(req.params.vid || "");
      if (!vid) {
        return res.status(400).json({ error: "Version identifier is required" });
      }

      // Determine whether vid is a versionNumber (positive integer) or a UUID.
      const asInt = Number(vid);
      const target =
        Number.isInteger(asInt) && Number.isFinite(asInt) && asInt > 0
          ? { versionNumber: asInt }
          : z.string().uuid().safeParse(vid).success
            ? { graphVersionId: vid }
            : null;
      if (!target) {
        return res.status(400).json({
          error: "vid must be a positive integer versionNumber or a valid UUID",
        });
      }

      await resolveInvestigationIdForCase(caseId);
      const built = await graphProjectionService.projectGraphVersion(caseId, target);
      const snap = normalizeBuiltGraph(built.graph, caseId, built);
      const contract = ProjectedGraphSchema.safeParse(snap);
      if (!contract.success) {
        console.error("Projected graph contract violation:", contract.error.issues);
        return res.status(500).json({
          error: "Projected graph response failed contract validation",
        });
      }

      // Resolve the version metadata for the response.
      const version =
        "versionNumber" in target
          ? await graphVersionStore.findByVersionNumber(caseId, target.versionNumber!)
          : await graphVersionStore.findById(target.graphVersionId, { caseId });

      return res.status(200).json({
        caseId,
        version: version
          ? {
              id: version.id,
              versionNumber: version.versionNumber,
              status: version.status,
              projectionStatus: version.projectionStatus,
              parentGraphVersionId: version.parentGraphVersionId,
              checkpointId: version.checkpointId,
              nodeCount: contract.data.nodeCount,
              edgeCount: contract.data.edgeCount,
              reason: version.reason,
              createdAt: version.createdAt.toISOString(),
              updatedAt: version.updatedAt.toISOString(),
            }
          : null,
        graph: contract.data,
      });
    } catch (error: unknown) {
      // projectGraphVersion throws when the version cannot be resolved —
      // surface as 404, not 500.
      if (
        error instanceof Error &&
        error.message.includes("GraphVersion not found")
      ) {
        return res.status(404).json({ error: error.message });
      }
      console.error("Failed to serve historical graph:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PR3-3b. GET /cases/:caseId/graph/valid-at?at=<ISO> — the graph of ACTIVE
// canonical relations whose persisted validityInterval contains the given
// domain instant `at` (dimension B — domain validity in time, never revision
// order). `at` must be a concrete parseable ISO 8601 instant; relations with
// no usable interval are excluded (never guessed). as-of below stays deferred.
apiRouter.get(
  "/cases/:caseId/graph/valid-at",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  async (req, res) => {
    try {
      const caseId = await resolveCaseBoundary(req, res);
      if (!caseId) return;

      const atRaw = req.query.at;
      if (typeof atRaw !== "string" || atRaw.trim().length === 0) {
        return res.status(400).json({ error: "at query parameter is required" });
      }
      const at = atRaw.trim();
      if (!Number.isFinite(Date.parse(at))) {
        return res.status(400).json({
          error: "at must be a valid ISO 8601 instant",
        });
      }

      const investigationId = await resolveInvestigationIdForCase(caseId);
      const built = await graphProjectionService.projectGraphValidAt(
        { caseId, investigationId: investigationId ?? "" },
        at,
      );
      const snap = normalizeBuiltGraph(built.graph, caseId, built);
      const contract = ProjectedGraphSchema.safeParse(snap);
      if (!contract.success) {
        console.error("Projected graph contract violation:", contract.error.issues);
        return res.status(500).json({
          error: "Projected graph response failed contract validation",
        });
      }

      return res.status(200).json({
        caseId,
        at,
        nodeCount: contract.data.nodeCount,
        edgeCount: contract.data.edgeCount,
        graph: contract.data,
      });
    } catch (error: unknown) {
      console.error("Failed to serve valid-at graph:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PR3-4. GET /cases/:caseId/graph/as-of — DEFERRED (501).
//
// PR0 §17 lists as-of as a candidate endpoint but does not define sufficient
// temporal-boundary semantics (STOP condition #6). Version-based retrieval
// via /versions/:vid is the authoritative historical surface. This stub
// documents the intent without inventing semantics.
apiRouter.get(
  "/cases/:caseId/graph/as-of",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  async (req, res) => {
    const caseId = await resolveCaseBoundary(req, res);
    if (!caseId) return;
    return res.status(501).json({
      error: "as-of temporal query is deferred",
      detail:
        "PR0 does not define sufficient temporal-boundary semantics. Use /versions/:vid for version-based historical retrieval.",
      caseId,
    });
  },
);