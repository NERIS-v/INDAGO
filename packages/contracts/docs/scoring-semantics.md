# Scoring Semantics

## Overview

This document describes how each score type in INDAGO should be interpreted and used.

## Score Type Reference

### AnalyticalConfidence

```typescript
z.number().min(0).max(1)
  .describe("Analytical confidence in the model output. NOT a probability unless calibrated.")
```

**Interpretation**:
- 0.0 = No confidence in the model output
- 0.5 = Moderate confidence
- 1.0 = Very high confidence

**Usage**: Hypotheses, claims, investigation summaries, gap impact

**Warning**: This is NOT a probability. Do not interpret as "there is a X% chance this is true."

---

### ResolutionScore

```typescript
z.number().min(0).max(1)
  .describe("Support for an identity match. Ranking signal, not identity certainty.")
```

**Interpretation**:
- 0.0 = No support for identity match
- 0.5 = Moderate support
- 1.0 = Strong support for identity match

**Usage**: Entity resolution, entity hypotheses

**Warning**: This is a ranking signal. Higher score = better candidate, but NOT certainty.

---

### StructuralSignal

```typescript
z.number().min(0).max(1)
  .describe("Graph-theoretic importance. NOT criminal relevance.")
```

**Interpretation**:
- 0.0 = Structurally insignificant
- 0.5 = Moderate structural importance
- 1.0 = Highly structurally important

**Usage**: Graph nodes, graph edges, graph holes

**Warning**: This measures graph topology, NOT criminal relevance. A suspect may have low structural importance.

---

### EvidenceStrength

```typescript
z.number().min(0).max(1)
  .describe("Quality and strength of supporting observations.")
```

**Interpretation**:
- 0.0 = Very weak supporting observations
- 0.5 = Moderate supporting observations
- 1.0 = Very strong supporting observations

**Usage**: Evidence packages, observations

---

### RobustnessScore

```typescript
z.number().min(0).max(100)
  .describe("Perturbation stability count. NOT truth probability.")
```

**Interpretation**:
- 0 = Never stable under perturbation
- 50 = Stable in half of perturbation iterations
- 100 = Always stable under perturbation

**Usage**: Robustness analysis

**Warning**: This counts stable iterations, NOT the probability of truth.

---

### RoleSignal

```typescript
z.number().min(0).max(1)
  .describe("Evidence-supported role classification strength. NOT legal status.")
```

**Interpretation**:
- 0.0 = No evidence for this role
- 0.5 = Moderate evidence for this role
- 1.0 = Strong evidence for this role

**Usage**: Entity role hypotheses

**Warning**: This is NOT legal status. "Suspect" is an investigative role, NOT a legal determination.

---

### RelationSupport

```typescript
z.number().min(0).max(1)
  .describe("Support for the existence/type of a relationship given available evidence.")
```

**Interpretation**:
- 0.0 = No support for this relationship
- 0.5 = Moderate support
- 1.0 = Strong support

**Usage**: Relation hypotheses, graph edges

---

### ExpectedInformationGain

```typescript
z.number().min(0).max(1)
  .describe("Expected reduction in uncertainty. Normalized heuristic, not calibrated probability.")
```

**Interpretation**:
- 0.0 = No expected information gain
- 0.5 = Moderate expected gain
- 1.0 = High expected gain

**Usage**: Investigative gaps, evidence requests, route staging

**Warning**: This is a heuristic, NOT a calibrated probability.

## General Rules

1. **Never use bare `score: number`** where these types apply
2. **Never claim scores are probabilities** unless explicitly calibrated
3. **Always check the score type** before interpreting
4. **Document which score type** you're using in any new schema
5. **Respect the ranges**: Most are [0,1], RobustnessScore is [0,100]
