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
import { relationStore } from "../persistence/relation-store.js";
import { graphRuntime } from "../relations/graph-runtime.js";
import { graphProjectionService } from "../relations/graph-version-service.js";
import { graphVersionStore } from "../persistence/graph-version-store.js";
import { materializeCanonicalEntityFromAcceptedHypothesis, EntityMaterializationError } from "../entities/entity-materialization.js";
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
apiRouter.get(
  "/investigations/:investigationId/graph",
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

      const view = await graphRuntime.graph({ investigationId, caseId });
      return res.status(200).json({
        investigationId,
        caseId,
        nodeCount: view.nodeCount,
        edgeCount: view.edgeCount,
        graph: {
          caseId: view.caseId,
          nodes: view.graph.nodes(),
          edges: view.edges,
        },
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

      // 6. Construct ArtifactReference + enqueue one job per file
      const jobIds: string[] = [];
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
      const snap = (
        await import("../relations/graph-version-service.js")
      ).normalizeBuiltGraph(built.graph, caseId);

      return res.status(200).json({
        caseId,
        nodeCount: snap.nodes.length,
        edgeCount: snap.edges.length,
        graph: snap,
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
      const snap = (
        await import("../relations/graph-version-service.js")
      ).normalizeBuiltGraph(built.graph, caseId);

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
              nodeCount: snap.nodes.length,
              edgeCount: snap.edges.length,
              reason: version.reason,
              createdAt: version.createdAt.toISOString(),
              updatedAt: version.updatedAt.toISOString(),
            }
          : null,
        graph: snap,
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
      const snap = (
        await import("../relations/graph-version-service.js")
      ).normalizeBuiltGraph(built.graph, caseId);

      return res.status(200).json({
        caseId,
        at,
        nodeCount: snap.nodes.length,
        edgeCount: snap.edges.length,
        graph: snap,
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