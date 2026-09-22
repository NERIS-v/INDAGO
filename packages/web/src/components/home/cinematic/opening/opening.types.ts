// ============================================================================
// PR — INDAGO Cinematic Home Opening · Types
//
// The visual reconstruction: a large HTML wordmark, sampled into particles,
// whose SAME persistent nodes dissolve into a sparse organic graph. This file
// owns the opening-specific data contracts (bundle, wordmark sampling, word
// layout, pose stream, interaction runtime) so the pure modules below share
// one vocabulary. Framework-agnostic — no React, no three, no GSAP.
// ============================================================================

import type {
  CinematicInteractionMode,
  CinematicQualityTier,
  OpeningCameraState,
  OpeningPhaseName,
  OpeningWordmarkCues,
} from "../cinematic.types";

/** Structural class of a node in the opening graph (drives size + tint). */
export type OpeningNodeClass = "core" | "secondary" | "bridge" | "peripheral";

export interface OpeningNodeDefinition {
  readonly id: string;
  readonly class: OpeningNodeClass;
  readonly index: number;
  /** Organic layout position (normalized ±1). */
  readonly nx: number;
  readonly ny: number;
  /** World size at zoom 1 (≈ CSS px this node renders at). */
  readonly size: number;
  /** When this node breaks away from the letters (stagger anchor): a fraction
   *  in progress space that paces the node-by-node departure + travel INSIDE
   *  the release window. Before its anchor the node holds its glyph position
   *  in place through the whole dissolve. */
  readonly decomposeStart: number;
  /** When this node re-emerges inside the release window (0..1). */
  readonly releaseStart: number;
  /** Deterministic drift phase (radians) for the subtle ambient motion. */
  readonly phase: number;
  /** Ambient drift amplitude in world units. */
  readonly driftAmplitude: number;
  /** Accent tint flag (rose) for a handful of nodes (≤ ~5%). */
  readonly accent: number;
}

export interface OpeningEdgeDefinition {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly sourceIndex: number;
  readonly targetIndex: number;
  /** Draw-order slot inside the single line buffer. */
  readonly slot: number;
  /** Where this edge starts forming on the progress axis (0..1). */
  readonly formationStart: number;
}

export interface OpeningGraphBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** The persistent graph: one deterministic constellation per quality tier. */
export interface OpeningGraphBundle {
  readonly tier: CinematicQualityTier;
  readonly seed: number;
  readonly nodes: readonly OpeningNodeDefinition[];
  readonly edges: readonly OpeningEdgeDefinition[];
  readonly bounds: OpeningGraphBounds;
}

/** One sampled particle position in WHOLE-WORD space (normalized 0..1).
 *  fx: 0 = left edge of the whole word's ink box, 1 = right edge.
 *  fy: 0 = bottom edge of the ink box, 1 = top edge.
 *  `letter` is a reading-order tag for coverage tests / debug ONLY — it is NOT
 *  a coordinate space; every point is already normalized against the whole
 *  word, so there is exactly ONE point space for the whole wordmark. */
export interface OpeningGlyphPoint {
  readonly letter: number;
  readonly fx: number;
  readonly fy: number;
}

/** One letter's horizontal span inside the whole-word raster (raster px). */
export interface OpeningLetterRange {
  readonly letter: number;
  readonly x0: number;
  readonly x1: number;
}

/** Geometry of the ONE whole-word raster the point field was sampled from. */
export interface OpeningWordmarkRaster {
  /** Scaled font size the word was rasterized at (raster px per em). */
  readonly scaledFontPx: number;
  /** Raster padding around the word box. */
  readonly pad: number;
  /** Raster row of the alphabetic baseline. */
  readonly baselineY: number;
  /** Total advance of the whole word incl. letter-spacing (raster px). */
  readonly totalAdvance: number;
  readonly inkX0: number;
  readonly inkX1: number;
  readonly inkY0: number;
  readonly inkY1: number;
  readonly ascentEm: number;
  readonly descentEm: number;
  /** Per-letter horizontal spans (coverage tests + debug readout only). */
  readonly letterRanges: readonly OpeningLetterRange[];
}

/** The whole-word sample: ONE normalized point field + its raster metrics. */
export interface OpeningGlyphSample {
  readonly points: readonly OpeningGlyphPoint[];
  readonly word: OpeningWordmarkRaster;
}

/** One letter's live box (H1-relative px), measured from the DOM spans.
 *  DEBUG ONLY: used by the dev overlay's 50%-alignment readout, never by the
 *  particle mapping (which is whole-word and reads the H1 box directly). */
export interface OpeningLetterBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Measured DOM wordmark box plus the stage px→world conversion. */
export interface OpeningWordmarkMeasurement {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly pxToWorld: number;
  /** Optional live per-letter boxes for the dev alignment readout only. */
  readonly letterBoxes?: readonly OpeningLetterBox[];
}

/** The composed world layout: every particle gets a glyph anchor + motion
 *  state. The field is sized to the PARTICLE count (which may exceed the graph
 *  node count); the first `nodes.length` particles become graph nodes, the rest
 *  are glyph-only dust that fades as the graph takes over. */
export interface OpeningWordmarkLayout {
  readonly glyphX: Float32Array;
  readonly glyphY: Float32Array;
  readonly letter: Uint8Array;
  /** Per-particle world radius (graph nodes carry their class size; dust a
   *  peripheral size). */
  readonly size: Float32Array;
  /** Per-particle base alpha (from the node class; dust = peripheral). */
  readonly classAlpha: Float32Array;
  /** 1 when this particle becomes a graph node, 0 when it is glyph-only dust. */
  readonly bound: Uint8Array;
  /** Per-particle departure anchor (fraction, 0..1): when each particle leaves
   *  the letters and starts its outward crack / travel. */
  readonly start: Float32Array;
  readonly curveX: Float32Array;
  readonly curveY: Float32Array;
  readonly word: OpeningWordmarkRaster;
  readonly measurement: OpeningWordmarkMeasurement;
  readonly bounds: OpeningGraphBounds;
}

/** One mutable pose row consumed by the DOM label layer on a slow cadence. */
export interface OpeningPoseRow {
  readonly nodeIndex: number;
  readonly text: string;
  worldX: number;
  worldY: number;
  alpha: number;
  dirty: boolean;
}

/** Shared pose buffer: the R3F compute writes it, the point field reads it. */
export interface OpeningPoseView {
  readonly rows: readonly OpeningPoseRow[];
  readonly labelCapacity: number;
  readonly labelCount: number;
  readonly enabled: boolean;
}

// ---------------------------------------------------------------------------
// Network resolve (the demo-network node design at the end of the dive)
// ---------------------------------------------------------------------------

/** Attention ring a resolved node wears (deterministic per node id). */
export type OpeningNetworkRing = "none" | "contradicted" | "gap" | "bridge";

/** One mutable icon-node row consumed by the NetworkResolution DOM layer. */
export interface OpeningNetworkRow {
  readonly nodeIndex: number;
  /** Synthetic entity name — feeds the SHARED icon resolver + the mini label. */
  readonly label: string;
  readonly ring: OpeningNetworkRing;
  /** Visible when the resolved crowd is deep enough to read a name. */
  readonly showLabel: boolean;
  /** Normalized ±1 anchors (same space the pose rows use). */
  worldX: number;
  worldY: number;
  /** Rendered disc radius in stage px — the icon circle matches the disc. */
  radiusPx: number;
  alpha: number;
  dirty: boolean;
}

/** One mutable edge row consumed by the NetworkResolution DOM layer. Endpoints
 *  are read LIVE from their (possibly dived/parallaxed) node rows each frame,
 *  so the crisp links really reach the moving icon circles. */
export interface OpeningNetworkEdgeRow {
  readonly aIndex: number;
  readonly bIndex: number;
  /** Composed opacity: resolve ramp × both endpoint gates × far-dim. */
  alpha: number;
  dirty: boolean;
}

/** One "graph hole" (the demo's amber dashed gap between unlinked entities):
 *  builds only between candidate node PAIRS that have NO direct edge, so every
 *  hole reads as a missing link, exactly like the workspace graph. */
export interface OpeningNetworkHole {
  readonly aIndex: number;
  readonly bIndex: number;
  /** The gap midpoint in normalized ±1 space (the anchor for line + badge). */
  midWorldX: number;
  midWorldY: number;
  alpha: number;
  dirty: boolean;
}

/** Shared network buffer: the R3F compute writes it, NetworkResolution reads. */
export interface OpeningNetworkView {
  readonly rows: readonly OpeningNetworkRow[];
  /** Icon-to-icon links (both endpoints are resolve candidates). */
  readonly edges: readonly OpeningNetworkEdgeRow[];
  /** Deterministic gap badges over unlinked candidate pairs (built after the
   *  view itself, driven by the sorted candidate order). */
  holes: OpeningNetworkHole[];
  readonly enabled: boolean;
}

/** Live per-frame graph counters for the debug overlay. */
export interface OpeningGraphStats {
  readonly tier: CinematicQualityTier;
  readonly seed: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
  visibleNodeCount: number;
  sampleCount: number;
}

/** CSS-settable wordmark cues (write into --opening-* custom properties). */
export type { OpeningWordmarkCues };

export type { OpeningCameraState };

/** One immutable snapshot of the whole scrub — pure function of progress. */
export interface OpeningSnapshot {
  readonly phase: OpeningPhaseName;
  readonly phaseProgress: number;
  readonly wordmark: OpeningWordmarkCues;
  readonly decompose: number;
  readonly decomposeVisual: number;
  readonly release: number;
  readonly haze: number;
  readonly interactionMode: CinematicInteractionMode;
  readonly interactionEnvelope: number;
  readonly camera: OpeningCameraState;
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

/** Immutable adjacency lookup for pointer hit-testing + emphasis. */
export interface OpeningInteractionLayout {
  readonly nodeIndexById: ReadonlyMap<string, number>;
  readonly neighborsByNodeId: ReadonlyMap<string, readonly string[]>;
  readonly edgeCount: number;
}

/** Preallocated emphasis buffers the per-frame scene compute writes. */
export interface OpeningEmphasisBuffers {
  readonly nodeEmission: Float32Array;
  readonly nodeScale: Float32Array;
  readonly edgeMult: Float32Array;
}

export interface OpeningCursor {
  x: number;
  y: number;
  inside: boolean;
}

/** Mutable interaction runtime, mutated per frame — never React state. */
export interface OpeningInteraction extends OpeningEmphasisBuffers {
  readonly layout: OpeningInteractionLayout;
  readonly coarse: boolean;
  readonly active: boolean;
  focusedId: string | null;
  hoveredId: string | null;
  cursor: OpeningCursor;
  focusStrength: number;
  hoverStrength: number;
  focusRevision: number;
}

/** Statics + bundle-derived collaborators handed to the scene controller. */
export interface OpeningEffects {
  readonly bundle: OpeningGraphBundle;
  readonly stats: OpeningGraphStats;
  readonly pose: OpeningPoseView;
  /** Icon-node resolve buffer (demo-network node design at the dive's end). */
  readonly network: OpeningNetworkView;
  readonly interaction: OpeningInteraction | null;
  /** World wordmark layout; null until the async DOM measurement resolves. */
  readonly wordmark: OpeningWordmarkLayout | null;
}