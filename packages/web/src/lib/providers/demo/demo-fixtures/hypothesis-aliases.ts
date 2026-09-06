// ============================================================================
// F-PR9 — Reverse Hypothesis: deterministic domain alias dictionary
//
// The observations in Operation Financial Shadow reference entities by their
// readable forms ("Shell One", "intermediary account 0093", "V. Aldridge")
// while canonical names are legal names ("Aldridge Holdings S.A."). This
// dictionary maps visible mentions to canonical entities so the pure
// hypothesis interpreter resolves them deterministically — it documents the
// demo domain's vocabulary, it never invents data.
// ============================================================================

import {
  ENT_BANK,
  ENT_MARIA,
  ENT_SHELL_ONE,
  ENT_SHELL_TWO,
  ENT_VICTOR,
} from "./lookup";

/** Extra aliases merged into the entity catalog (longest alias wins). */
export const HYPOTHESIS_ALIASES: Readonly<Record<string, readonly string[]>> = {
  [ENT_BANK]: [
    "intermediary account 0093",
    "intermediary account",
    "account 0093",
    "mid-account 0093",
    "0093",
  ],
  [ENT_MARIA]: ["maria", "maria castellan"],
  [ENT_SHELL_ONE]: ["aldridge holdings", "aldridge holdings s.a.", "shell one"],
  [ENT_SHELL_TWO]: ["northbridge capital", "northbridge capital ltd.", "shell two"],
  [ENT_VICTOR]: ["victor", "victor aldridge", "v. aldridge"],
};