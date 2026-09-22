// ============================================================================
// PR — INDAGO Cinematic Home Opening · Constants
//
// Every magic number the opening needs — the phase table, per-tier budgets,
// camera, particle tints and sampling parameters — in one deterministic,
// browser-free module. The phase table is the mandatory single source of
// truth the whole timeline reads (no scattered zone literals anywhere).
//
// V3 choreography: the phases are OVERLAPPING windows on the scrub axis, so
// the beats crossfade instead of gluing together. Later phases may begin
// inside earlier ones by design:
//
//   hero           0.00 – 0.12   INDAGO large, sharp, COMPLETELY stable
//   pullback       0.12 – 0.28   the viewer moves away — the word shrinks
//   focusLoss      0.28 – 0.45   the wordmark progressively loses focus
//   disintegration 0.40 – 0.68   glyph structure breaks apart into particles
//   nodeRelease    0.63 – 0.84   those particles separate toward organic slots
//   graphConnect   0.76 – 0.94   edges weave in as the camera pushes in
//   graphResolve   0.90 – 1.00   sharp, clean organic graph — camera settles
// ============================================================================

import type { CinematicQualityTier } from "../cinematic.types";
import type { OpeningPhaseRange } from "../cinematic.types";
import type { OpeningNodeClass } from "./opening.types";

/** Deterministic master seed for the whole opening (graphs, layout, sampling). */
export const OPENING_SEED = 20260821;

/** Force-layout iterations for the organic constellation. */
export const OPENING_LAYOUT_TICKS = 260;
/** Layout fit: the constellation sits inside ±(1 − margin) of the ±1 space.
 *  Kept LOW so the network grows nearly as wide as the words it was born from —
 *  at the final camera push-in it reads as the graph that came OUT of the
 *  letters, not a small central dot. */
export const OPENING_LAYOUT_FIT_MARGIN = 0.42;

/** The ±1 layout box is really ±(1 − fitMargin); invert it for the mapping. */
export const OPENING_LAYOUT_EDGE = 1 - OPENING_LAYOUT_FIT_MARGIN;

/**
 * Target world footprint of the final graph, as a fraction of each VIEWPORT
 * half-extent, shared by the scene's per-axis mapping and the story focus math
 * (the camera keys centre on nodes placed with the SAME fraction). The graph is
 * meant to read as a large sparse network (~50vw wide, ~50vh tall) with
 * substantial negative space — never a small central dot. Because the layout is
 * normalised to ±(1 − fitMargin) on BOTH axes, a node at layout edge (±1) maps
 * to FRACTION × half-extent here.
 */
export const OPENING_GRAPH_VIEW_FRACTION = 0.5;

/** The wordmark text and its reading-order letters. */
export const OPENING_WORDMARK_TEXT = "INDAGO" as const;
export const OPENING_LETTERS: readonly string[] = [
  "I",
  "N",
  "D",
  "A",
  "G",
  "O",
];

// ---------------------------------------------------------------------------
// Mandatory named phase table (single source of truth). These are WINDOWS and
// deliberately overlap: disintegration begins while focus loss is still
// running, node release overlaps disintegration, graph connection starts
// while nodes are still travelling, and the resolve finishes the connect.
// ---------------------------------------------------------------------------
export const OPENING_PHASES: readonly OpeningPhaseRange[] = [
  { name: "hero", start: 0, end: 0.12 },
  { name: "pullback", start: 0.12, end: 0.28 },
  { name: "focusLoss", start: 0.28, end: 0.45 },
  { name: "disintegration", start: 0.4, end: 0.68 },
  { name: "nodeRelease", start: 0.63, end: 0.84 },
  { name: "graphConnect", start: 0.76, end: 0.94 },
  { name: "graphResolve", start: 0.9, end: 1 },
];

/** The disintegration window (glyph → particle), in named progress space. */
export const OPENING_DECOMPOSE_WINDOW = { start: 0.4, end: 0.68 } as const;
/** The release window (nodes travel to their organic slots), in progress space. */
export const OPENING_RELEASE_WINDOW = { start: 0.63, end: 0.84 } as const;
/** The graph connection window (edges weave in), in progress space. */
export const OPENING_EDGE_WINDOW = { start: 0.76, end: 0.94 } as const;

// ---------------------------------------------------------------------------
// Camera. The perceived relationship is ONE continuous dolly: the viewer
// starts close on the wordmark (hero 1.0), pulls away as it loses focus
// (wide 0.62), holds the wide emptiness through the disintegration and the
// start of the release, then slowly pushes BACK IN as the network assembles
// (final 0.9). The DOM wordmark scale mirrors the same zoom, so typography
// and world move as one layer.
// ---------------------------------------------------------------------------
export const OPENING_HERO_ZOOM = 1.0;
export const OPENING_WIDE_ZOOM = 0.62;
export const OPENING_FINAL_ZOOM = 0.9;

// ---------------------------------------------------------------------------
// Art direction (V4). Every shipped choreography value that the calibration
// lab mirrors and the runtime falls back to, in ONE place — the calibration
// defaults import these "from production, never re-declared as literals".
//
// Hierarchy: INDAGO > particle INDAGO > detached particles > nodes > edges >
// labels. Edges stay faded (warm, subordinate); nodes are deliberately LARGE
// at the end and must never be reduced; the release stays outward (no gravity,
// no downward bias, no explosion); labels emerge only at the very end.
// ---------------------------------------------------------------------------

/** Pullback/dolly starts as the word begins to recede (dolly end stays fixed). */
export const OPENING_CAMERA_PULLBACK_START = 0.14;
/** Push-in dolly starts as the released field settles toward the network. */
export const OPENING_CAMERA_PUSHIN_START = 0.66;
/** Gentle but decisive outward release travel (primary motion is outward). */
export const OPENING_RELEASE_SPREAD = 1.6;
/** Subtle seeded curl — an imperfection, NOT a spiral or a bias. */
export const OPENING_RELEASE_CURL = 0.35;
/** Faded, muted warm edges — always subordinate to the luminous nodes. */
export const OPENING_EDGE_OPACITY = 0.22;
/** Labels begin only as the final graph solidifies, then stay sparse. */
export const OPENING_LABEL_START = 0.93;
/** The final network fills a large fraction of the stage. */
export const OPENING_GRAPH_SCALE = 1.3;
/** The final node size — intentionally LARGE; never reduce this. */
export const OPENING_NODE_SCALE = 2.15;

// ---------------------------------------------------------------------------
// GRAPH ZOOM / DEPTH — the final camera dive INTO the formed network.
//
// After the graph resolves (graphScale 1.3, nodeScale 2.15, camera 0.9) the
// last scroll window pushes the camera through the graph: every node carries a
// DETERMINISTIC per-node depth (seed + radial bias → core closer, periphery
// farther), foreground nodes swell and slide outward (parallax) while the
// periphery recedes, and the edges/labels recede so the dive reads as passing
// THROUGH the network, never a flat 2D zoom. All of it is a pure function of
// scroll progress — no rAF, no per-frame state. Every value defaults to the
// phase IDENTITY at the window start (cameraZ 1, plane 1, depth 0) so entering
// the phase is seamless.
// ---------------------------------------------------------------------------

/** The scroll window the dive occupies (shipped 0.94 → 1.00). */
export const OPENING_GRAPH_ZOOM_WINDOW = { start: 0.94, end: 1 } as const;
/** Near-plane distance (the camera dolly): 1 starts ON the graph, <1 dives in. */
export const OPENING_GRAPH_CAMERA_START_Z = 1;
export const OPENING_GRAPH_CAMERA_END_Z = 0.4;
/** World-constant expansion during the dive (1 = the graph as resolved). */
export const OPENING_GRAPH_WORLD_SCALE_START = 1;
export const OPENING_GRAPH_WORLD_SCALE_END = 1.22;
/** How deep the depth chamber reaches into the periphery, as a fraction. */
export const OPENING_GRAPH_DEPTH_START = 0.25;
export const OPENING_GRAPH_DEPTH_END = 1;
/** The near/far extra multipliers on the depth scale (foreground dominates). */
export const OPENING_GRAPH_FOREGROUND_SCALE = 1.2;
export const OPENING_GRAPH_BACKGROUND_SCALE = 0.85;
/** Depth-spread master; 1 = natural distance lerp, <1 flattens 2D, >1 exaggerates. */
export const OPENING_GRAPH_PERSPECTIVE = 1;
/** How strongly depth displaces position outward (the "flying past" parallax). */
export const OPENING_GRAPH_PARALLAX = 0.55;
/** Easing exponent on the window smoothstep (>1 = later settle, slow deliberate). */
export const OPENING_GRAPH_ZOOM_EASE = 1;
/** Global node alpha during the dive (1 = unchanged). */
export const OPENING_GRAPH_ZOOM_OPACITY = 1;
/** Edge alpha during the dive — edges recede as the camera passes through. */
export const OPENING_GRAPH_ZOOM_EDGE_OPACITY = 0.6;
/** Label alpha during the dive — labels stay but step back. */
export const OPENING_GRAPH_ZOOM_LABEL_OPACITY = 0.85;

// ---------------------------------------------------------------------------
// NETWORK RESOLVE — the capstone of the dive: the blurred constellation turns
// into the DEMO network's node design.
//
// In the tail of the graph-zoom dive the soft luminous discs crossfade into
// crisp ringed-body icon nodes (the same entity icons + attention rings the
// workspace graph canvas renders), the near edges read crisp and the far ones
// recede, and a bounded set of entity names resolves alongside the icons. It
// is intentionally SHARED vocabulary (icons via lib/graph/node-icon-path) and
// still pure + deterministic: every persona, ring and depth gate is a function
// of the node id, never of scroll state.
// ---------------------------------------------------------------------------

/** The resolve window lives INSIDE the dive (shipped 0.947 → 0.997), so the
 *  morph rides the already-moving camera — the "slight expansion and zoom". */
export const OPENING_GRAPH_RESOLVE_WINDOW = { start: 0.947, end: 0.997 } as const;
/** Depth threshold reached at full resolve: nodes deeper than this STAY as
 *  glow dust (the far periphery recedes), every nearer node turns into an
 *  icon circle. */
export const OPENING_NETWORK_DEPTH_CAP = 0.54;
/** Where the icon resolution begins (only the deepest foreground nodes). */
export const OPENING_NETWORK_DEPTH_CAP_START = 0.3;
/** Width of the soft depth gate around the cap (smoothstep ramp). */
export const OPENING_NETWORK_DEPTH_FEATHER = 0.08;
/** Disc crossfade: how far a resolved node's glow disc dims under the icon. */
export const OPENING_NETWORK_DISC_FADE = 0.06;
/** Icon body radius as a fraction of the particle disc radius. */
export const OPENING_NETWORK_BODY_SCALE = 0.62;
/** Icon glyph half-size as a fraction of the body radius. */
export const OPENING_NETWORK_ICON_SCALE = 0.78;
/** Deterministic share of resolved nodes wearing each attention ring. */
export const OPENING_NETWORK_RING_CONTRADICTED = 0.045;
export const OPENING_NETWORK_RING_GAP = 0.11;
/** Opacity ceiling for the deterministic attention rings. */
export const OPENING_NETWORK_RING_OPACITY = 0.85;
/** Cap on the mini entity-name labels shown over the resolved network. */
export const OPENING_NETWORK_MAX_LABELS = 12;
/** Edge alpha restyle: how far the FAR edge midpoint dims at full resolve. */
export const OPENING_NETWORK_EDGE_FAR_DIM = 0.75;
/** Size multiplier for the resolved DOM icon circles (1 = the dived disc size;
 *  shipped 1.25 reads BIG clear nodes over the glow dust, tunable in the lab). */
export const OPENING_NETWORK_NODE_SIZE = 1.25;
/** Exponent on the resolve-window smoothstep: >1 weights the morph toward the
 *  window's END (nodes stay blurred, then snap in hard); <1 starts earlier. */
export const OPENING_NETWORK_RESOLVE_EASE = 1;
/** Cap on the icon-to-icon links drawn once both endpoints resolve. */
export const OPENING_NETWORK_MAX_HOLES = 4;
/** Opacity ceiling for the amber dashed gap badges (the demo's '?' graphs). */
export const OPENING_NETWORK_HOLE_OPACITY = 0.7;

/** Deterministic fiction personas for the resolved icon nodes, grouped by
 *  class. The strings deliberately contain the SAME icon keywords the shared
 *  `getNodeIconPath` resolves, so core reads as accounts, bridges as
 *  companies/agencies, secondary as persons and periphery as locations,
 *  phones or documents — exactly the demo network's icon grammar. */
export const OPENING_NETWORK_LABEL_POOL: Readonly<Record<
  OpeningNodeClass,
  readonly string[]
>> = {
  core: [
    "BANK ATLANTIC VAULT",
    "NORTHSTAR ACCOUNT",
    "OFFSHORE ACCOUNT 0093",
    "CASTELLAN BANK",
    "MIXING VAULT",
    "GOLDEN GATE WALLET",
  ],
  bridge: [
    "JAI ALAI HOLDINGS",
    "ROYAL TRANSIT LTD",
    "CRESTFIELD CORP",
    "CALLAHAN ASSOCIATION",
    "FBI · SOCTF LIAISON",
    "SOUTHERN STATE AUTHORITY",
  ],
  secondary: [
    "VICTOR ALDRIDGE",
    "MARIA SANTOS",
    "JOHN CASTELLAN",
    "DOWD",
    "FORRESTER",
    "WHEELER",
    "RICO ORTEGA",
    "CALLAHAN",
    "MCGUIGAN",
    "HITMAN 33",
  ],
  peripheral: [
    "LOCATION: SOUTHERN HILLS",
    "ADDRESS: CHURCH STREET",
    "PHONE +91 98 000 9471",
    "SIM REGISTRY",
    "DOCUMENT: AIRWAYS FILING",
    "RECORD 0471",
    "FILING: FERRY EVIDENCE",
    "LOCATION: NORTHSTAR PIER",
  ],
};

// ---------------------------------------------------------------------------
// Per-tier budgets. The final graph must be sparse and elegant: a modest ring
// of meaningful relationships over ~100-ish nodes, with significant negative
// space. The node budgets stay generous (the letters need density to remain
// recognisable). Edge budgets match the CONNECTED-WEB design: mid sits at the
// tier's surviving master-edge ceiling (spines + interleaved chords), so the
// resolved icon graph is a woven triangle network (avg degree ~2.4) — never
// the old disjoint-matching dust that read as floating pairs.
// ---------------------------------------------------------------------------
export interface OpeningTierBudget {
  readonly nodesMin: number;
  readonly nodesMax: number;
  readonly nodesMid: number;
  readonly edgesMin: number;
  readonly edgesMax: number;
  readonly edgesMid: number;
  readonly labelsMax: number;
}

export const OPENING_TIER_BUDGETS: Readonly<
  Record<CinematicQualityTier, OpeningTierBudget>
> = {
  high: {
    nodesMin: 130,
    nodesMax: 178,
    nodesMid: 156,
    edgesMin: 154,
    edgesMax: 156,
    edgesMid: 230,
    labelsMax: 3,
  },
  medium: {
    nodesMin: 104,
    nodesMax: 142,
    nodesMid: 124,
    edgesMin: 122,
    edgesMax: 124,
    edgesMid: 185,
    labelsMax: 2,
  },
  mobile: {
    nodesMin: 76,
    nodesMax: 104,
    nodesMid: 90,
    edgesMin: 88,
    edgesMax: 90,
    edgesMid: 134,
    labelsMax: 1,
  },
  "reduced-motion": {
    nodesMin: 50,
    nodesMax: 72,
    nodesMid: 62,
    edgesMin: 60,
    edgesMax: 62,
    edgesMid: 91,
    labelsMax: 1,
  },
};

/** Master node pool size — the largest tier draws a prefix of this. */
export const OPENING_MASTER_NODE_COUNT = 180;

/**
 * Glyph-particle field size per tier. This is the number of particles sampled
 * from the whole-word mask (and rendered as the wordmark). It is deliberately
 * LARGER than the graph node budget: the FIRST `nodes.length` particles carry
 * the persistent node identity and become the graph, the rest are glyph-only
 * dust that fades as the network takes over. ~320–480 tiny points are what
 * actually traces a readable INDAGO (the old ~26 per letter read as scatter).
 */
export const OPENING_PARTICLE_COUNT: Readonly<Record<CinematicQualityTier, number>> = {
  high: 420,
  medium: 320,
  mobile: 240,
  "reduced-motion": 160,
};

/** Node radius in world units at zoom 1. Tuned so the soft sprite renders at
 *  ~2–4 CSS px — the previous 0.018–0.03 rendered 9–25 px discs whose halos
 *  merged into unreadable blobs. */
export const OPENING_CLASS_SIZE: Readonly<Record<OpeningNodeClass, number>> = {
  core: 0.012,
  secondary: 0.0105,
  bridge: 0.009,
  peripheral: 0.0075,
};
export const OPENING_NODE_SIZE_JITTER = 0.2;

/** Hard cap on the per-particle GPU scale (aScale). The dissolve "blur swell"
 *  multiplies the sprite, but never beyond this — art-directed at 2.16 so the
 *  mid-disintegration haze can swell generously without any point ever
 *  ballooning into a solid disc. */
export const OPENING_POINT_SCALE_MAX = 2.16;

/**
 * Shipped particle-size ramp (visual choreography, not a mapping). The global
 * default 1.0 holds while the word is still sharp; once the glyphs decompose
 * the particles grow deliberately — subtle through the INDAGO-overlap (1.57),
 * then a confident climb into the final graph (3.25). The small steady climb is
 * intentional: it is NEVER flattened into one size. Piecewise-linear between
 * the keys so a reversible scrub never pops.
 */
export const OPENING_PARTICLE_SIZE_RAMP: readonly {
  readonly at: number;
  readonly size: number;
}[] = [
  { at: 0.4, size: 1 },
  { at: 0.5, size: 1.57 },
  { at: 0.7, size: 1.57 },
  { at: 0.8, size: 2.37 },
  { at: 0.9, size: 3.25 },
  { at: 1, size: 3.25 },
];

/**
 * Per-class base brightness: the graph reads with a clear hierarchy — the core
 * knot brighter and larger, secondary moderate, peripherals faint.
 */
export const OPENING_CLASS_ALPHA: Readonly<Record<OpeningNodeClass, number>> = {
  core: 1,
  secondary: 0.82,
  bridge: 0.72,
  peripheral: 0.58,
};

/** Palette: warm neutrals over the near-black backdrop. */
export const OPENING_PARTICLE_TINT = "#bba68c";
export const OPENING_CORE_TINT = "#e6ceae";
export const OPENING_ROSE_TINT = "#c98f8a";
export const OPENING_EDGE_TINT = "#8a7e6d";
export const OPENING_BACKDROP_HEX = "#0a0908";

/** Raster sampling: a pixel counts as glyph when its alpha exceeds this. */
export const OPENING_GLYPH_ALPHA_THRESHOLD = 40;
/** Sampling upscale (raster is scaled, then sampled at device-less units). */
export const OPENING_GLYPH_SAMPLE_SCALE = 1.6;
/** Target raster widths (independent of DPR) for desktop vs mobile. */
export const OPENING_GLYPH_SAMPLE_PX = { desktop: 1800, mobile: 1200 } as const;

/** Max frames to defer sampling while the wordmark font is still loading;
 *  beyond this we sample anyway (better than a silent black screen), logging
 *  in debug mode so a broken @font-face is never mistaken for alignment. */
export const OPENING_FONT_MAX_ATTEMPTS = 30;

/** Reduced-motion static edge opacity (network present, calm). */
export const OPENING_EDGE_FALLBACK_ALPHA = 0.7;
/** Reduced-motion static label opacity. */
export const OPENING_LABEL_FALLBACK_ALPHA = 0.6;

/** The final-graph fiction label anchors, in order. Emerge only at the end. */
export const OPENING_LABEL_POOL = [
  "Rohan Singh",
  "ORX-102",
  "NORTHSTAR",
] as const;
/** Final label opacity ceiling. */
export const OPENING_LABEL_OPACITY = 0.62;
