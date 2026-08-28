// ============================================================================
// Artifact Fetch Policy — environment wiring for the production evidence path.
//
// PRODUCTION IS FAIL-CLOSED:
//   - ARTIFACT_ALLOWED_ORIGINS (a comma-separated positive allowlist of
//     approval-worthy hosts) is REQUIRED when NODE_ENV=production. The worker
//     then PINs every ArtifactReference URL to the approved UploadThing CDN
//     origins (e.g. "utfs.io") and refuses any other destination.
//   - ARTIFACT_ALLOW_HTTP and ARTIFACT_ALLOW_PRIVATE_HOSTS are TEST-ONLY
//     escapes; both are rejected in production.
//
// DNS-rebinding closure (by design, explicit per Prompt 4):
//   An attacker can DNS-rebind only a hostname THEY control. Under the
//   mandatory allowlist an attacker-controlled hostname can never be added,
//   and approved origins are publisher-controlled CDN hosts that an attacker
//   cannot rebind to an internal address. Belt-and-braces, the fetcher
//   additionally re-validates every hostname and redirect hop against the
//   private/loopback/link-local/metadata block sets before dialing
//   (artifact-fetcher.ts hostIsAllowed / assertSafeFetchUrl).
// ============================================================================

import type { ArtifactFetchPolicy } from "@indago/ingestion";

export interface ArtifactFetchPolicyEnv {
  readonly ARTIFACT_ALLOWED_ORIGINS?: string | undefined;
  readonly ARTIFACT_ALLOW_HTTP?: string | undefined;
  readonly ARTIFACT_ALLOW_PRIVATE_HOSTS?: string | undefined;
}

/**
 * Build the acquisition fetch policy from the process environment.
 *
 * `isProduction` must be `process.env.NODE_ENV === "production"`: in that mode
 * the approved-origin allowlist is MANDATORY and the test-only escapes are
 * refused. Failing to configure the allowlist throws (fail closed) so a
 * misconfigured production worker refuses to start instead of fetching
 * outside the approved origins.
 */
export function artifactFetchPolicyFromEnv(
  env: ArtifactFetchPolicyEnv,
  isProduction: boolean,
): ArtifactFetchPolicy {
  const rawOrigins = env.ARTIFACT_ALLOWED_ORIGINS;
  const allowHttp = env.ARTIFACT_ALLOW_HTTP === "true";
  const allowPrivateHosts = env.ARTIFACT_ALLOW_PRIVATE_HOSTS === "true";

  const allowedOrigins = rawOrigins
    ? new Set(
        rawOrigins
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : undefined;

  if (isProduction) {
    if (!allowedOrigins || allowedOrigins.size === 0) {
      throw new Error(
        "ARTIFACT_ALLOWED_ORIGINS is REQUIRED in production: evidence artifact " +
          "URLs must be pinned to approved UploadThing CDN origins (e.g. utfs.io).",
      );
    }
    if (allowHttp) {
      throw new Error("ARTIFACT_ALLOW_HTTP must not be enabled in production.");
    }
    if (allowPrivateHosts) {
      throw new Error(
        "ARTIFACT_ALLOW_PRIVATE_HOSTS is TEST-ONLY and must not be set in production.",
      );
    }
  }

  return {
    allowedOrigins,
    allowedSchemes: allowHttp ? new Set(["https", "http"]) : undefined,
    allowPrivateHosts,
  };
}