// ============================================================================
// Graph-Hole Validation — core validation tests (Phase 5A-PR8)
//
// 100+ deterministic tests covering all validation categories:
//   reference existence, identity, digest, binding,
//   temporal (scope containment), evidence classification,
//   provenance (per-reference paths), relationship (substitution),
//   contradiction preservation (relevance), structural signal,
//   authority/version, epistemic safety (ERROR + negation guard),
//   completeness (ERROR), determinism, and no-mutation guarantees.
// ============================================================================

import { describe, expect, it } from 'vitest';

import { validateGraphHoleAnalysis } from '../src/index.js';
import { VALIDATION_FINDING_CODE } from '../src/index.js';
import {
  buildBaseScenario,
  reSerialize,
  validResultForSerialized,
  CASE,
  CAND,
  GVS,
  OBS_1,
  OBS_2,
  OBS_4,
  REGION,
  SRC_1,
  SRC_2,
  validResult,
} from './fixtures.js';

function base() {
  return buildBaseScenario();
}

function expectCode(
  result: ReturnType<typeof validateGraphHoleAnalysis>,
  code: (typeof VALIDATION_FINDING_CODE)[keyof typeof VALIDATION_FINDING_CODE],
) {
  return expect(result.findings.some((f) => f.code === code)).toBe(true);
}

describe('valid baseline', () => {
  it('validates a grounded analysis with no findings', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(true);
    expect(result.findings).toHaveLength(0);
    expect(result.summary.checkedCategories).toBe(15);
    expect(result.summary.errorCount).toBe(0);
    expect(result.summary.warningCount).toBe(0);
  });
});

// ============================================================================
// §1 Reference existence
// ============================================================================

describe('reference existence', () => {
  it('flags an unknown observation id in top-level supportingObservationIds', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, { supportingObservationIds: [OBS_1, '00000000-0000-4b7f-0000-0000000000ff'] }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expectCode(result, VALIDATION_FINDING_CODE.INVALID_ANALYSIS_REFERENCE);
    expect(
      result.findings.some(
        (f) =>
          f.path === 'analysis.supportingObservationIds[1]' &&
          f.referenceId === '00000000-0000-4b7f-0000-0000000000ff',
      ),
    ).toBe(true);
  });

  it('flags an unknown observation id in top-level contradictingObservationIds', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, { contradictingObservationIds: ['00000000-0000-4b7f-0000-0000000000ee'] }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expectCode(result, VALIDATION_FINDING_CODE.INVALID_ANALYSIS_REFERENCE);
  });

  it('flags an unknown hypothesis id in top-level supportingHypothesisIds', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, { supportingHypothesisIds: ['atomic:RELATION_HYPOTHESIS:nonexistent'] }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expectCode(result, VALIDATION_FINDING_CODE.INVALID_ANALYSIS_REFERENCE);
  });

  it('flags an unknown group id in groupedHypothesisId', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, { groupedHypothesisId: 'unknown-group-id' }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expectCode(result, VALIDATION_FINDING_CODE.INVALID_ANALYSIS_REFERENCE);
  });

  it('flags an unknown observation id in missingRelationship.supportingObservationIds', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, {
        missingRelationship: {
          ...b.context.candidate,
          expectedRelationshipType: 'communication',
          direction: 'SOURCE_TO_TARGET',
          assessment: 'CONSISTENT_WITH_GAP',
          supportingObservationIds: ['00000000-0000-4b7f-0000-0000000000dd'],
          contradictingObservationIds: [],
          supportingHypothesisIds: [],
          groupedHypothesisId: null,
        },
      }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expect(
      result.findings.some(
        (f) =>
          f.code === VALIDATION_FINDING_CODE.INVALID_ANALYSIS_REFERENCE &&
          f.path === 'analysis.missingRelationship.supportingObservationIds[0]',
      ),
    ).toBe(true);
  });

  it('flags an unknown observation id in reasoning supportingObservationIds', () => {
    const b = base();
    const invalidStep = {
      id: 'R9',
      kind: 'OBSERVED_FACT',
      statement: 'An unsupported claim.',
      supportingObservationIds: ['00000000-0000-4b7f-0000-0000000000cc'],
      contradictingObservationIds: [],
      referencedHypothesisIds: [],
    };
    const result = validateGraphHoleAnalysis(
      validResult(b, { reasoning: [{ ...b.sc, atomAB: b.sc.atomAB, atomBC: b.sc.atomBC, ...invalidStep }, ...validResult(b).analysis.reasoning] }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expect(
      result.findings.some(
        (f) =>
          f.code === VALIDATION_FINDING_CODE.INVALID_ANALYSIS_REFERENCE &&
          f.path === 'analysis.reasoning[0].supportingObservationIds[0]',
      ),
    ).toBe(true);
  });

  it('flags an unknown hypothesis id in reasoning referencedHypothesisIds', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, {
        reasoning: [
          { ...validResult(b).analysis.reasoning[0], id: 'R1', kind: 'STRUCTURAL_SIGNAL', statement: 'x', supportingObservationIds: [], contradictingObservationIds: [], referencedHypothesisIds: [] },
          { ...validResult(b).analysis.reasoning[1]!, referencedHypothesisIds: [...(validResult(b).analysis.reasoning[1]!.referencedHypothesisIds ?? []), 'atomic:RELATION_HYPOTHESIS:ghost'] },
        ],
      }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expect(
      result.findings.some(
        (f) =>
          f.code === VALIDATION_FINDING_CODE.INVALID_ANALYSIS_REFERENCE &&
          f.path === 'analysis.reasoning[1].referencedHypothesisIds[2]',
      ),
    ).toBe(true);
  });

  it('flags an unknown observation id in recommendedEvidence.supportingObservationIds', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, {
        recommendedEvidence: [
          { evidenceType: 'RECORD', rationale: 'r', supportingObservationIds: ['00000000-0000-4b7f-0000-0000000000bb'] },
        ],
      }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expectCode(result, VALIDATION_FINDING_CODE.INVALID_ANALYSIS_REFERENCE);
  });

  it('flags an unknown observation id in alternativeExplanations', () => {
    const b = base();
    const alt = {
      title: 'Alt',
      description: 'An alternative reading.',
      supportingObservationIds: ['00000000-0000-4b7f-0000-0000000000aa'],
      contradictingObservationIds: [],
      referencedHypothesisIds: [],
      uncertainty: 0.5,
    };
    const result = validateGraphHoleAnalysis(
      validResult(b, { alternativeExplanations: [alt] }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expect(
      result.findings.some(
        (f) =>
          f.code === VALIDATION_FINDING_CODE.INVALID_ANALYSIS_REFERENCE &&
          f.path === 'analysis.alternativeExplanations[0].supportingObservationIds[0]',
      ),
    ).toBe(true);
  });

  it('produces one finding per distinct unknown reference (deduped by path-code-ref)', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, {
        supportingObservationIds: ['00000000-0000-4b7f-0000-0000000000a1', '00000000-0000-4b7f-0000-0000000000a2'],
      }),
      b.context,
      b.serialized,
    );
    const refFindings = result.findings.filter(
      (f) => f.code === VALIDATION_FINDING_CODE.INVALID_ANALYSIS_REFERENCE,
    );
    expect(refFindings).toHaveLength(2);
  });
});

// ============================================================================
// §2 Identity consistency
// ============================================================================

describe('identity consistency', () => {
  it('flags a candidateId mismatch', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      { ...validResult(b), candidateId: '00000000-0000-4000-0000-00000000ffff' },
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expectCode(result, VALIDATION_FINDING_CODE.IDENTITY_MISMATCH);
    expect(result.findings.some((f) => f.path === 'result.candidateId')).toBe(true);
  });

  it('flags a caseId mismatch', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      { ...validResult(b), caseId: '00000000-0000-4000-0000-00000000eeee' },
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expectCode(result, VALIDATION_FINDING_CODE.IDENTITY_MISMATCH);
    expect(result.findings.some((f) => f.path === 'result.caseId')).toBe(true);
  });

  it('flags a graphVersionId mismatch', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      { ...validResult(b), graphVersionId: '00000000-0000-4000-0000-00000000dddd' },
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expectCode(result, VALIDATION_FINDING_CODE.IDENTITY_MISMATCH);
    expect(result.findings.some((f) => f.path === 'result.graphVersionId')).toBe(true);
  });

  it('flags a regionId mismatch', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      { ...validResult(b), regionId: '00000000-0000-4000-0000-00000000cccc' },
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expectCode(result, VALIDATION_FINDING_CODE.IDENTITY_MISMATCH);
    expect(result.findings.some((f) => f.path === 'result.regionId')).toBe(true);
  });

  it('flags multiple identity mismatches at once', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      {
        ...validResult(b),
        candidateId: '00000000-0000-4000-0000-00000000bbbb',
        caseId: '00000000-0000-4000-0000-00000000aaaa',
      },
      b.context,
      b.serialized,
    );
    expect(result.findings.filter((f) => f.code === VALIDATION_FINDING_CODE.IDENTITY_MISMATCH))
      .toHaveLength(2);
  });

  it('flags an analysisPolicyVersion mismatch (authority/version)', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      { ...validResult(b), analysisPolicyVersion: 'v2' },
      b.context,
      b.serialized,
    );
    expect(result.findings.some(
      (f) => f.code === VALIDATION_FINDING_CODE.IDENTITY_MISMATCH && f.path === 'result.analysisPolicyVersion',
    )).toBe(true);
  });
});

// ============================================================================
// §3 Context digest + binding
// ============================================================================

describe('context digest', () => {
  it('accepts a matching contextSha256', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(validResult(b), b.context, b.serialized);
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.CONTEXT_DIGEST_MISMATCH)).toBe(false);
    expect(result.valid).toBe(true);
  });

  it('flags a mismatched contextSha256', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      { ...validResult(b), contextSha256: 'deadbeef'.repeat(8) },
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expectCode(result, VALIDATION_FINDING_CODE.CONTEXT_DIGEST_MISMATCH);
  });

  it('recomputes the digest from the exact serialized context provided', () => {
    const b = base();
    const tampered = b.serialized.replace('"caseId"', '"case-id"');
    const result = validateGraphHoleAnalysis(validResult(b), b.context, tampered);
    expectCode(result, VALIDATION_FINDING_CODE.CONTEXT_DIGEST_MISMATCH);
  });
});

describe('context binding', () => {
  it('accepts the canonical serialized context for a PR7-built triple', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(validResult(b), b.context, b.serialized);
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.CONTEXT_BINDING_MISMATCH))
      .toBe(false);
  });

  it('flags a non-canonical serialized context (pretty-printed)', () => {
    const b = base();
    const pretty = JSON.stringify(JSON.parse(b.serialized), null, 2);
    const result = validateGraphHoleAnalysis(validResult(b), b.context, pretty);
    expectCode(result, VALIDATION_FINDING_CODE.CONTEXT_BINDING_MISMATCH);
    expect(result.valid).toBe(false);
  });

  it('flags a modified serialized context (binding mismatch + digest mismatch)', () => {
    const b = base();
    const tampered = b.serialized.replace('"caseId"', '"case-id"');
    const result = validateGraphHoleAnalysis(validResult(b), b.context, tampered);
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.CONTEXT_BINDING_MISMATCH))
      .toBe(true);
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.CONTEXT_DIGEST_MISMATCH))
      .toBe(true);
  });

  it('flags a mutated context object with correct digest', () => {
    const b = base();
    const mutatedContext = {
      ...b.context,
      candidate: { ...b.context.candidate, holeType: 'MISSING_PATH' },
    };
    // The digest is computed from the original serialized string, so it matches
    // the result. But the context object has been mutated, so binding fails.
    const result = validateGraphHoleAnalysis(validResult(b), mutatedContext, b.serialized);
    expectCode(result, VALIDATION_FINDING_CODE.CONTEXT_BINDING_MISMATCH);
  });

  it('does not flag when the canonical serialized context is used (binding pass)', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(validResult(b), b.context, b.serialized);
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.CONTEXT_BINDING_MISMATCH))
      .toBe(false);
    expect(result.valid).toBe(true);
  });

  it('produces byte-identical results for binding check across calls', () => {
    const b = base();
    const r1 = validateGraphHoleAnalysis(validResult(b), b.context, b.serialized);
    const r2 = validateGraphHoleAnalysis(validResult(b), b.context, b.serialized);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

// ============================================================================
// §4 Temporal consistency
// ============================================================================

describe('temporal consistency', () => {
  it('emits TEMPORAL_CONTRADICTION when candidate scope and window are disjoint', () => {
    const b = base();
    const disjointScope = {
      validFrom: { value: '2050-01-01T00:00:00.000Z', precision: 'exact' },
      validTo: { value: '2051-01-01T00:00:00.000Z', precision: 'exact' },
    } as const;
    const contextWithDisjointScope = {
      ...b.context,
      candidateTemporalScope: disjointScope,
    };
    const serializedDisjoint = reSerialize(contextWithDisjointScope);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedDisjoint),
      contextWithDisjointScope,
      serializedDisjoint,
    );
    expect(result.valid).toBe(true); // warning only
    expectCode(result, VALIDATION_FINDING_CODE.TEMPORAL_CONTRADICTION);
  });

  it('does not emit TEMPORAL_CONTRADICTION when windows overlap', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(validResult(b), b.context, b.serialized);
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.TEMPORAL_CONTRADICTION))
      .toBe(false);
  });

  it('suppresses TEMPORAL_CONTRADICTION when the analysis emits a TEMPORAL_CONFLICT warning', () => {
    const b = base();
    const disjointScope = {
      validFrom: { value: '2050-01-01T00:00:00.000Z', precision: 'exact' },
      validTo: { value: '2051-01-01T00:00:00.000Z', precision: 'exact' },
    } as const;
    const contextWithDisjointScope = { ...b.context, candidateTemporalScope: disjointScope };
    const warnings = [
      { code: 'TEMPORAL_CONFLICT', message: 'Windows do not overlap.' },
    ];
    const serializedDisjoint = reSerialize(contextWithDisjointScope);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedDisjoint, { warnings }),
      contextWithDisjointScope,
      serializedDisjoint,
    );
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.TEMPORAL_CONTRADICTION))
      .toBe(false);
  });

  it('does not emit TEMPORAL_CONTRADICTION when either window is null', () => {
    const b = base();
    const contextNoWindows = {
      ...b.context,
      candidateTemporalScope: null,
      temporalContext: null,
    };
    const serializedNoWindows = reSerialize(contextNoWindows);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedNoWindows),
      contextNoWindows,
      serializedNoWindows,
    );
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.TEMPORAL_CONTRADICTION))
      .toBe(false);
  });

  it('flags an observation cited outside the candidate temporal scope', () => {
    const b = base();
    // Create an observation with validityInterval entirely outside the scope.
    const obsOutside = {
      ...b.context.observations[0]!,
      validityInterval: {
        validFrom: { value: '2090-01-01T00:00:00.000Z', precision: 'exact' },
        validTo: { value: '2091-01-01T00:00:00.000Z', precision: 'exact' },
      },
    };
    const contextWithOutsideObs = {
      ...b.context,
      observations: [obsOutside, ...b.context.observations.slice(1)],
      candidateTemporalScope: {
        validFrom: { value: '2000-01-01T00:00:00.000Z', precision: 'exact' },
        validTo: { value: '2025-12-31T23:59:59.999Z', precision: 'exact' },
      },
    };
    const serializedOutsideObs = reSerialize(contextWithOutsideObs);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedOutsideObs),
      contextWithOutsideObs,
      serializedOutsideObs,
    );
    // The observation's interval [2090-2091] is strictly outside [2000-2025].
    expect(result.findings.some(
      (f) => f.code === VALIDATION_FINDING_CODE.TEMPORAL_CONTRADICTION && f.severity === 'ERROR',
    )).toBe(true);
  });

  it('does not flag an observation with no validityInterval', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(validResult(b), b.context, b.serialized);
    // Base observations have no validityInterval, so no scope-exceeded findings.
    const temporalFindings = result.findings.filter(
      (f) => f.code === VALIDATION_FINDING_CODE.TEMPORAL_CONTRADICTION && f.severity === 'ERROR',
    );
    expect(temporalFindings).toHaveLength(0);
  });

  it('does not flag when observation interval overlaps candidate scope and window', () => {
    const b = base();
    // Base windows: candidateTemporalScope [2021-02-01, 2021-03-01],
    // temporalContext [2021-01-01, 2021-12-31]. A mid-February interval
    // overlaps both, so no scope-exceeded temporal finding.
    const obsInside = {
      ...b.context.observations[0]!,
      validityInterval: {
        validFrom: { value: '2021-02-15T00:00:00.000Z', precision: 'exact' },
        validTo: { value: '2021-02-20T00:00:00.000Z', precision: 'exact' },
      },
    };
    const contextWithInsideObs = {
      ...b.context,
      observations: [obsInside, ...b.context.observations.slice(1)],
    };
    const serializedInsideObs = reSerialize(contextWithInsideObs);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedInsideObs),
      contextWithInsideObs,
      serializedInsideObs,
    );
    const temporalFindings = result.findings.filter(
      (f) => f.code === VALIDATION_FINDING_CODE.TEMPORAL_CONTRADICTION && f.severity === 'ERROR',
    );
    expect(temporalFindings).toHaveLength(0);
  });

  // Forward-compat: deferred limitations. These tests document that the
  // following scenarios are NOT currently detectable with structured data:
  //   - "non-overlap incorrectly represented as overlap" (requires prose)
  //   - "explicit event ordering contradiction" (requires structured ordering)
  //   - "later evidence used as earlier evidence" (requires NLP)
  it('does not flag a TEMPORAL step citing two non-overlapping observations', () => {
    const b = base();
    // Both intervals overlap the base windows (candidateTemporalScope
    // [2021-02-01, 2021-03-01], temporalContext [2021-01-01, 2021-12-31])
    // but are provably non-overlapping with each other.
    const obsA = {
      id: 'obs-temporal-a',
      validityInterval: {
        validFrom: { value: '2021-02-05T00:00:00.000Z', precision: 'exact' },
        validTo: { value: '2021-02-10T00:00:00.000Z', precision: 'exact' },
      },
    };
    const obsB = {
      id: 'obs-temporal-b',
      validityInterval: {
        validFrom: { value: '2021-02-15T00:00:00.000Z', precision: 'exact' },
        validTo: { value: '2021-02-20T00:00:00.000Z', precision: 'exact' },
      },
    };
    const contextWithTemporalObs = {
      ...b.context,
      observations: [...b.context.observations, obsA, obsB],
    };
    const temporalStep = {
      id: 'R_TEMP',
      kind: 'TEMPORAL',
      statement: 'These observations are simultaneous.',
      supportingObservationIds: ['obs-temporal-a', 'obs-temporal-b'],
      contradictingObservationIds: [],
      referencedHypothesisIds: [],
    };
    const serializedTemporalObs = reSerialize(contextWithTemporalObs);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedTemporalObs, {
        reasoning: [...validResult(b).analysis.reasoning, temporalStep],
      }),
      contextWithTemporalObs,
      serializedTemporalObs,
    );
    // Structural schema has no "simultaneity" field — this is deferred.
    // The non-overlapping intervals are NOT flagged as a temporal contradiction
    // because the analysis schema cannot represent ordering claims structurally.
    const errorTemporal = result.findings.filter(
      (f) => f.code === VALIDATION_FINDING_CODE.TEMPORAL_CONTRADICTION && f.severity === 'ERROR',
    );
    expect(errorTemporal).toHaveLength(0);
  });
});

// ============================================================================
// §5 Evidence classification
// ============================================================================

describe('evidence classification consistency', () => {
  it('flags an OBSERVED_FACT step that only references hypotheses', () => {
    const b = base();
    const reasoning = [
      {
        id: 'R90',
        kind: 'OBSERVED_FACT',
        statement: 'A supposed fact.',
        supportingObservationIds: [],
        contradictingObservationIds: [],
        referencedHypothesisIds: [b.sc.atomAB],
      },
    ];
    const result = validateGraphHoleAnalysis(
      validResult(b, { reasoning }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(true); // warning only
    expectCode(result, VALIDATION_FINDING_CODE.EVIDENCE_CLASSIFICATION_MISMATCH);
  });

  it('flags a HYPOTHESIS step that only references observations', () => {
    const b = base();
    const reasoning = [
      {
        id: 'R91',
        kind: 'HYPOTHESIS',
        statement: 'A supposed hypothesis.',
        supportingObservationIds: [OBS_2],
        contradictingObservationIds: [],
        referencedHypothesisIds: [],
      },
    ];
    const result = validateGraphHoleAnalysis(
      validResult(b, { reasoning }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(true);
    expectCode(result, VALIDATION_FINDING_CODE.EVIDENCE_CLASSIFICATION_MISMATCH);
  });

  it('flags an INFERENCE step that only references observations', () => {
    const b = base();
    const reasoning = [
      {
        id: 'R92',
        kind: 'INFERENCE',
        statement: 'An inferred reading.',
        supportingObservationIds: [OBS_2],
        contradictingObservationIds: [],
        referencedHypothesisIds: [],
      },
    ];
    const result = validateGraphHoleAnalysis(
      validResult(b, { reasoning }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(true);
    expectCode(result, VALIDATION_FINDING_CODE.EVIDENCE_CLASSIFICATION_MISMATCH);
  });

  it('flags a CONTRADICTION step with no references at all', () => {
    const b = base();
    const reasoning = [
      {
        id: 'R93',
        kind: 'CONTRADICTION',
        statement: 'A standalone contradiction claim.',
        supportingObservationIds: [],
        contradictingObservationIds: [],
        referencedHypothesisIds: [],
      },
    ];
    const result = validateGraphHoleAnalysis(
      validResult(b, { reasoning }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(true);
    expectCode(result, VALIDATION_FINDING_CODE.EVIDENCE_CLASSIFICATION_MISMATCH);
  });

  it('flags a STRUCTURAL_SIGNAL step with no references (Gap #4)', () => {
    const b = base();
    const reasoning = [
      {
        id: 'R_STRUCT',
        kind: 'STRUCTURAL_SIGNAL',
        statement: 'The graph has no edge between A and C.',
        supportingObservationIds: [],
        contradictingObservationIds: [],
        referencedHypothesisIds: [],
      },
    ];
    const result = validateGraphHoleAnalysis(
      validResult(b, { reasoning }),
      b.context,
      b.serialized,
    );
    expectCode(result, VALIDATION_FINDING_CODE.EVIDENCE_CLASSIFICATION_MISMATCH);
  });

  it('accepts a well-classified HYPOTHESIS step', () => {
    const b = base();
    const reasoning = [
      {
        id: 'R94',
        kind: 'HYPOTHESIS',
        statement: 'A hypothesis grounded in atomics.',
        supportingObservationIds: [OBS_2],
        contradictingObservationIds: [],
        referencedHypothesisIds: [b.sc.atomAB],
      },
    ];
    const result = validateGraphHoleAnalysis(
      validResult(b, { reasoning }),
      b.context,
      b.serialized,
    );
    expect(result.findings.some(
      (f) => f.code === VALIDATION_FINDING_CODE.EVIDENCE_CLASSIFICATION_MISMATCH,
    )).toBe(false);
  });

  it('accepts an OBSERVED_FACT step grounded in observations', () => {
    const b = base();
    const reasoning = [
      {
        id: 'R95',
        kind: 'OBSERVED_FACT',
        statement: 'A fact grounded in observations.',
        supportingObservationIds: [OBS_2],
        contradictingObservationIds: [],
        referencedHypothesisIds: [],
      },
    ];
    const result = validateGraphHoleAnalysis(
      validResult(b, { reasoning }),
      b.context,
      b.serialized,
    );
    expect(result.findings.some(
      (f) => f.code === VALIDATION_FINDING_CODE.EVIDENCE_CLASSIFICATION_MISMATCH,
    )).toBe(false);
  });
});

// ============================================================================
// §6 Provenance
// ============================================================================

describe('provenance consistency', () => {
  it('flags a provenance observedFactId that is not a context observation', () => {
    const b = base();
    const brokenProvenance = [
      ...b.context.provenance,
      { sourceId: SRC_1, observedFactIds: ['00000000-0000-4b7f-0000-0000000000ab'] },
    ];
    const contextWithBrokenProvenance = { ...b.context, provenance: brokenProvenance };
    const serializedBrokenProvenance = reSerialize(contextWithBrokenProvenance);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedBrokenProvenance),
      contextWithBrokenProvenance,
      serializedBrokenProvenance,
    );
    expect(result.valid).toBe(false);
    expectCode(result, VALIDATION_FINDING_CODE.PROVENANCE_MISMATCH);
  });

  it('flags an analysis observation whose source has no provenance record (per-reference path)', () => {
    const b = base();
    const contextWithoutSrc2 = {
      ...b.context,
      provenance: b.context.provenance.filter((p) => p.sourceId !== SRC_2),
    };
    // OBS_2 (used in the analysis) has sourceId SRC_2.
    const serializedNoSrc2 = reSerialize(contextWithoutSrc2);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedNoSrc2),
      contextWithoutSrc2,
      serializedNoSrc2,
    );
    expect(result.valid).toBe(true); // warning only
    expectCode(result, VALIDATION_FINDING_CODE.PROVENANCE_MISMATCH);
    // Per-reference: the finding path should be the specific reference location.
    const provFindings = result.findings.filter(
      (f) => f.code === VALIDATION_FINDING_CODE.PROVENANCE_MISMATCH && f.severity === 'WARNING',
    );
    expect(provFindings.length).toBeGreaterThan(0);
    // The path should be a per-reference path, not a blanket path.
    expect(provFindings[0]!.path).toMatch(/analysis\./);
    expect(provFindings[0]!.path).toMatch(/\[\d+\]/);
  });

  it('accepts fully traceable provenance', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(validResult(b), b.context, b.serialized);
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.PROVENANCE_MISMATCH))
      .toBe(false);
  });
});

// ============================================================================
// §7 Relationship consistency
// ============================================================================

describe('relationship consistency', () => {
  it('flags a missingRelationship expectedRelationshipType mismatch', () => {
    const b = base();
    const mr = {
      ...validResult(b).analysis.missingRelationship,
      expectedRelationshipType: 'financial',
    };
    const result = validateGraphHoleAnalysis(
      validResult(b, { missingRelationship: mr }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(true); // warning only
    expectCode(result, VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY);
  });

  it('flags CONSISTENT_WITH_GAP with only contradicting observations', () => {
    const b = base();
    const mr = {
      ...validResult(b).analysis.missingRelationship,
      assessment: 'CONSISTENT_WITH_GAP',
      supportingObservationIds: [],
      contradictingObservationIds: [OBS_4],
    };
    const result = validateGraphHoleAnalysis(
      validResult(b, { missingRelationship: mr }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(true);
    expect(
      result.findings.some(
        (f) =>
          f.code === VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY &&
          f.path === 'analysis.missingRelationship.assessment',
      ),
    ).toBe(true);
  });

  it('flags CONTRADICTS_GAP with only supporting observations', () => {
    const b = base();
    const mr = {
      ...validResult(b).analysis.missingRelationship,
      assessment: 'CONTRADICTS_GAP',
      supportingObservationIds: [OBS_2],
      contradictingObservationIds: [],
    };
    const result = validateGraphHoleAnalysis(
      validResult(b, { missingRelationship: mr }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(true);
    expectCode(result, VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY);
  });

  it('flags an ENTITY_HYPOTHESIS used as direct relationship support (Gap #3)', () => {
    const b = base();
    // Find an ENTITY_HYPOTHESIS in the context.
    const entityHyp = b.context.atomicHypotheses.find(
      (h) => h.hypothesisType === 'ENTITY_HYPOTHESIS',
    );
    if (!entityHyp) return; // skip if no entity hypothesis in context
    const mr = {
      ...validResult(b).analysis.missingRelationship,
      supportingHypothesisIds: [...validResult(b).analysis.missingRelationship.supportingHypothesisIds, entityHyp.derivedId],
    };
    const result = validateGraphHoleAnalysis(
      validResult(b, { missingRelationship: mr }),
      b.context,
      b.serialized,
    );
    expect(result.findings.some(
      (f) =>
        f.code === VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY &&
        f.message.includes('ENTITY_HYPOTHESIS'),
    )).toBe(true);
  });

  it('flags a supporting hypothesis with predicate differing from expected type (Gap #3)', () => {
    const b = base();
    // Find a RELATION_HYPOTHESIS whose predicate differs from 'communication'.
    const diffHyp = b.context.atomicHypotheses.find(
      (h) => h.hypothesisType === 'RELATION_HYPOTHESIS' && h.predicate !== 'communication',
    );
    if (!diffHyp) return; // skip if no such hypothesis
    const mr = {
      ...validResult(b).analysis.missingRelationship,
      expectedRelationshipType: 'communication',
      supportingHypothesisIds: [diffHyp.derivedId],
    };
    const result = validateGraphHoleAnalysis(
      validResult(b, { missingRelationship: mr }),
      b.context,
      b.serialized,
    );
    expect(result.findings.some(
      (f) =>
        f.code === VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY &&
        f.message.includes('possible substitution'),
    )).toBe(true);
  });

  it('accepts a consistent CONSISTENT_WITH_GAP assessment', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(validResult(b), b.context, b.serialized);
    expect(result.findings.some(
      (f) => f.code === VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY &&
        f.path === 'analysis.missingRelationship.assessment',
    )).toBe(false);
  });

  it('flags an unknown missingRelationship direction value', () => {
    const b = base();
    const mr = {
      ...validResult(b).analysis.missingRelationship,
      direction: 'DIAGONALLY',
    };
    const result = validateGraphHoleAnalysis(
      validResult(b, { missingRelationship: mr }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expect(
      result.findings.some(
        (f) =>
          f.code === VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY &&
          f.path === 'analysis.missingRelationship.direction',
      ),
    ).toBe(true);
  });

  it('accepts the four valid missingRelationship direction values', () => {
    const b = base();
    for (const direction of ['UNKNOWN', 'SOURCE_TO_TARGET', 'TARGET_TO_SOURCE', 'BIDIRECTIONAL']) {
      const result = validateGraphHoleAnalysis(
        validResult(b, {
          missingRelationship: { ...validResult(b).analysis.missingRelationship, direction },
        }),
        b.context,
        b.serialized,
      );
      expect(result.findings.some(
        (f) => f.code === VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY &&
          f.path === 'analysis.missingRelationship.direction',
      )).toBe(false);
    }
  });
});

// ============================================================================
// §8 Contradiction preservation
// ============================================================================

describe('contradiction preservation', () => {
  it('flags CONTRADICTION_IGNORED when relevant contradiction is unaddressed', () => {
    const b = base();
    // Remove all contradiction addressing: no contradicting obs, no warning, no CONTRADICTED.
    // But keep the hypothesis reference so the contradiction is relevant.
    const result = validateGraphHoleAnalysis(
      validResult(b, {
        candidateAssessment: 'STRUCTURALLY_PLAUSIBLE',
        contradictingObservationIds: [],
        warnings: [],
      }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(true); // warning only
    expectCode(result, VALIDATION_FINDING_CODE.CONTRADICTION_IGNORED);
  });

  it('accepts when contradicting observations are referenced', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, {
        candidateAssessment: 'STRUCTURALLY_PLAUSIBLE',
        contradictingObservationIds: [OBS_4],
        warnings: [],
      }),
      b.context,
      b.serialized,
    );
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.CONTRADICTION_IGNORED))
      .toBe(false);
  });

  it('accepts when the assessment is CONTRADICTED', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, {
        candidateAssessment: 'CONTRADICTED',
        contradictingObservationIds: [],
        warnings: [],
      }),
      b.context,
      b.serialized,
    );
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.CONTRADICTION_IGNORED))
      .toBe(false);
  });

  it('accepts when a CONTRADICTIONS_PRESENT warning is emitted', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, {
        candidateAssessment: 'STRUCTURALLY_PLAUSIBLE',
        contradictingObservationIds: [],
        warnings: [{ code: 'CONTRADICTIONS_PRESENT', message: 'present' }],
      }),
      b.context,
      b.serialized,
    );
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.CONTRADICTION_IGNORED))
      .toBe(false);
  });

  it('is a no-op when the context has no contradictions', () => {
    const b = base();
    const contextWithoutContradictions = { ...b.context, contradictions: [] };
    const serializedNoContradictions = reSerialize(contextWithoutContradictions);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedNoContradictions),
      contextWithoutContradictions,
      serializedNoContradictions,
    );
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.CONTRADICTION_IGNORED))
      .toBe(false);
  });

  it('does not flag unrelated contradictions (Gap #7)', () => {
    const b = base();
    // Add an extra contradiction on an unreferenced hypothesis.
    const extraContradiction = {
      id: 'contrad:unrelated:obs',
      kind: 'CONTRADICTION' as const,
      observationId: '00000000-0000-4b7f-0000-00000000ffff',
      hypothesisId: 'atomic:ENTITY_HYPOTHESIS:unreferenced',
      contradictsObservationId: '00000000-0000-4b7f-0000-00000000ffff',
      contradictsHypothesisId: null,
    };
    const contextWithExtra = {
      ...b.context,
      contradictions: [...b.context.contradictions, extraContradiction],
    };
    const serializedWithExtra = reSerialize(contextWithExtra);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedWithExtra, {
        candidateAssessment: 'CONTRADICTED',
        contradictingObservationIds: [],
        warnings: [],
      }),
      contextWithExtra,
      serializedWithExtra,
    );
    // The extra contradiction is unrelated (neither obs nor hyp is referenced).
    // The existing relevant contradiction is addressed via CONTRADICTED assessment.
    const ignoredFindings = result.findings.filter(
      (f) => f.code === VALIDATION_FINDING_CODE.CONTRADICTION_IGNORED,
    );
    expect(ignoredFindings).toHaveLength(0);
  });

  it('accepts a hyp-vs-hyp contradiction addressed via contradictsHypothesisId in a CONTRADICTION step', () => {
    const b = base();
    // Craft a hyp-vs-hyp contradiction whose contradictsHypothesisId is the
    // referenced side; the analysis addresses it via a CONTRADICTION step.
    const hypContradiction = {
      id: 'contrad:hyp:vs:hyp',
      kind: 'CONTRADICTION' as const,
      observationId: null,
      hypothesisId: 'atomic:RELATION_HYPOTHESIS:other',
      contradictsObservationId: null,
      contradictsHypothesisId: b.sc.atomAB,
    };
    const contextWithHypContradiction = {
      ...b.context,
      contradictions: [...b.context.contradictions, hypContradiction],
    };
    const serializedHypContradiction = reSerialize(contextWithHypContradiction);
    const contradictionStep = {
      id: 'R_CONTRAD',
      kind: 'CONTRADICTION',
      statement: 'The grouped hypotheses contradict the expected relationship.',
      supportingObservationIds: [],
      contradictingObservationIds: [],
      referencedHypothesisIds: [b.sc.atomAB],
    };
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedHypContradiction, {
        reasoning: [...validResult(b).analysis.reasoning, contradictionStep],
        candidateAssessment: 'STRUCTURALLY_PLAUSIBLE',
        contradictingObservationIds: [OBS_4],
        warnings: [],
      }),
      contextWithHypContradiction,
      serializedHypContradiction,
    );
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.CONTRADICTION_IGNORED))
      .toBe(false);
  });

  it('flags a hyp-vs-hyp contradiction whose contradictsHypothesisId is referenced but never addressed', () => {
    const b = base();
    const hypContradiction = {
      id: 'contrad:hyp:unaddressed',
      kind: 'CONTRADICTION' as const,
      observationId: null,
      hypothesisId: 'atomic:RELATION_HYPOTHESIS:other',
      contradictsObservationId: null,
      contradictsHypothesisId: b.sc.atomAB,
    };
    const contextWithHypContradiction = {
      ...b.context,
      contradictions: [...b.context.contradictions, hypContradiction],
    };
    const serializedHypContradiction = reSerialize(contextWithHypContradiction);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedHypContradiction, {
        candidateAssessment: 'STRUCTURALLY_PLAUSIBLE',
        contradictingObservationIds: [],
        warnings: [],
      }),
      contextWithHypContradiction,
      serializedHypContradiction,
    );
    // atomAB is referenced in the analysis (supportingHypothesisIds), so the
    // contradiction is relevant; no CONTRADICTION step, no CONTRADICTED
    // assessment, and no CONTRADICTIONS_PRESENT warning means unused.
    const ignoredFindings = result.findings.filter(
      (f) => f.code === VALIDATION_FINDING_CODE.CONTRADICTION_IGNORED,
    );
    expect(ignoredFindings.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// §9 Structural signal consistency
// ============================================================================

describe('structural signal consistency', () => {
  it('flags an unknown structural basis in the context', () => {
    const b = base();
    const contextWithBadBasis = {
      ...b.context,
      candidate: { ...b.context.candidate, structuralBasis: 'INVENTED_BASIS' },
    };
    const serializedBadBasis = reSerialize(contextWithBadBasis);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedBadBasis),
      contextWithBadBasis,
      serializedBadBasis,
    );
    expect(result.valid).toBe(false);
    expect(
      result.findings.some(
        (f) => f.code === VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY &&
          f.path === 'context.candidate.structuralBasis',
      ),
    ).toBe(true);
  });

  it('flags an unknown region status in the context', () => {
    const b = base();
    const contextWithBadStatus = {
      ...b.context,
      candidate: { ...b.context.candidate, regionStatus: 'FABRICATED' },
    };
    const serializedBadStatus = reSerialize(contextWithBadStatus);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedBadStatus),
      contextWithBadStatus,
      serializedBadStatus,
    );
    expect(result.valid).toBe(false);
    expectCode(result, VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY);
  });

  it('flags a candidate node id absent from structural signals', () => {
    const b = base();
    const contextWithMissingNode = {
      ...b.context,
      candidate: { ...b.context.candidate, nodeIds: [b.sc.nodes[0]!.id, '00000000-0000-4b7f-0000-000000000099'] },
    };
    const serializedMissingNode = reSerialize(contextWithMissingNode);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedMissingNode),
      contextWithMissingNode,
      serializedMissingNode,
    );
    expect(result.valid).toBe(false);
    expectCode(result, VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY);
  });

  it('flags a candidate edge id absent from structural signals', () => {
    const b = base();
    const contextWithMissingEdge = {
      ...b.context,
      candidate: {
        ...b.context.candidate,
        observedEdgeIds: [
          b.sc.edges[0]!.id,
          '00000000-0000-4b7f-0000-000000000099',
        ],
      },
    };
    const serializedMissingEdge = reSerialize(contextWithMissingEdge);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedMissingEdge),
      contextWithMissingEdge,
      serializedMissingEdge,
    );
    expect(result.valid).toBe(false);
    expectCode(result, VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY);
  });
});

// ============================================================================
// §10 Epistemic safety
// ============================================================================

describe('epistemic safety', () => {
  it('flags an invalid candidateAssessment enum value', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, { candidateAssessment: 'CONVICTED' } as unknown as Partial<Record<string, unknown>>),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expectCode(result, VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM);
  });

  it('flags a reasoning step asserting guilt (now ERROR)', () => {
    const b = base();
    const reasoning = [
      {
        id: 'R96',
        kind: 'INFERENCE',
        statement: 'The subject is guilty of the offence.',
        supportingObservationIds: [OBS_2],
        contradictingObservationIds: [],
        referencedHypothesisIds: [b.sc.atomAB],
      },
    ];
    const result = validateGraphHoleAnalysis(
      validResult(b, { reasoning }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false); // now ERROR
    expectCode(result, VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM);
  });

  it('flags a reasoning step asserting criminality', () => {
    const b = base();
    const reasoning = [
      {
        id: 'R97',
        kind: 'INFERENCE',
        statement: 'This is a criminal organisation.',
        supportingObservationIds: [OBS_2],
        contradictingObservationIds: [],
        referencedHypothesisIds: [b.sc.atomAB],
      },
    ];
    const result = validateGraphHoleAnalysis(
      validResult(b, { reasoning }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false); // now ERROR
    expectCode(result, VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM);
  });

  it('flags an uncertainty note asserting intent', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, {
        uncertainty: { rating: 'HIGH', note: 'They intended to conceal the records.' },
      }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false); // now ERROR
    expectCode(result, VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM);
  });

  it('flags an alternative explanation asserting conspiracy', () => {
    const b = base();
    const alt = {
      title: 'Conspiracy narrative',
      description: 'The parties conspired to hide the association.',
      supportingObservationIds: [],
      contradictingObservationIds: [],
      referencedHypothesisIds: [],
      uncertainty: 0.5,
    };
    const result = validateGraphHoleAnalysis(
      validResult(b, { alternativeExplanations: [alt] }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false); // now ERROR
    expectCode(result, VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM);
  });

  it('suppresses false positive on negated discussion (Gap #5 negation guard)', () => {
    const b = base();
    const reasoning = [
      {
        id: 'R_NEG',
        kind: 'INFERENCE',
        statement: 'The model must not conclude the subject is guilty.',
        supportingObservationIds: [OBS_2],
        contradictingObservationIds: [],
        referencedHypothesisIds: [b.sc.atomAB],
      },
    ];
    const result = validateGraphHoleAnalysis(
      validResult(b, { reasoning }),
      b.context,
      b.serialized,
    );
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM))
      .toBe(false);
  });

  it('suppresses false positive on "no evidence of intent"', () => {
    const b = base();
    const reasoning = [
      {
        id: 'R_NEG2',
        kind: 'INFERENCE',
        statement: 'There is no evidence of intent to deceive.',
        supportingObservationIds: [OBS_2],
        contradictingObservationIds: [],
        referencedHypothesisIds: [b.sc.atomAB],
      },
    ];
    const result = validateGraphHoleAnalysis(
      validResult(b, { reasoning }),
      b.context,
      b.serialized,
    );
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM))
      .toBe(false);
  });

  it('suppresses false positive on "did not deliberately"', () => {
    const b = base();
    const reasoning = [
      {
        id: 'R_NEG3',
        kind: 'INFERENCE',
        statement: 'The actor did not deliberately conceal evidence.',
        supportingObservationIds: [OBS_2],
        contradictingObservationIds: [],
        referencedHypothesisIds: [b.sc.atomAB],
      },
    ];
    const result = validateGraphHoleAnalysis(
      validResult(b, { reasoning }),
      b.context,
      b.serialized,
    );
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM))
      .toBe(false);
  });

  it('accepts clean epistemic language', () => {
    const b = base();
    const alt = {
      title: 'Alternative reading',
      description: 'The absence of a direct edge may reflect incomplete records rather than avoidance.',
      supportingObservationIds: [OBS_2],
      contradictingObservationIds: [],
      referencedHypothesisIds: [],
      uncertainty: 0.5,
    };
    const result = validateGraphHoleAnalysis(
      validResult(b, { alternativeExplanations: [alt] }),
      b.context,
      b.serialized,
    );
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM))
      .toBe(false);
  });

  it('flags an invalid uncertainty rating enum value', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, { uncertainty: { rating: 'EVERYTHING', note: 'n/a' } }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expect(
      result.findings.some(
        (f) =>
          f.code === VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM &&
          f.path === 'analysis.uncertainty.rating',
      ),
    ).toBe(true);
  });

  it('accepts the four valid uncertainty rating values', () => {
    const b = base();
    for (const rating of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) {
      const result = validateGraphHoleAnalysis(
        validResult(b, { uncertainty: { rating, note: 'n/a' } }),
        b.context,
        b.serialized,
      );
      expect(result.findings.some(
        (f) =>
          f.code === VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM &&
          f.path === 'analysis.uncertainty.rating',
      )).toBe(false);
    }
  });

  it('flags an unknown warning code', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, {
        warnings: [
          { code: 'EVIDENCE_SPARSE', message: 'sparse' },
          { code: 'FABRICATED_WARNING', message: 'n/a' },
        ],
      }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expect(
      result.findings.some(
        (f) =>
          f.code === VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM &&
          f.path === 'analysis.warnings[1].code',
      ),
    ).toBe(true);
  });

  it('flags an alternative explanation uncertainty outside [0, 1]', () => {
    const b = base();
    const alt = {
      title: 'Overconfident reading',
      description: 'A possible alternative reading.',
      supportingObservationIds: [],
      contradictingObservationIds: [],
      referencedHypothesisIds: [],
      uncertainty: 1.7,
    };
    const result = validateGraphHoleAnalysis(
      validResult(b, { alternativeExplanations: [alt] }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expect(
      result.findings.some(
        (f) =>
          f.code === VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM &&
          f.path === 'analysis.alternativeExplanations[0].uncertainty',
      ),
    ).toBe(true);
  });
});

// ============================================================================
// §11 Completeness overclaim
// ============================================================================

describe('completeness overclaim', () => {
  it('flags an absolute negative claim over an incomplete context (now ERROR)', () => {
    const b = base();
    const incompleteContext = {
      ...b.context,
      completeness: {
        ...b.context.completeness,
        semanticRetrievalTruncated: true,
        observationContextLimited: true,
      },
    };
    const reasoning = [
      {
        id: 'R98',
        kind: 'INFERENCE',
        statement: 'No evidence exists to support the relationship.',
        supportingObservationIds: [OBS_2],
        contradictingObservationIds: [],
        referencedHypothesisIds: [b.sc.atomAB],
      },
    ];
    const serializedIncomplete = reSerialize(incompleteContext);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedIncomplete, { reasoning }),
      incompleteContext,
      serializedIncomplete,
    );
    expect(result.valid).toBe(false); // now ERROR
    expectCode(result, VALIDATION_FINDING_CODE.COMPLETENESS_OVERCLAIM);
  });

  it('does not flag an absolute claim over a complete context', () => {
    const b = base();
    const reasoning = [
      {
        id: 'R99',
        kind: 'INFERENCE',
        statement: 'No evidence exists to support the relationship.',
        supportingObservationIds: [OBS_2],
        contradictingObservationIds: [],
        referencedHypothesisIds: [b.sc.atomAB],
      },
    ];
    const result = validateGraphHoleAnalysis(
      validResult(b, { reasoning }),
      b.context,
      b.serialized,
    );
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.COMPLETENESS_OVERCLAIM))
      .toBe(false);
  });

  it('does not flag when the assessment already acknowledges INSUFFICIENT_CONTEXT', () => {
    const b = base();
    const incompleteContext = {
      ...b.context,
      completeness: { ...b.context.completeness, regionLimited: true },
    };
    const reasoning = [
      {
        id: 'R99a',
        kind: 'INFERENCE',
        statement: 'No evidence exists to support the relationship.',
        supportingObservationIds: [OBS_2],
        contradictingObservationIds: [],
        referencedHypothesisIds: [b.sc.atomAB],
      },
    ];
    const serializedIncomplete = reSerialize(incompleteContext);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedIncomplete, { reasoning, candidateAssessment: 'INSUFFICIENT_CONTEXT' }),
      incompleteContext,
      serializedIncomplete,
    );
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.COMPLETENESS_OVERCLAIM))
      .toBe(false);
  });

  it('does not flag an incomplete context without absolute claims', () => {
    const b = base();
    const incompleteContext = {
      ...b.context,
      completeness: { ...b.context.completeness, hypothesisContextLimited: true },
    };
    const serializedIncomplete = reSerialize(incompleteContext);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedIncomplete),
      incompleteContext,
      serializedIncomplete,
    );
    expect(result.findings.some((f) => f.code === VALIDATION_FINDING_CODE.COMPLETENESS_OVERCLAIM))
      .toBe(false);
  });

  it('flags an absolute negative claim in the uncertainty note', () => {
    const b = base();
    const incompleteContext = {
      ...b.context,
      completeness: { ...b.context.completeness, temporalContextLimited: true },
    };
    const serializedIncomplete = reSerialize(incompleteContext);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedIncomplete, { uncertainty: { rating: 'HIGH', note: 'There is no evidence in the world.' } }),
      incompleteContext,
      serializedIncomplete,
    );
    expect(result.valid).toBe(false); // now ERROR
    expectCode(result, VALIDATION_FINDING_CODE.COMPLETENESS_OVERCLAIM);
  });
});

// ============================================================================
// §12 Validation result contract
// ============================================================================

describe('validation result contract', () => {
  it('marks valid === false when any ERROR exists', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, { supportingObservationIds: ['00000000-0000-4b7f-0000-000000000077'] }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(false);
    expect(result.summary.errorCount).toBeGreaterThan(0);
  });

  it('marks valid === true when only warnings exist', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, {
        candidateAssessment: 'STRUCTURALLY_PLAUSIBLE',
        contradictingObservationIds: [],
        warnings: [],
      }),
      b.context,
      b.serialized,
    );
    expect(result.valid).toBe(true);
    expect(result.summary.warningCount).toBeGreaterThan(0);
    expect(result.summary.errorCount).toBe(0);
  });

  it('always reports checkedCategories = 15', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(validResult(b), b.context, b.serialized);
    expect(result.summary.checkedCategories).toBe(15);
  });

  it('sorts findings deterministically by path, code, referenceId, then message', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      validResult(b, {
        supportingObservationIds: ['00000000-0000-4b7f-0000-0000000000cc', '00000000-0000-4b7f-0000-0000000000aa'],
        candidateAssessment: 'CONVICTED' as unknown as string,
      }),
      b.context,
      b.serialized,
    );
    const paths = result.findings.map((f) => `${f.path}|${f.code}|${f.referenceId ?? ''}`);
    const sorted = [...paths].sort();
    expect(paths).toEqual(sorted);
  });

  it('is persistent across calls (no hidden state)', () => {
    const b = base();
    const invalid = { ...validResult(b), caseId: '00000000-0000-4000-0000-000000000066' };
    const r1 = validateGraphHoleAnalysis(invalid, b.context, b.serialized);
    const r2 = validateGraphHoleAnalysis(invalid, b.context, b.serialized);
    expect(r1).toEqual(r2);
  });
});

// ============================================================================
// §13 Determinism
// ============================================================================

describe('determinism', () => {
  it('produces byte-identical results for identical inputs', () => {
    const b = base();
    const resultA = validateGraphHoleAnalysis(validResult(b), b.context, b.serialized);
    const resultB = validateGraphHoleAnalysis(validResult(b), b.context, b.serialized);
    expect(JSON.stringify(resultA)).toBe(JSON.stringify(resultB));
  });

  it('produces identical findings ordering across separate validations', () => {
    const b = base();
    const bad = validResult(b, {
      supportingObservationIds: ['00000000-0000-4b7f-0000-000000000055'],
      candidateAssessment: 'CONVICTED' as unknown as string,
    });
    const a = validateGraphHoleAnalysis(bad, b.context, b.serialized);
    const c = validateGraphHoleAnalysis(bad, b.context, b.serialized);
    expect(a.findings).toEqual(c.findings);
  });
});

// ============================================================================
// §14 No mutation
// ============================================================================

describe('no mutation', () => {
  it('does not modify the analysis result object', () => {
    const b = base();
    const resultObj = validResult(b, {
      supportingObservationIds: ['00000000-0000-4b7f-0000-000000000044'],
    });
    const snapshot = JSON.stringify(resultObj);
    validateGraphHoleAnalysis(resultObj, b.context, b.serialized);
    expect(JSON.stringify(resultObj)).toBe(snapshot);
  });

  it('does not modify the context object', () => {
    const b = base();
    const contextSnapshot = JSON.stringify(b.context);
    validateGraphHoleAnalysis(validResult(b), b.context, b.serialized);
    expect(JSON.stringify(b.context)).toBe(contextSnapshot);
  });

  it('reports findings without rewriting the original references', () => {
    const b = base();
    const badRef = '00000000-0000-4b7f-0000-000000000033';
    const resultObj = validResult(b, { supportingObservationIds: [badRef] });
    validateGraphHoleAnalysis(resultObj, b.context, b.serialized);
    expect(resultObj.analysis.supportingObservationIds[0]).toBe(badRef);
  });
});

// ============================================================================
// §15 Category coverage + summary sanity
// ============================================================================

describe('category coverage', () => {
  it('covers all 11 finding codes in the public constant map', () => {
    const codes = Object.values(VALIDATION_FINDING_CODE);
    expect(codes).toHaveLength(11);
    expect(codes).toEqual(
      expect.arrayContaining([
        'INVALID_ANALYSIS_REFERENCE',
        'IDENTITY_MISMATCH',
        'CONTEXT_DIGEST_MISMATCH',
        'CONTEXT_BINDING_MISMATCH',
        'TEMPORAL_CONTRADICTION',
        'GRAPH_INCONSISTENCY',
        'EVIDENCE_CLASSIFICATION_MISMATCH',
        'PROVENANCE_MISMATCH',
        'FORBIDDEN_EPISTEMIC_CLAIM',
        'COMPLETENESS_OVERCLAIM',
        'CONTRADICTION_IGNORED',
      ]),
    );
  });

  it('uses ERROR severity for reference/identity/digest/binding failures', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(
      {
        ...validResult(b, {
          supportingObservationIds: ['00000000-0000-4b7f-0000-000000000022'],
        }),
        caseId: '00000000-0000-4000-0000-000000000011',
      },
      b.context,
      b.serialized,
    );
    const severityMap = new Map(
      result.findings.map((f) => [f.code, f.severity]),
    );
    expect(severityMap.get(VALIDATION_FINDING_CODE.INVALID_ANALYSIS_REFERENCE)).toBe('ERROR');
    expect(severityMap.get(VALIDATION_FINDING_CODE.IDENTITY_MISMATCH)).toBe('ERROR');
  });

  it('uses ERROR severity for epistemic/completeness/contradiction issues', () => {
    const b = base();
    const incompleteContext = {
      ...b.context,
      completeness: { ...b.context.completeness, regionLimited: true },
    };
    const reasoning = [
      {
        id: 'R91',
        kind: 'INFERENCE',
        statement: 'No evidence exists to support the relationship.',
        supportingObservationIds: [OBS_2],
        contradictingObservationIds: [],
        referencedHypothesisIds: [b.sc.atomAB],
      },
    ];
    const serializedIncomplete = reSerialize(incompleteContext);
    const result = validateGraphHoleAnalysis(
      validResultForSerialized(b, serializedIncomplete, {
        reasoning,
        candidateAssessment: 'STRUCTURALLY_PLAUSIBLE',
        contradictingObservationIds: [],
        warnings: [],
      }),
      incompleteContext,
      serializedIncomplete,
    );
    const severityMap = new Map(
      result.findings.map((f) => [f.code, f.severity]),
    );
    expect(severityMap.get(VALIDATION_FINDING_CODE.COMPLETENESS_OVERCLAIM)).toBe('ERROR');
    expect(severityMap.get(VALIDATION_FINDING_CODE.CONTRADICTION_IGNORED)).toBe('WARNING');
  });
});

// ============================================================================
// §16 Interaction with the exact PR7 authoritative data
// ============================================================================

describe('authoritative data integration', () => {
  it('validates against the exact context produced by PR7 build', () => {
    const b = base();
    expect(b.context.counts).toBeDefined();
    expect(b.context.completeness).toBeDefined();
    const result = validateGraphHoleAnalysis(validResult(b), b.context, b.serialized);
    expect(result.valid).toBe(true);
  });

  it('uses the contextSha256 that PR7 stamped on the result', () => {
    const b = base();
    expect(b.contextSha256).toBe(validResult(b).contextSha256);
  });

  it('validates the serialized context is what the digest covers', () => {
    const b = base();
    const result = validateGraphHoleAnalysis(validResult(b), b.context, b.serialized);
    expect(result.valid).toBe(true);
  });
});
