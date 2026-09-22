// ============================================================================
// PR — INDAGO Cinematic Home Story Act · Constants
//
// The twelve "shots" the story act cuts through, as pure numbers: the section
// lengths the wrapper reserves (svh), the 13-key camera polyline (each section
// interpolates key[i] → key[i+1] over its FIRST STORY_CAMERA_ARRIVE fraction,
// then holds), and every window the pair/edge/hole drivers open on. Nothing
// here touches the DOM, GSAP or three — the whole arc is a function of the
// story scroll fraction, so the suite can freeze it byte-for-byte.
// ============================================================================

/** The twelve story beats (copy + camera sections). */
export const STORY_SECTION_COUNT = 12;

/**
 * Reserved scroll DISTANCE (in svh) per beat, in beat order. Beat 11 (cross-
 * case) is the shortest line the brief ships; beat 12 (closing) is the longest
 * hold because it carries the four tags, the statement and the CTA. The sum is
 * what `--cinematic-story-length` must equal in cinematic.css.
 */
export const STORY_SECTION_LENGTHS_SVH: readonly number[] = [
  130, // 1  formation    — graph resolves, cluster rises
  130, // 2  emerge       — the candidate pair separates
  150, // 3  possible match — sideling + merge to midpoint
  130, // 4  edge         — one link rack-focused
  120, // 5  quiet        — sustained single line, beat 6 headline lands
  150, // 6  centre       — back to origin, no dim
  160, // 7  gap          — the amber hole digs open
  130, // 8  evidence     — the gap's evidence beat
  140, // 9  lead         — strongest dim, the candidate edges
  120, // 10 time         — conceptual ranges only
  100, // 11 cross-case   — shortest line of the act
  170, // 12 resolution   — tags, statement, CTA (longest hold)
];

/** Total reserved story distance (svh) — the sum of the twelve sections. */
export const STORY_TOTAL_LENGTH_SVH = STORY_SECTION_LENGTHS_SVH.reduce(
  (sum, length) => sum + length,
  0,
);

/** The CSS custom property the wrapper sets from STORY_TOTAL_LENGTH_SVH. */
export const STORY_SCROLL_CSS_VAR = "--cinematic-story-length";
/** Its production default (must equal STORY_TOTAL_LENGTH_SVH in cinematic.css). */
export const STORY_SCROLL_CSS_DEFAULT = `${STORY_TOTAL_LENGTH_SVH}svh`;

/**
 * Fraction of each section spent ARRIVING at the next camera key (smoothstepped
 * over the first 45%, then the key HOLDS for the rest of the section). The hold
 * is what gives every beat a stable reading frame — the camera never creeps
 * while the headline is on screen.
 */
export const STORY_CAMERA_ARRIVE = 0.45;

/** Where the pair nodes begin sideling toward their midpoint (beat 3, local). */
export const STORY_MERGE_WINDOW = { start: 0.4, end: 0.68 } as const;
/** World-fraction distance each pair node covers toward the midpoint (0.65×). */
export const STORY_MERGE_DISTANCE = 0.65;

/** Where the amber hole opens (beat 7, local), then holds 1 across beats 8–12. */
export const STORY_HOLE_WINDOW = { start: 0.55, end: 0.75 } as const;

/** Which bundle.edges INDEX carries each emphasis slot (draw-order pick). */
export const STORY_EDGE_PICK_A = 0.4;
export const STORY_EDGE_PICK_B = 0.65;

/** The 8×6 sparse-cell grid the gap beat digs into (hole cell → midpoint). */
export const STORY_HOLE_GRID_COLS = 8;
export const STORY_HOLE_GRID_ROWS = 6;

/** The ordered camera-centre sources the story act visits (one per key). */
export type StoryCameraCenterSource =
  | "origin"
  | "cluster"
  | "pair"
  | "edgeA"
  | "hole"
  | "leadEdge"
  | "edgeB";

/** One camera key: a zoom + spotlight falloff + which focus anchor it centres on. */
export interface StoryCameraKey {
  /** Where the orthographic centre points this key (focus anchor in fraction space). */
  readonly source: StoryCameraCenterSource;
  /** Camera zoom (multiplies the world; 0.9 = the intro's handoff frame). */
  readonly zoom: number;
  /** Radius of the lit region, in centre-fraction units (≥1 covers the field). */
  readonly dimRadius: number;
  /** Brightness floor OUTSIDE the lit region (1 = no dimming at all). */
  readonly dimFloor: number;
}

/**
 * The 13-key camera polyline. Section i (0-based) interpolates
 * STORY_CAMERA_KEYS[i] → [i+1] over its first STORY_CAMERA_ARRIVE fraction,
 * then holds [i+1] to the section end — so section boundaries are continuous
 * and K0 is the intro's exact handoff identity (centre 0, zoom 0.9, no dim).
 */
export const STORY_CAMERA_KEYS: readonly StoryCameraKey[] = [
  { source: "origin", zoom: 0.9, dimRadius: 1, dimFloor: 1 }, // 0 handoff
  { source: "cluster", zoom: 1.2, dimRadius: 1, dimFloor: 1 }, // 1 cluster rises
  { source: "cluster", zoom: 1.3, dimRadius: 1, dimFloor: 1 }, // 2 cluster nudge
  { source: "pair", zoom: 1.9, dimRadius: 0.1, dimFloor: 0.28 }, // 3 pair closest
  { source: "edgeA", zoom: 1.35, dimRadius: 0.4, dimFloor: 0.5 }, // 4 edge rack
  { source: "edgeA", zoom: 1.35, dimRadius: 0.4, dimFloor: 0.5 }, // 5 quiet hold
  { source: "origin", zoom: 0.75, dimRadius: 1, dimFloor: 0.6 }, // 6 centre wide
  { source: "hole", zoom: 1.55, dimRadius: 0.05, dimFloor: 0.45 }, // 7 hole
  { source: "hole", zoom: 1.55, dimRadius: 0.05, dimFloor: 0.45 }, // 8 hole hold
  { source: "leadEdge", zoom: 1.95, dimRadius: 0.03, dimFloor: 0.3 }, // 9 lead
  { source: "edgeB", zoom: 1.6, dimRadius: 0.08, dimFloor: 0.35 }, // 10 time
  { source: "origin", zoom: 0.9, dimRadius: 0.5, dimFloor: 0.6 }, // 11 centre back
  { source: "origin", zoom: 0.57, dimRadius: 1, dimFloor: 0 }, // 12 resolution
];

/** The crossfade window (local) in which the quiet beat swaps edgeA → edgeB. */
export const STORY_EDGE_MIX_WINDOW = { start: 0.2, end: 0.8 } as const;

/** Emphasis rise windows (local) per emphasis beat: emerge, edge, quiet, time. */
export const STORY_EMPHASIS_WINDOWS: Readonly<
  Record<number, { readonly start: number; readonly end: number }>
> = {
  2: { start: 0.1, end: 0.4 }, // emerge (edgeA)
  4: { start: 0.1, end: 0.4 }, // edge (edgeA)
  5: { start: 0.1, end: 0.5 }, // quiet (crossfading)
  10: { start: 0.1, end: 0.5 }, // time (edgeB)
};

/** The em amplitude (0→1) the edge tint rides on — `alpha × (1 + 0.6·w)`. */
export const STORY_EDGE_EMPHASIS_GAIN = 0.6;
