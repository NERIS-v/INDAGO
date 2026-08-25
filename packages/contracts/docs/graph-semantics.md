# Graph Semantics

## Overview

The INDAGO graph represents entities, evidence, and relationships as a network. Graph analysis reveals structural patterns, missing connections, and investigation blind spots.

## Node Types

| Type | Description |
|------|-------------|
| ENTITY | Canonical investigation entity |
| EVIDENCE | Evidence package |
| OBSERVATION | Extracted assertion |
| SOURCE | Data source |
| HYPOTHESIS | Working hypothesis |
| LEAD | Investigative lead |
| ARTIFACT | File or document |
| OTHER | Unclassified |

## Edge Types (Relation Types)

| Type | Description |
|------|-------------|
| communication | Messages between entities |
| financial | Money transfers, accounts |
| ownership | Property, assets |
| co-location | Shared physical location |
| association | Evidence supports association claim |
| organizational | Shared organization |
| transport | Movement, logistics |
| family | Family relationship |
| vehicle | Vehicle association |
| case-link | Cross-case connection |
| other | Unclassified |

**Important**: A relation type describes the observed/inferred relationship category, NOT criminality. `association` means the evidence supports an association claim — not merely that two entities appear in the same record.

## Structural Signal

StructuralSignal measures graph-theoretic importance:

- Centrality metrics
- Community membership
- Path connectivity
- Bridge detection

**Warning**: StructuralSignal is NOT criminal relevance. A node can be structurally important (high centrality) without being criminally relevant.

## Graph Versions

Graphs are versioned snapshots:

- Each version has a parent version
- Projection status indicates completeness
- Versions are created at checkpoints

## Graph Holes

Missing edges or paths in the graph may indicate:

- Missing evidence
- Unresolved entities
- Investigation blind spots
- Data quality issues

Graph holes are detected by analyzing expected vs. actual connectivity.
