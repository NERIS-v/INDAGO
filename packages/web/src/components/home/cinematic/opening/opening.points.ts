// ============================================================================
// PR — INDAGO Cinematic Home Opening · Shared GPU points
//
// One soft-disc point shader + the shared zeroed edge position buffer used by
// BOTH tier end states (decompose → dissolve into the formed graph). Point
// size is recomputed per frame from the camera: aRadius (world) × css-px-per-
// world-unit × devicePixelRatio, so nodes keep a true world footprint while
// the camera zooms and dpr dances. No per-frame allocation anywhere.
// ============================================================================

export const OPENING_POINTS_VERTEX = /* glsl */ `
attribute float aRadius;
attribute float aAlpha;
attribute float aScale;
attribute float aEmission;
attribute float aDepth;
attribute vec3 aColor;
uniform float uWorldToPx;
uniform float uPixelRatio;
uniform float uZoom;
varying float vAlpha;
varying float vEmission;
varying float vDepth;
varying vec3 vColor;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float css = aRadius * 2.0 * aScale * uWorldToPx * uZoom;
  gl_PointSize = css * uPixelRatio;
  vAlpha = aAlpha;
  vEmission = aEmission;
  vDepth = aDepth;
  vColor = aColor;
}
`;

export const OPENING_POINTS_FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec3 uTint;
uniform float uTintStrength;
uniform float uDive;
uniform float uResolve;
varying float vAlpha;
varying float vEmission;
varying float vDepth;
varying vec3 vColor;

void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  float d2 = dot(p, p);
  // Two gaussian lobes — a bright soft core wrapped in a faint halo: a
  // luminous spot, never a disc with a hard edge (and never a square).
  float falloff = exp(-d2 * 7.0) + 0.45 * exp(-d2 * 30.0);
  falloff = min(falloff, 1.0) * (1.0 - smoothstep(0.24, 0.5, length(p)));
  // Dive ring: during the graph-zoom dive, near nodes pick up a THIN outer
  // ring (bright core, clear edge) — the same ringed-body language the app
  // graph canvas uses for its nodes, subtly restated for the luminous point.
  // It fades in with the dive (uDive) and only on front nodes (low vDepth),
  // then hands the stage to the crisp DOM icon network as the resolve runs.
  float ring = smoothstep(0.4, 0.46, length(p)) - smoothstep(0.46, 0.5, length(p));
  vec3 color = mix(vColor, uTint, uTintStrength);
  color += uTintStrength * vEmission * 0.55;
  color += ring * mix(uTint, vColor, 0.5) * (1.0 - vDepth) * uDive * 0.45 * (1.0 - uResolve);
  float alpha = vAlpha * falloff;
  if (alpha <= 0.001) discard;
  gl_FragColor = vec4(color * (1.0 + vEmission * 0.2), alpha);
}
`;

/** Shared zeroed line geometry: 2 interleaved triples per edge. */
export function openingEdgePositionsBuffer(edgeCount: number): Float32Array {
  return new Float32Array(edgeCount * 6);
}