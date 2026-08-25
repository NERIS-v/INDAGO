# Evidence Model

## Overview

INDAGO distinguishes between **Evidence** and **Observation**. This is a fundamental architectural boundary.

## Evidence

Evidence is a data package ingested from an external or internal source. It represents a unit of information that enters the INDAGO system.

- **Source**: External system, file, API, manual entry
- **Contains**: Artifacts (files, documents, records)
- **Produces**: Observations (extracted assertions)
- **Has**: Strength, posture, provenance

## Observation

An observation is a discrete assertion about the world extracted from evidence. Observations are the atomic claims that INDAGO reasons about.

- **Extracted from**: Evidence packages
- **References**: Entities (by canonical EntityId)
- **Has**: Confidence, provenance
- **Supports or contradicts**: Hypotheses

## Key Distinction

```
Evidence (data package)
    └── Observation (extracted assertion)
          └── Entity (canonical identity)
```

Evidence is NOT the same as Observation. Evidence is the container; observations are the claims extracted from it.

## Evidence Posture Tiers

| Tier | Name | Description |
|------|------|-------------|
| T0 | OBSERVATION | Raw observation, not yet validated |
| T1 | INVESTIGATIVE_LEAD | Promising lead requiring further investigation |
| T2 | CORROBORATED_LEAD | Lead supported by multiple sources |
| T3 | EVIDENCE_PACKAGE_CANDIDATE | Strong evidence ready for package assembly |

## Evidence Strength

Evidence strength measures quality and supporting observations. It is NOT a probability.

- Range: [0, 1]
- Higher = stronger supporting observations
- NOT calibrated unless explicitly stated
