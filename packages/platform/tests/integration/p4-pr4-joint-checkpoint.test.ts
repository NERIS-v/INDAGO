import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { Server} from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";

// ============================================================================
// P4-PR4 — Joint Phase 4 Checkpoint
//
//   CASE > GRAPH > STRUCTURAL SIGNAL > INVESTIGATIVE LEAD >
//   EVIDENCE FOR/AGAINST > HUMAN REVIEW
//
// P4-PR1, PR2, and PR3 each proved their own link in this chain in
// isolation, against separate synthetic fixtures. This test is the thing
// none of them are: ONE case, ONE graph, walked through the ENTIRE chain in
// a single continuous pass, so a break at any JOINT between the three PRs —
// not just a bug within one of them — would be caught here.
//
// Topology (one case):
//   - Triangle {A,B,C} <-bridge-> Triangle {D,E,F}   (PR1's proven bridge
//     topology: exactly one cut edge, C-D)
//   - Clique {G,H,I,J}, fully connected (cohesion 1.0 -> confidence 1.0 ->
//     priority CRITICAL -> auto-triggers PR3's REVIEW_REQUIRED transition)
//
// Walk:
//   1. GET graph/bridges + graph/community-candidates directly (GRAPH)
//      confirm the raw candidates exist independent of lead generation.
//   2. POST leads/generate (STRUCTURAL SIGNAL -> INVESTIGATIVE LEAD)
//      confirm a BRIDGE lead and a CRITICAL COMMUNITY lead are persisted,
//      and that each lead's sourceCandidateSnapshot/Key trace back to the
//      EXACT candidate from step 1 (real data lineage, not just counts).
//   3. Confirm reviewTriggered=true and the run's state flipped to
//      REVIEW_REQUIRED automatically (HUMAN REVIEW entry) — with NO manual
//      pause/resolve call yet.
//   4. POST leads/:id/evidence for FOR and AGAINST verdicts on the CRITICAL
//      lead (EVIDENCE FOR/AGAINST).
//   5. GET leads/:id confirms supporting/contradicting ids, alternative
//      explanations, and the full LEAD_CREATED -> EVIDENCE_ATTACHED(x2)
//      provenance trail.
//   6. POST review/resolve APPROVED (HUMAN REVIEW exit) -> run COMPLETED.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "P4-PR4 Joint Checkpoint: CASE > GRAPH > SIGNAL > LEAD > EVIDENCE > REVIEW (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let server: Server;
    let baseUrl: string;

    const investigationId = randomUUID();
    const caseId = randomUUID();
    const sourceId = randomUUID();

    // Bridge topology.
    const A = randomUUID();
    const B = randomUUID();
    const C = randomUUID();
    const D = randomUUID();
    const E = randomUUID();
    const F = randomUUID();
    // Dense clique — guaranteed CRITICAL community lead.
    const G = randomUUID();
    const H = randomUUID();
    const I = randomUUID();
    const J = randomUUID();

    const FOR_OBSERVATION_ID = randomUUID();
    const AGAINST_OBSERVATION_ID = randomUUID();

    function authHeader(token: string) {
      return { authorization: `Bearer ${token}` };
    }

    async function makeEntity(id: string, name: string) {
      await prisma.entity.create({
        data: {
          id,
          identityKey: `test:${caseId}:${id}`,
          caseId,
          investigationId,
          canonicalName: name,
          entityType: "PERSON",
          status: "ACTIVE",
          observationIds: [],
          hypothesisIds: [],
          provenance: { sourceId, extractor: "p4-pr4-joint-test" },
        },
      });
    }

    async function makeRelation(source: string, target: string, keySuffix: string) {
      await prisma.relation.create({
        data: {
          id: randomUUID(),
          relationKey: `p4-pr4:${caseId}:${keySuffix}`,
          caseId,
          investigationId,
          sourceEntityId: source,
          targetEntityId: target,
          relationType: "association",
          directed: false,
          support: 0.6,
          evidenceBasis: [`obs-${keySuffix}`],
          contradictions: [],
          status: "ACTIVE",
          scoreModelVersion: "p4-pr4-joint-test",
          evidenceCount: 1,
          provenance: { sourceId, extractor: "p4-pr4-joint-test" },
          hypothesisId: randomUUID(),
        },
      });
    }

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL!;
      process.env.INDAGO_DEV_ALLOWED_CASES = caseId;
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });

      await prisma.$executeRawUnsafe('TRUNCATE TABLE "LeadEvent"');
      await prisma.leadEvidenceLink.deleteMany({});
      await prisma.lead.deleteMany({});
      await prisma.auditEvent.deleteMany({ where: { investigationId } });
      await prisma.relation.deleteMany({});
      await prisma.entity.deleteMany({});
      await prisma.investigationRun.deleteMany({});

      await prisma.investigationRun.create({
        data: {
          investigationId,
          caseId,
          status: "RUNNING",
          state: "DISCOVERING", // Phase 4 begins where Phase 3's vertical slice ends.
          contextData: { caseId },
        },
      });

      for (const [id, name] of [
        [A, "Alice"], [B, "Bob"], [C, "Carol"], [D, "Dave"], [E, "Erin"], [F, "Frank"],
        [G, "Grace"], [H, "Heidi"], [I, "Ivan"], [J, "Judy"],
      ] as const) {
        await makeEntity(id, name);
      }

      // Triangle 1.
      await makeRelation(A, B, "ab");
      await makeRelation(B, C, "bc");
      await makeRelation(C, A, "ca");
      // Bridge (the sole connector between the two triangles).
      await makeRelation(C, D, "cd");
      // Triangle 2.
      await makeRelation(D, E, "de");
      await makeRelation(E, F, "ef");
      await makeRelation(F, D, "fd");
      // Dense clique (complete graph on 4 nodes, cohesion 1.0).
      await makeRelation(G, H, "gh");
      await makeRelation(G, I, "gi");
      await makeRelation(G, J, "gj");
      await makeRelation(H, I, "hi");
      await makeRelation(H, J, "hj");
      await makeRelation(I, J, "ij");

      const { apiRouter } = await import("../../src/api/routes.js");
      const app = express();
      app.use(express.json());
      app.use("/api/v1", apiRouter);
      server = app.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      });
      await new Promise<void>((resolve) => server.once("listening", resolve));
    }, 120_000);

    afterAll(async () => {
      server?.close();
      delete process.env.INDAGO_DEV_ALLOWED_CASES;
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "LeadEvent"');
      await prisma.leadEvidenceLink.deleteMany({});
      await prisma.lead.deleteMany({});
      await prisma.auditEvent.deleteMany({ where: { investigationId } });
      await prisma.relation.deleteMany({});
      await prisma.entity.deleteMany({});
      await prisma.investigationRun.deleteMany({});
      await prisma.$disconnect();
    });

    // Captured across steps to prove lineage, not just independent counts.
    let bridgeEdgeId: string;
    let cliqueMemberIds: string[];
    let criticalLeadId: string;

    it("STEP 1 — GRAPH: raw bridge and community candidates exist on this case's graph", async () => {
      const bridgesRes = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph/bridges`,
        { headers: authHeader("demo-token") },
      );
      expect(bridgesRes.status).toBe(200);
      const bridgesBody = (await bridgesRes.json()) as { bridges: { edgeId: string; nodeIds: [string, string] }[] };
      expect(bridgesBody.bridges).toHaveLength(1);
      expect(new Set(bridgesBody.bridges[0]!.nodeIds)).toEqual(new Set([C, D]));
      bridgeEdgeId = bridgesBody.bridges[0]!.edgeId;

      const communitiesRes = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/graph/community-candidates`,
        { headers: authHeader("demo-token") },
      );
      expect(communitiesRes.status).toBe(200);
      const communitiesBody = (await communitiesRes.json()) as {
        candidates: { memberNodeIds: string[]; cohesion: number }[];
      };
      const clique = communitiesBody.candidates.find((c) => c.cohesion === 1 && c.memberNodeIds.length === 4);
      expect(clique).toBeDefined();
      cliqueMemberIds = [...clique!.memberNodeIds].sort();
      expect(cliqueMemberIds).toEqual([G, H, I, J].sort());
    });

    it("STEP 2 — STRUCTURAL SIGNAL -> INVESTIGATIVE LEAD: generate persists a BRIDGE lead and a CRITICAL COMMUNITY lead with real data lineage", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/leads/generate`,
        { method: "POST", headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { leadsCreated: number; reviewTriggered: boolean };
      expect(body.leadsCreated).toBeGreaterThanOrEqual(2);

      const leadsRes = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/leads`,
        { headers: authHeader("demo-token") },
      );
      const leadsBody = (await leadsRes.json()) as {
        leads: {
          id: string;
          sourceCandidateType: string;
          sourceCandidateKey: string;
          priority: string;
          confidence: number;
          alternativeExplanations: unknown[];
        }[];
      };

      const bridgeLead = leadsBody.leads.find((l) => l.sourceCandidateType === "BRIDGE");
      expect(bridgeLead).toBeDefined();
      // Data lineage: the lead's candidate key is THE SAME edge found in step 1.
      expect(bridgeLead!.sourceCandidateKey).toBe(bridgeEdgeId);
      expect(bridgeLead!.alternativeExplanations.length).toBeGreaterThan(0);

      const communityLead = leadsBody.leads.find(
        (l) => l.sourceCandidateType === "COMMUNITY" && l.priority === "CRITICAL",
      );
      expect(communityLead).toBeDefined();
      expect(communityLead!.confidence).toBe(1);
      // Data lineage: the lead's candidate key is the SAME sorted member set from step 1.
      expect(communityLead!.sourceCandidateKey).toBe(cliqueMemberIds.join(","));
      expect(communityLead!.alternativeExplanations.length).toBeGreaterThan(0);
      criticalLeadId = communityLead!.id;

      // HUMAN REVIEW entry, triggered automatically by the CRITICAL lead —
      // no manual pause/escalation call anywhere in this test so far.
      expect(body.reviewTriggered).toBe(true);
    });

    it("STEP 3 — HUMAN REVIEW (entry): the run's pipeline stage flipped to REVIEW_REQUIRED", async () => {
      const run = await prisma.investigationRun.findFirst({ where: { investigationId } });
      expect(run?.state).toBe("REVIEW_REQUIRED");
      // Status stays RUNNING — REVIEW_REQUIRED is a pipeline stage, not an
      // execution pause (distinct from PR3's pause()/resume(), which this
      // flow never calls).
      expect(run?.status).toBe("RUNNING");
    });

    it("STEP 4 — EVIDENCE FOR/AGAINST: attach both verdicts to the CRITICAL lead", async () => {
      const forRes = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/leads/${criticalLeadId}/evidence`,
        {
          method: "POST",
          headers: { ...authHeader("demo-token"), "content-type": "application/json" },
          body: JSON.stringify({ observationId: FOR_OBSERVATION_ID, verdict: "FOR", rationale: "clique confirmed via independent source" }),
        },
      );
      expect(forRes.status).toBe(201);

      const againstRes = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/leads/${criticalLeadId}/evidence`,
        {
          method: "POST",
          headers: { ...authHeader("demo-token"), "content-type": "application/json" },
          body: JSON.stringify({ observationId: AGAINST_OBSERVATION_ID, verdict: "AGAINST", rationale: "possible shared-employer alternative explanation" }),
        },
      );
      expect(againstRes.status).toBe(201);
    });

    it("STEP 5 — lead record shows the full FOR/AGAINST + provenance trail", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/leads/${criticalLeadId}`,
        { headers: authHeader("demo-token") },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        lead: { supportingObservationIds: string[]; contradictingObservationIds: string[] };
        events: { eventType: string }[];
        evidence: { verdict: string; observationId: string }[];
      };
      expect(body.lead.supportingObservationIds).toContain(FOR_OBSERVATION_ID);
      expect(body.lead.contradictingObservationIds).toContain(AGAINST_OBSERVATION_ID);
      expect(body.evidence).toHaveLength(2);
      expect(body.events.map((e) => e.eventType)).toEqual(
        expect.arrayContaining(["LEAD_CREATED", "EVIDENCE_ATTACHED"]),
      );
      // Two distinct EVIDENCE_ATTACHED events (one per verdict).
      expect(body.events.filter((e) => e.eventType === "EVIDENCE_ATTACHED")).toHaveLength(2);
    });

    it("STEP 6 — HUMAN REVIEW (exit): resolving APPROVED completes the run", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/review/resolve`,
        {
          method: "POST",
          headers: { ...authHeader("demo-token"), "content-type": "application/json" },
          body: JSON.stringify({ outcome: "APPROVED", notes: "clique corroborated by FOR evidence; AGAINST explanation considered and rejected" }),
        },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { run: { state: string } };
      expect(body.run.state).toBe("COMPLETED");

      const run = await prisma.investigationRun.findFirst({ where: { investigationId } });
      expect(run?.state).toBe("COMPLETED");
    });

    it("FULL CHAIN — the complete signature holds end to end", async () => {
      // Re-fetch everything one final time and assert the whole signature
      // together, as a single consolidated proof the chain never broke:
      //   CASE(caseId) -> GRAPH(bridge+clique existed)
      //   -> STRUCTURAL SIGNAL(candidates detected)
      //   -> INVESTIGATIVE LEAD(persisted, traceable to those exact candidates)
      //   -> EVIDENCE FOR/AGAINST(attached to the lead)
      //   -> HUMAN REVIEW(auto-triggered, then resolved)
      const leadRes = await fetch(
        `${baseUrl}/api/v1/investigations/${investigationId}/leads/${criticalLeadId}`,
        { headers: authHeader("demo-token") },
      );
      const leadBody = (await leadRes.json()) as {
        lead: { sourceCandidateKey: string; supportingObservationIds: string[]; contradictingObservationIds: string[] };
      };
      const run = await prisma.investigationRun.findFirst({ where: { investigationId } });

      expect(leadBody.lead.sourceCandidateKey).toBe(cliqueMemberIds.join(","));
      expect(leadBody.lead.supportingObservationIds.length).toBeGreaterThan(0);
      expect(leadBody.lead.contradictingObservationIds.length).toBeGreaterThan(0);
      expect(run?.state).toBe("COMPLETED");
    });
  },
);
