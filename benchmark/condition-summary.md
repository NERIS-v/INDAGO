<!-- INTERNAL PILOT EVALUATION · SYNTHETIC / DE-IDENTIFIED CORPUS · PROTOTYPE BENCHMARK -->
<!-- generated 2026-01-01T00:00:00.000Z; light-mode=false; deterministic seeded corpus; not a production/field/independent claim -->


# Condition Summary — Prototype Pilot Evaluation

Table values are deterministic aggregates over regenerated engine output.
ERR@K uses K = 3 (reciprocal rank of the first hole-hitting candidate, worst-case
0). FPR proxy = qualified candidates / detector pair-evaluations
(documentation-driven true-negative stand-in — NOT a calibrated rate).

| Condition     | Cases | Holes hit | Hit rate | Strict hit | ERR@3 | Robustness | Cand. prec. | FPR proxy | Ent. recall@1 | Rel. recall | Class. cover | Hard fails |
| ------------- | ----- | --------- | -------- | ---------- | ----- | ---------- | ----------- | --------- | ------------- | ----------- | ------------ | ---------- |
| CLEAN         | 15    | 3/8       | 37.5%    | 37.5%      | 16.7% | 100.0%     | 20.0%       | 1.4%      | 89.1%         | 56.6%       | 20.0%        | 0          |
| NOISY_MISSING | 15    | 2/8       | 25.0%    | 25.0%      | 10.0% | 100.0%     | 13.3%       | 4.0%      | 80.0%         | 58.5%       | 13.3%        | 0          |
| ADVERSARIAL   | 15    | 1/8       | 12.5%    | 12.5%      | 6.7%  | 100.0%     | 6.7%        | 4.4%      | 73.9%         | 54.5%       | 6.7%         | 0          |

## Raw indicator detail

CLEAN: 3/3 strict, ENT recall=89.1%, REL precision=86.7%, observation coverage=100.0%
NOISY_MISSING: 2/2 strict, ENT recall=80.0%, REL precision=86.7%, observation coverage=100.0%
ADVERSARIAL: 1/1 strict, ENT recall=73.9%, REL precision=86.7%, observation coverage=100.0%
