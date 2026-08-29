// ============================================================================
// Ingestion Service Dependencies (singletons)
//
// Wire the canonical @indago/ingestion pipeline for the durable evidence
// worker. Storage is durable across restarts (filesystem, content-addressed).
// This module is the ONLY place the acquisition/extraction graph is
// assembled for the queue layer.
// ============================================================================

import path from "node:path";
import {
  ArtifactAcquisitionService,
  HttpArtifactFetcher,
  FilesystemArtifactStorage,
  ExtractionService,
  createDefaultParserRegistry,
  createTesseractOcrProvider,
  NormalizationService,
} from "@indago/ingestion";
import { artifactFetchPolicyFromEnv } from "./artifact-fetch-policy.js";

const MAX_ARTIFACT_SIZE_BYTES = 50 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30000;

const DEFAULT_STORAGE_DIR = path.join(process.cwd(), ".data", "artifacts");

export const artifactStorageDir =
  process.env.ARTIFACT_STORAGE_DIR || DEFAULT_STORAGE_DIR;

export const artifactStorage = new FilesystemArtifactStorage(artifactStorageDir);

const parserRegistry = createDefaultParserRegistry();
const ocrProvider = createTesseractOcrProvider();

// Outbound fetch policy (artifact-fetch-policy.ts). Defaults are strict:
// https only, private/loopback/link-local/metadata destinations rejected,
// redirects capped and re-validated on every hop. In production the
// ARTIFACT_ALLOWED_ORIGINS allowlist is MANDATORY (evidence URLs are pinned to
// the approved UploadThing CDN origins) and ARTIFACT_ALLOW_HTTP /
// ARTIFACT_ALLOW_PRIVATE_HOSTS are refused — see the policy module for the
// full rationale (incl. the DNS-rebinding closure).
const isProduction = process.env.NODE_ENV === "production";

export const acquisitionService = new ArtifactAcquisitionService({
  fetcher: new HttpArtifactFetcher(
    artifactFetchPolicyFromEnv(process.env, isProduction),
  ),
  storage: artifactStorage,
  acquisitionConfig: {
    maxArtifactSizeBytes: MAX_ARTIFACT_SIZE_BYTES,
    fetchTimeoutMs: FETCH_TIMEOUT_MS,
  },
});

export const extractionService = new ExtractionService(
  artifactStorage,
  parserRegistry,
  { ocrProvider },
);

// M-A05: the canonical NormalizationService. Pure and deterministic — safe to
// share across workers (no mutable engine state beyond the versioned default
// configuration).
export const normalizationService = new NormalizationService();