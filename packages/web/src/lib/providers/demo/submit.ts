// ============================================================================
// F-PR3 Demo Evidence Submission — deterministic builders
//
// Constructs canonical Source / Artifact / Evidence records for evidence the
// user submits during the deterministic demo flow. Everything is derived from
// a stable seed so the same submission yields the same identities and timestamps.
//
// Notes on hashing (per F-PR3 spec §27):
//   - The canonical content hash is produced by the backend during ingestion.
//   - This demo does NOT pretend to compute a real content hash. The artifact
//     `hash` field is a clearly-prefixed deterministic demo placeholder
//     (`demo-contenthash:...`) so fixtures remain contract-valid without
//     duplicating backend hashing in the UI.
// ============================================================================

import type {
  Source,
  Artifact,
  Evidence,
  EvidenceSubmissionRequest,
  UploadedFileReference,
} from "@indago/contracts";
import { createdNow } from "./demo-fixtures/times";

/** FNV-1a 64-bit digest (16 lowercase hex chars) with an independent salt. */
function fnv1a64(input: string, salt: number): string {
  let h = 0xcbf29ce484222325n ^ BigInt(salt);
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

/**
 * Deterministic RFC-4122-shaped UUID (valid per zod `.uuid()`).
 * Same seed → same uuid. Version nibble set to 4, variant to 8.
 */
export function deterministicUuid(seed: string): string {
  const a = fnv1a64(seed, 1);
  const b = fnv1a64(seed, 2);
  const group1 = a.slice(0, 8);
  const group2 = a.slice(8, 12);
  const group3 = `4${a.slice(13, 16)}`;
  const group4 = `8${b.slice(1, 4)}`;
  const group5 = b.slice(4, 16);
  return `${group1}-${group2}-${group3}-${group4}-${group5}`.toLowerCase();
}

/** Deterministic demo content-hash placeholder (NOT a backend hash). */
export function demoContentHash(seed: string): string {
  return `demo-contenthash:${deterministicUuid(seed)}`;
}

export interface DemoSubmissionIds {
  readonly operationId: string;
  readonly correlationId: string;
  readonly sourceId: string;
  readonly evidenceId: string;
  readonly artifactIds: string[];
}

/** Derive all deterministic identities for one submission batch. */
export function demoSubmissionIds(
  investigationId: string,
  files: UploadedFileReference[],
  sourceName: string,
): DemoSubmissionIds {
  const fileSeed = files.map((f) => f.fileKey).join(":");
  const operationId = deterministicUuid(`op:${investigationId}:${fileSeed}`);
  const correlationId = deterministicUuid(`corr:${investigationId}:${operationId}`);
  const sourceId = deterministicUuid(`source:${investigationId}:${sourceName}`);
  const evidenceId = deterministicUuid(`evidence:${investigationId}:${operationId}`);
  const artifactIds = files.map((f) =>
    deterministicUuid(`artifact:${investigationId}:${f.fileKey}`),
  );
  return { operationId, correlationId, sourceId, evidenceId, artifactIds };
}

/** Build a canonical FILE_UPLOAD Source for the submission. */
export function buildDemoSource(
  request: Pick<EvidenceSubmissionRequest, "sourceName" | "sourceDescription">,
  caseId: string,
  sourceId: string,
): Source {
  return {
    id: sourceId,
    caseId,
    name: request.sourceName,
    type: "FILE_UPLOAD",
    status: "ACTIVE",
    systemOrigin: "frontend.demo.v1",
    evidenceIds: [],
    description: request.sourceDescription ?? undefined,
    createdAt: createdNow(),
    updatedAt: createdNow(),
  };
}

/** Build one canonical Artifact per uploaded file reference. */
export function buildDemoArtifacts(
  files: UploadedFileReference[],
  sourceId: string,
  evidenceId: string,
  investigationId: string,
  artifactIds: string[],
): Artifact[] {
  return files.map((f, i) => ({
    id: artifactIds[i] ?? deterministicUuid(`artifact:${investigationId}:${f.fileKey}`),
    evidenceId,
    sourceId,
    type: "OTHER",
    filename: f.fileName,
    mimeType: f.mimeType ?? "",
    sizeBytes: f.fileSize,
    hash: demoContentHash(`${investigationId}:${f.fileKey}`),
    storagePath: `demo/upload/${f.fileKey}`,
    createdAt: createdNow(),
    updatedAt: createdNow(),
  }));
}

/** Build the canonical Evidence record for the submission batch. */
export function buildDemoEvidence(
  request: EvidenceSubmissionRequest,
  caseId: string,
  sourceId: string,
  evidenceId: string,
  artifactIds: string[],
): Evidence {
  return {
    id: evidenceId,
    caseId,
    investigationId: request.investigationId,
    sourceId,
    type: request.evidenceType,
    status: "INGESTED",
    title: request.evidenceTitle,
    description: request.evidenceDescription,
    artifactIds,
    observationIds: [],
    entityIds: [],
    hypothesisIds: [],
    strength: 0,
    posture: "T0_OBSERVATION",
    provenance: { sourceId, extractor: "frontend.demo.v1" },
    ingestionTime: createdNow(),
    observedAt: request.observedAt,
    createdAt: createdNow(),
    updatedAt: createdNow(),
  };
}