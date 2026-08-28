import { describe, it, expect } from "vitest";
import { artifactFetchPolicyFromEnv } from "../src/queue/artifact-fetch-policy.js";
import type { ArtifactFetchPolicy } from "@indago/ingestion";

// ============================================================================
// Prompt 4: production evidence fetch pinning.
//
// The approved-origin allowlist is MANDATORY in production (fail closed) so
// ArtifactReference URLs can only ever dial publisher-controlled UploadThing
// CDN origins; http + private-host escapes are TEST-ONLY and refused in
// production. Non-production keeps the optional allowlist + escape hatches so
// the real-stack e2e suites can still serve local fixtures.
// ============================================================================

const UPLOADTHING = { ARTIFACT_ALLOWED_ORIGINS: "utfs.io" };

describe("artifactFetchPolicyFromEnv", () => {
  it("non-production default = strict https-only, no allowlist, no private hosts", () => {
    const policy = artifactFetchPolicyFromEnv({}, false);

    expect(policy.allowedOrigins).toBeUndefined();
    expect(policy.allowedSchemes).toBeUndefined();
    expect(policy.allowPrivateHosts).toBe(false);
  });

  it("production WITHOUT the allowlist → throws (fail closed)", () => {
    expect(() => artifactFetchPolicyFromEnv({}, true)).toThrow(
      "ARTIFACT_ALLOWED_ORIGINS is REQUIRED in production",
    );
  });

  it("production with an EMPTY allowlist → throws (fail closed)", () => {
    expect(() =>
      artifactFetchPolicyFromEnv({ ARTIFACT_ALLOWED_ORIGINS: " , , " }, true),
    ).toThrow("ARTIFACT_ALLOWED_ORIGINS is REQUIRED in production");
  });

  it("production WITH the allowlist → pinned to approved origins, https-only", () => {
    const policy = artifactFetchPolicyFromEnv(UPLOADTHING, true);

    expect(policy.allowedOrigins).toEqual(new Set(["utfs.io"]));
    expect(policy.allowedSchemes).toBeUndefined();
    expect(policy.allowPrivateHosts).toBe(false);
  });

  it("production refuses the http opt-in even when the allowlist is present", () => {
    expect(() =>
      artifactFetchPolicyFromEnv(
        { ...UPLOADTHING, ARTIFACT_ALLOW_HTTP: "true" },
        true,
      ),
    ).toThrow("ARTIFACT_ALLOW_HTTP must not be enabled in production");
  });

  it("production refuses the test-only private-host escape even when the allowlist is present", () => {
    expect(() =>
      artifactFetchPolicyFromEnv(
        { ...UPLOADTHING, ARTIFACT_ALLOW_PRIVATE_HOSTS: "true" },
        true,
      ),
    ).toThrow("ARTIFACT_ALLOW_PRIVATE_HOSTS is TEST-ONLY");
  });

  it("non-production keeps the http + private-host escapes for e2e fixtures", () => {
    const policy = artifactFetchPolicyFromEnv(
      { ...UPLOADTHING, ARTIFACT_ALLOW_HTTP: "true", ARTIFACT_ALLOW_PRIVATE_HOSTS: "true" },
      false,
    );

    expect(policy.allowedSchemes).toEqual(new Set(["https", "http"]));
    expect(policy.allowPrivateHosts).toBe(true);
  });

  it("allowlist is trimmed, empty segments dropped, case preserved, subdomains remain covered by the fetcher", () => {
    const policy = artifactFetchPolicyFromEnv(
      { ARTIFACT_ALLOWED_ORIGINS: " utfs.io ,,CDN.example.xyz " },
      true,
    ) as ArtifactFetchPolicy;

    expect([...policy.allowedOrigins!].sort()).toEqual([
      "CDN.example.xyz",
      "utfs.io",
    ]);
  });
});