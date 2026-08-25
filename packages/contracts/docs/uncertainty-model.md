# Uncertainty Model

## Overview

INDAGO uses multiple semantic score types to represent different kinds of uncertainty. **Do NOT use generic `score: number`** where these types apply.

## Score Types

### AnalyticalConfidence

- **Range**: [0, 1]
- **Semantics**: Analytical confidence in the model's output
- **Warning**: NOT a probability unless calibrated on held-out labeled data
- **Used in**: Hypotheses, claims, investigation summaries

### ResolutionScore

- **Range**: [0, 1]
- **Semantics**: Support for an identity match
- **Warning**: Ranking signal, NOT identity certainty
- **Used in**: Entity resolution, entity hypotheses

### StructuralSignal

- **Range**: [0, 1]
- **Semantics**: Graph-theoretic importance
- **Warning**: NOT criminal relevance
- **Used in**: Graph nodes, graph edges, graph holes

### EvidenceStrength

- **Range**: [0, 1]
- **Semantics**: Quality and strength of supporting observations
- **Used in**: Evidence packages, observations

### RobustnessScore

- **Range**: [0, 100]
- **Semantics**: Perturbation stability count
- **Warning**: NOT truth probability
- **Used in**: Robustness analysis

### RoleSignal

- **Range**: [0, 1]
- **Semantics**: Evidence-supported role classification strength
- **Warning**: NOT legal status
- **Used in**: Entity role hypotheses

### RelationSupport

- **Range**: [0, 1]
- **Semantics**: Support for the existence/type of a relationship given available evidence
- **Used in**: Relation hypotheses, graph edges

### ExpectedInformationGain

- **Range**: [0, 1]
- **Semantics**: Expected reduction in uncertainty
- **Warning**: Normalized heuristic, NOT calibrated probability
- **Used in**: Investigative gaps, evidence requests, route staging

## Coverage

Coverage is a composite type with three dimensions:

- `sourceCoverage`: Proportion of relevant source systems represented
- `temporalCoverage`: Proportion of relevant time range covered
- `resolutionCoverage`: Proportion of entity resolution space covered

## TemporalCompatibilitySignal

Not binary. Supports graded compatibility:

- `score`: [0, 1] compatibility strength
- `status`: exact | strong | partial | unknown | contradictory
- `basis`: Explanation of why this status was assigned

## Important Rules

1. **Never use `score: number`** where semantics matter
2. **Never claim these are probabilities** unless explicitly calibrated
3. **Always document** which score type you're using
4. **StructuralSignal ≠ criminal relevance**
5. **RobustnessScore ≠ truth probability**
