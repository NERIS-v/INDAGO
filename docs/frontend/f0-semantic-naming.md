# F0-08: Customer-Facing Intelligence Semantic Naming

> **Status:** F0-08 ✅ (created as the F-PR1 / F0-08 naming reference)
> **Purpose:** the canonical customer-facing vocabulary for INDAGO's intelligence surfaces.
> It is **documentation only** — it does not define new intelligence semantics. It re-states,
> for the UI, the semantics already established by `docs/frontend/frontend-development-plan.md` (§11
> scoring semantics, §15 page specs), `docs/roadmap/development-plan.md`, and the canonical
> `@indago/contracts` score types (`AnalyticalConfidence`, `ResolutionScore`,
> `StructuralSignal`, `EvidenceStrength`, `RobustnessScore`, `RoleSignal`,
> `RelationSupport`, `ExpectedInformationGain`).
>
> **Golden rule:** the UI must never overstate. Where a value is analytical confidence,
> never present it as probability, certainty, or likelihood of wrongdoing.

---

## Confidence

- **Canonical UI wording:** "Confidence" · `AnalyticalConfidence` · "Confidence: 0.82, on a scale from zero to one"
- **Meaning:** a model-output confidence on the closed interval `[0, 1]`.
- **What it communicates:** how strongly the model's own output supports a claim — a ranking signal, not a ground-truth measure.
- **What it MUST NOT imply:** probability, certainty, or likelihood of guilt.
- **Example UI phrasing:** "Confidence 0.62" with a restrained static bar; accessible label *"Confidence: 0.62, on a scale from zero to one; analytical confidence, not a probability."*
- **Wording to avoid:** "82% chance", "82 percent probability", "certain", "confirmed".

---

## Lead

- **Canonical UI wording:** "Investigative Lead" · "Lead"
- **Meaning:** an investigative hypothesis or signal that requires evaluation.
- **What it communicates:** a line of inquiry to examine further.
- **What it MUST NOT imply:** a conclusion or an accusation.
- **Example UI phrasing:** a lead statement shown first, with confidence and evidence context below it ("X may be connected to Y through …").
- **Wording to avoid:** "culprit", "responsible party", "this is the cause".

---

## Gap

- **Canonical UI wording:** "Gap" · "Investigative Gap" · "Graph Hole"
- **Meaning:** a missing or uncertain relationship, entity, or piece of evidence. (A `GraphHole` is structural; an `InvestigativeGap` is a classified domain gap. Keep them distinct.)
- **What it communicates:** what is unknown and why it matters.
- **What it MUST NOT imply:** proof that something happened.
- **Example UI phrasing:** "No evidence connects entity A to entity B; a relationship is missing."
- **Wording to avoid:** "A committed the act", "the connection is hidden".

---

## Evidence

- **Canonical UI wording:** "Evidence" · "Source"
- **Meaning:** source material that supports the investigation.
- **What it communicates:** the raw material and where it came from.
- **What it MUST NOT imply:** that the material's interpretation is fact.
- **Distinguish source/provenance from interpretation:** the source is *where it originated*; the interpretation is *what INDAGO infers from it*. The UI shows both but does not merge them.
- **Example UI phrasing:** an evidence row annotated with a source reference (ProvenanceChip) and a strength value.
- **Wording to avoid:** labeling an interpretation as "the evidence proves …".

---

## Evidence for

- **Canonical UI wording:** "Evidence for" · "Supporting"
- **Meaning:** source material that supports a lead or hypothesis.
- **What it communicates:** what strengthens the current hypothesis.
- **What it MUST NOT imply:** that the hypothesis is therefore true.
- **Example UI phrasing:** an "Evidence for" column listing supporting rows with sources.
- **Wording to avoid:** "proof", "confirms the lead".

---

## Evidence against

- **Canonical UI wording:** "Evidence against" · "Counter-evidence"
- **Meaning:** source material that weakens or challenges a lead or hypothesis.
- **What it communicates:** what contradicts or casts doubt.
- **What it MUST NOT imply:** that the hypothesis is therefore false.
- **Example UI phrasing:** an "Evidence against" column given equal visual weight to "Evidence for".
- **Wording to avoid:** "disproves", "the lead is false".

---

## Alternative explanation

- **Canonical UI wording:** "Alternative explanation" · "Alternative"
- **Meaning:** a plausible competing interpretation that could also explain the observations.
- **What it communicates:** that the current hypothesis is not the only one.
- **What it MUST NOT imply:** that an alternative is a conclusion, or that one is favored over another without support.
- **Example UI phrasing:** an "Alternative explanations" panel listing competing hypotheses.
- **Wording to avoid:** "the real explanation", "the only reason".

---

## Robustness

- **Canonical UI wording:** "Robustness" · `RobustnessScore` · "Robustness Report"
- **Meaning:** the resilience of an analytical result under defined perturbations (e.g. `[0,100]` perturbation-stability count).
- **What it communicates:** how stable the conclusion is when inputs or assumptions vary.
- **What it MUST NOT imply:** a probability of truth.
- **Example UI phrasing:** "Robustness 87/100 — stable across N perturbations", explained in text, not a scoreboard.
- **Wording to avoid:** "87% true", "certain".

---

## Resolution

- **Canonical UI wording:** "Resolution" · `ResolutionScore`
- **Meaning:** an entity-resolution decision and its supporting confidence.
- **What it communicates:** whether two candidate identities were merged or kept separate, and how strongly.
- **What it MUST NOT imply:** that the merged identity is certain.
- **Example UI phrasing:** "Confirm Merge / Keep Separate" with equal visual weight, plus the resolution confidence.
- **Wording to avoid:** "these are the same person (certain)".

---

## Provenance

- **Canonical UI wording:** "Provenance" · "Source"
- **Meaning:** where information originated and how it traces back to its source.
- **What it communicates:** origin and traceability, in a technical (mono) presentation.
- **What it MUST NOT imply:** that the source's content is authoritative truth.
- **Example UI phrasing:** a `ProvenanceChip` with a source id and reference ("cdr-export-tel-a · rec-118").
- **Wording to avoid:** implying a source is "verified true" when only origin is shown.

---

## Structural signal

- **Canonical UI wording:** "Structural signal" · `StructuralSignal`
- **Meaning:** a graph/relationship pattern (graph-theoretic importance).
- **What it communicates:** that a pattern exists in the graph and ranks by importance.
- **What it MUST NOT imply:** criminal relevance or proof of wrongdoing.
- **Example UI phrasing:** a node/edge emphasized for its structural role, with a note that it is a structural pattern, not a finding of fact.
- **Wording to avoid:** "this pattern proves the network is fraudulent".

---

## Summary table

| Term | Canonical wording | Communicates | MUST NOT imply |
|---|---|---|---|
| Confidence | `AnalyticalConfidence`, "Confidence" | model-output strength on [0,1] | probability, certainty, guilt |
| Lead | "Investigative Lead" | hypothesis/signal to evaluate | conclusion, accusation |
| Gap | "Gap" / `InvestigativeGap` / `GraphHole` | missing/uncertain relationship or evidence | proof something happened |
| Evidence | "Evidence" / "Source" | source material | interpretation is fact |
| Evidence for | "Evidence for" / "Supporting" | what supports a hypothesis | the hypothesis is true |
| Evidence against | "Evidence against" / "Counter-evidence" | what challenges a hypothesis | the hypothesis is false |
| Alternative explanation | "Alternative explanation" | plausible competing interpretation | the only reason / a conclusion |
| Robustness | `RobustnessScore`, "Robustness" | resilience under perturbations | truth probability |
| Resolution | `ResolutionScore`, "Resolution" | entity decision + confidence | identity certainty |
| Provenance | "Provenance" / "Source" | origin and traceability | source is authoritative truth |
| Structural signal | `StructuralSignal` | graph/relationship pattern | proof of wrongdoing |