<!-- INTERNAL PILOT EVALUATION · SYNTHETIC / DE-IDENTIFIED CORPUS · PROTOTYPE BENCHMARK -->
<!-- generated 2026-01-01T00:00:00.000Z; light-mode=false; deterministic seeded corpus; not a production/field/independent claim -->


# INDAGO Prototype Pilot Benchmark — Artifact Index

This directory contains output from the **internal prototype pilot evaluation**.
Every artifact is generated deterministically from the same seeded synthetic
corpus; nothing here should be read as production, field, or third-party
validation.

| Artifact | Contents |
| --- | --- |
| `manifest.json` | Run metadata + SHA-256 content hashes of every artifact (reproducibility) |
| `summary.json` | Full machine-readable summary (all conditions + per-case metrics) |
| `condition-summary.md` | Side-by-side CLEAN / NOISY_MISSING / ADVERSARIAL indicator table |
| `viability.md` | 12-section internal viability assessment |
| `per-case/*.json` | Raw metric families for each case / condition |

## Run scope
- Generated at (analyst-supplied, not wall-clock): `2026-01-01T00:00:00.000Z`
- Light-mode (subset): `false`
- Conditions evaluated: CLEAN (15 cases), NOISY_MISSING (15 cases), ADVERSARIAL (15 cases)
