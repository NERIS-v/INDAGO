// ============================================================================
// Real-Case Registry — PASS 1 (INDAGO_REAL_CASE_EXTRACTION_SPEC §2)
//
// Namespace + anchor constants for the two SPOT-case workspaces and the
// supporting namespaces. Every concrete fixture id is derived by hashing the
// namespace together with a `family:slug` key (see lookup.ts), so:
//
//   id = deterministicUuid(`${NS}:${key}`)
//
// mirrors the spec's `deterministicUuid(NS, key)` two-part form while keeping
// the demo hasher (single-seed FNV-1a) untouched.
//
// Namespaces (locked in the extraction spec §2):
//   NS_CASE_A       6a1c4a6a-0000-4000-8000-0000000000a1  (Callahan- Massachusetts/
//                                                           Connecticut probe)
//   NS_CASE_B       6a1c4a6b-0000-4000-8000-0000000000b1  (Tulsa / Roger Wheeler)
//   NS_SHARED       6a1c4a6c-0000-4000-8000-0000000000c1  (bridge families E1/E2/E4/E9)
//   NS_BREAKTHROUGH 6a1c4a6c-0000-4000-8000-0000000000c2  (fenced expansion row sets)
//   NS_COUNTER      6a1c4a6c-0000-4000-8000-0000000000c3  (counter-evidence package)
//   NS_DEMO         6a1c4a6c-0000-4000-8000-0000000000c4  (flow-only demo rows)
//
// HARD-WALL ISOLATION: real-case ids MUST NOT collide with the Operation
// Financial Shadow namespace (b1e0c9a6-*). validate.ts asserts this.
// ============================================================================

/** World Jai Alai / Callahan-era Connecticut probe (extraction spec §11). */
export const NS_CASE_A = "6a1c4a6a-0000-4000-8000-0000000000a1";

/** Tulsa / Roger Wheeler homicide probe (extraction spec §12). */
export const NS_CASE_B = "6a1c4a6b-0000-4000-8000-0000000000b1";

/** Bridge families shared identically by both workspaces (E1/E2/E4/E9). */
export const NS_SHARED = "6a1c4a6c-0000-4000-8000-0000000000c1";

/** Fenced expansion inputs for PASS 2+ compute (Exhibit 719, hearsay chain, S1).
 *  Physically present in the repo but NEVER ingested by every `INITIAL_*`
 *  fixture set in PASS 1. */
export const NS_BREAKTHROUGH = "6a1c4a6c-0000-4000-8000-0000000000c2";

/** Fenced counter-evidence records (C1–C4). Not fed to initial computation. */
export const NS_COUNTER = "6a1c4a6c-0000-4000-8000-0000000000c3";

/** Demonstrated flow-only rows (inverse-hidden relationships etc.). */
export const NS_DEMO = "6a1c4a6c-0000-4000-8000-0000000000c4";

// ============================================================================
// Anchors (slug ⇄ canonical id)
// ============================================================================

export const CASE_A_SLUG = "case:connecticut-jai-alai";
export const CASE_B_SLUG = "case:tulsa-wheeler";

export const INVESTIGATION_A_SLUG = "invest:ct-soctf-licensing";
export const INVESTIGATION_B_SLUG = "invest:tulsa-homicide-unit";

/** The set of slugs that route to demo-provider workspaces in demo/auto mode. */
export const REAL_CASE_SLUGS = [
  CASE_A_SLUG,
  CASE_B_SLUG,
] as const;

/** Canonical case ids (resolved in lookup.ts from `case:${slug}`) accepted as
 *  demo-served in demo/auto mode. Composed in lookup.ts to keep the registry
 *  dependency-free. */