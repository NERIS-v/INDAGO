// ============================================================================
// Identity Consistency Validator (Phase 5A-PR8)
//
// Validates categories: candidate-identity, context-identity,
// authority-version-consistency, context-binding.
//
// Identity stamps on the result (candidateId, caseId, graphVersionId,
// regionId) must match the context. The contextSha256 must match the
// re-computed digest of the serialized context. The serialized context
// must be the canonical serialization of the supplied context (binding).
// ============================================================================

import type { ValidationFinding } from './types.js';
import { VALIDATION_FINDING_CODE } from './types.js';
import { sha256Hex } from './sha256.js';

/**
 * Validate that result identity stamps match the context identity.
 */
export function validateIdentity(
  result: {
    readonly candidateId: string;
    readonly caseId: string;
    readonly graphVersionId: string;
    readonly regionId: string;
    readonly contextSha256: string;
    readonly analysisPolicyVersion: string;
    readonly schemaVersion: string;
  },
  context: {
    readonly caseId: string;
    readonly graphVersionId: string;
    readonly regionId: string;
    readonly analysisPolicyVersion: string;
    readonly candidate: {
      readonly candidateId: string;
    };
  },
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  if (result.candidateId !== context.candidate.candidateId) {
    findings.push({
      code: VALIDATION_FINDING_CODE.IDENTITY_MISMATCH,
      severity: 'ERROR',
      path: 'result.candidateId',
      referenceId: result.candidateId,
      message: `Result candidateId "${result.candidateId}" does not match context candidate "${context.candidate.candidateId}"`,
    });
  }

  if (result.caseId !== context.caseId) {
    findings.push({
      code: VALIDATION_FINDING_CODE.IDENTITY_MISMATCH,
      severity: 'ERROR',
      path: 'result.caseId',
      referenceId: result.caseId,
      message: `Result caseId "${result.caseId}" does not match context caseId "${context.caseId}"`,
    });
  }

  if (result.graphVersionId !== context.graphVersionId) {
    findings.push({
      code: VALIDATION_FINDING_CODE.IDENTITY_MISMATCH,
      severity: 'ERROR',
      path: 'result.graphVersionId',
      referenceId: result.graphVersionId,
      message: `Result graphVersionId "${result.graphVersionId}" does not match context graphVersionId "${context.graphVersionId}"`,
    });
  }

  if (result.regionId !== context.regionId) {
    findings.push({
      code: VALIDATION_FINDING_CODE.IDENTITY_MISMATCH,
      severity: 'ERROR',
      path: 'result.regionId',
      referenceId: result.regionId,
      message: `Result regionId "${result.regionId}" does not match context regionId "${context.regionId}"`,
    });
  }

  return findings;
}

/**
 * Validate that the contextSha256 matches the re-computed digest
 * of the serialized context.
 */
export function validateContextDigest(
  resultDigest: string,
  serializedContext: string,
): ValidationFinding[] {
  const computedDigest = sha256Hex(serializedContext);
  if (resultDigest !== computedDigest) {
    return [{
      code: VALIDATION_FINDING_CODE.CONTEXT_DIGEST_MISMATCH,
      severity: 'ERROR',
      path: 'result.contextSha256',
      referenceId: resultDigest,
      message: `Result contextSha256 "${resultDigest}" does not match computed digest "${computedDigest}"`,
    }];
  }
  return [];
}

/**
 * Validate that the serialized context is the canonical serialization of the
 * supplied context. Re-derives the profile with counts.serializedContextChars
 * zeroed (matching PR7's serialization contract) and compares byte-for-byte.
 *
 * PR7 canonical contract: the serialized context is `canonicalStringify(profile)`
 * where the profile is the context with counts.serializedContextChars = 0.
 * This binding check ensures the serialized context was not tampered with
 * or replaced with an equivalent-but-non-canonical representation.
 */
export function validateContextBinding(
  context: {
    readonly counts: {
      readonly serializedContextChars: number;
      readonly [key: string]: number;
    };
    readonly [key: string]: unknown;
  },
  serializedContext: string,
  canonicalStringify: (value: unknown) => string,
): ValidationFinding[] {
  const profileWithZeroedChars = {
    ...context,
    counts: {
      ...context.counts,
      serializedContextChars: 0,
    },
  };
  const expectedSerialized = canonicalStringify(profileWithZeroedChars);

  if (expectedSerialized !== serializedContext) {
    return [{
      code: VALIDATION_FINDING_CODE.CONTEXT_BINDING_MISMATCH,
      severity: 'ERROR',
      path: 'result.serializedContext',
      message:
        'Serialized context is not the canonical serialization of the supplied context ' +
        '(counts.serializedContextChars must be zeroed for canonical reconstruction)',
    }];
  }
  return [];
}

/**
 * Validate that the analysis policy version matches the context policy version.
 */
export function validateAuthorityVersion(
  result: {
    readonly analysisPolicyVersion: string;
    readonly schemaVersion: string;
  },
  context: {
    readonly analysisPolicyVersion: string;
  },
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  if (result.analysisPolicyVersion !== context.analysisPolicyVersion) {
    findings.push({
      code: VALIDATION_FINDING_CODE.IDENTITY_MISMATCH,
      severity: 'ERROR',
      path: 'result.analysisPolicyVersion',
      referenceId: result.analysisPolicyVersion,
      message: `Result analysisPolicyVersion "${result.analysisPolicyVersion}" does not match context policy "${context.analysisPolicyVersion}"`,
    });
  }

  return findings;
}
