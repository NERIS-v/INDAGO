// ============================================================================
// PR — INDAGO Cinematic Home Opening · Opening scene
//
// The ONE constellation layer. Each frame the particle positions are a pure
// function of handle.decompose/handle.release:
//
//   * the glyph field holds the whole-word sampled positions (so the particle
//     wordmark replaces the blurring HTML letters where they stood),
//   * as the dissolve runs, every particle cracks OUTWARD from the word centre
//     (a seeded curl, NEVER a downward-only blowout — the old `y -= blowout`
//     fall was a one-directional dump, not a decomposition),
//   * the first `bundle.nodes.length` particles then travel to their organic
//     slots and become the graph; the remaining glyph-only dust drifts outward
//     and fades as the network takes over.
//
// Per-frame work is a flat pass over preallocated float buffers (no allocation,
// no React state). The interaction layer (a separate component, lower useFrame
// priority) writes emphasis buffers that are read here.
// ============================================================================

"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CINEMATIC_CAMERA_HALF_EXTENT } from "../cinematic.constants";
import type {
  OpeningEffects,
  OpeningNetworkRow,
} from "../opening/opening.types";
import {
  lerp,
  openingDecomposeAt,
  openingEdgeAlpha,
  openingLabelAlpha,
  openingNodeAlpha,
  openingReleaseAt,
  smoothstep,
} from "../opening/opening.progress";
import {
  OPENING_CLASS_ALPHA,
  OPENING_CLASS_SIZE,
  OPENING_CORE_TINT,
  OPENING_EDGE_TINT,
  OPENING_LAYOUT_FIT_MARGIN,
  OPENING_NETWORK_DISC_FADE,
  OPENING_NETWORK_HOLE_OPACITY,
  OPENING_NETWORK_NODE_SIZE,
  OPENING_PARTICLE_COUNT,
  OPENING_PARTICLE_TINT,
  OPENING_ROSE_TINT,
} from "../opening/opening.constants";
import {
  OPENING_POINTS_FRAGMENT,
  OPENING_POINTS_VERTEX,
} from "../opening/opening.points";
import {
  openingGraphResolveAt,
  openingGraphZoomFrame,
  openingGraphZoomParallax,
  openingGraphZoomScale,
  openingGraphZoomZOffset,
  openingNetworkDepthCapAt,
  openingNetworkEdgeDepthAlpha,
  openingNetworkResolvedDepth,
  openingNodeDepth,
} from "../opening/opening.zoom";
import type { CinematicSceneHandle } from "../cinematic.types";
import type { CinematicCalibration } from "../cinematic.calibration";
import { shippingCalibrationAt } from "../cinematic.calibration";

/**
 * Target world footprint of the final graph, as a fraction of each VIEWPORT
 * half-extent. The graph is meant to read as a large sparse network (~50vw
 * wide, ~50vh tall) with substantial negative space — never a small central
 * dot. Because the layout is normalised to ±(1 − fitMargin) on BOTH axes, a
 * node at layout edge (±1) maps to FRACTION × half-extent here.
 */
const GRAPH_X_FRACTION = 0.5;
const GRAPH_Y_FRACTION = 0.5;
/** The ±1 layout box is really ±(1 − fitMargin); invert it for the mapping. */
const LAYOUT_EDGE = 1 - OPENING_LAYOUT_FIT_MARGIN;

export function OpeningScene({
  handle,
  effects,
  calibration = null,
}: {
  handle: CinematicSceneHandle;
  effects: OpeningEffects;
  calibration?: CinematicCalibration | null;
}) {
  const size = useThree((state) => state.size);
  const gl = useThree((state) => state.gl);

  const bundle = effects.bundle;
  const layout = effects.wordmark;
  const nodeCount = bundle.nodes.length;
  const count = OPENING_PARTICLE_COUNT[bundle.tier] ?? nodeCount;
  const edgeCount = bundle.edges.length;
  const reduced = handle.config.motion === "reduced";

  // Calibration is dev-only and lives in a prop; the active record is sampled
  // PER FRAME inside the existing useFrame (never a new render loop, never
  // per-frame React state). With no dev session the production path evaluates
  // the approved SHIPPING TIMELINE — so the particle ramp, node emphases and
  // every scene value track the scrub instead of freezing at mount.
  const cal = calibration;
  const effectiveRef = useRef<CinematicCalibration | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  const tints = useMemo(
    () => ({
      core: new THREE.Color(OPENING_CORE_TINT),
      rose: new THREE.Color(OPENING_ROSE_TINT),
      particle: new THREE.Color(OPENING_PARTICLE_TINT),
      edge: new THREE.Color(OPENING_EDGE_TINT),
    }),
    [],
  );

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute("aRadius", new THREE.BufferAttribute(new Float32Array(count), 1));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(count).fill(0), 1));
    geo.setAttribute("aScale", new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));
    geo.setAttribute("aEmission", new THREE.BufferAttribute(new Float32Array(count), 1));
    geo.setAttribute("aDepth", new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));
    return geo;
  }, [count]);

  // Deterministic per-particle depth for the graph-zoom dive (index-keyed,
  // stable across tiers/rebuilds so the projection never flickers).
  const depthByIndex = useMemo(() => {
    const arr = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const node = i < nodeCount ? bundle.nodes[i] : null;
      arr[i] = node ? openingNodeDepth(node.id, node.nx, node.ny) : 1;
    }
    return arr;
  }, [bundle, count, nodeCount]);
  const depthsUploaded = useRef(false);

  const edgeGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(edgeCount * 6), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(edgeCount * 6), 3));
    geo.setDrawRange(0, edgeCount * 2);
    return geo;
  }, [bundle, edgeCount]);

  // Per-particle "arrived" factor (0 → still held in the letters, 1 → settled
  // on its slot). Drives the settle lerp, the edge gate and the ambient breathe.
  const focal = useMemo(() => new Float32Array(count), [count]);

  // Shared radii array for the pose/network writers (the rendered disc radius,
  // used to size the DOM icon circles 1:1 under each node).
  const radiiRef = useRef<Float32Array>(new Float32Array(count));

  const nodeMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: OPENING_POINTS_VERTEX,
        fragmentShader: OPENING_POINTS_FRAGMENT,
        uniforms: {
          uWorldToPx: { value: 1 },
          uPixelRatio: { value: 1 },
          uZoom: { value: 1 },
          uDive: { value: 0 },
          uResolve: { value: 0 },
          uTint: { value: tints.particle },
          uTintStrength: { value: 0.35 },
        },
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [tints],
  );

  const edgeMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  // Per-frame scratch colors (single allocation, reused).
  const scratch = useRef({ color: new THREE.Color(), step: new THREE.Color() });

  // Latched once the icon network has begun forming: after that the old blurred
  // edge buffer is never shown again, even when scrolled back past the resolve
  // window (removal, not a reversible fade — no black ghosting on the way up).
  const networkFormedRef = useRef(false);

  // --- Compute owner: positions, node life, emphasis bake, edges (every frame).
  useFrame((state) => {
    if (!bundle) return;
    // Active record — dev-lab override, else the approved shipping timeline.
    const active = cal ?? shippingCalibrationAt(reduced ? 1 : handle.progress);
    effectiveRef.current = active;
    const graphScale = active.graphScale;
    const calibrationNodeScale = active.nodeScale;
    const particleSize = active.particleSize;
    const particleOpacity = active.particleOpacity;
    const brightness = active.brightness;
    const pointScaleMax = active.particleScaleMax;
    const releaseSpread = active.releaseSpread;
    const releaseCurl = active.releaseCurl;
    const edgeWindow = { start: active.edgeStart, end: active.edgeEnd };
    const edgeOpacity = active.edgeOpacity;
    const audit = active.glyphAudit;
    const particlesOnly = active.particlesOnly;
    const hideGraph = audit || particlesOnly;
    // GRAPH ZOOM / DEPTH: the final camera dive, evaluated per frame from the
    // SAME active record. Reduced motion keeps the phase off (q = 0 → identity
    // multipliers) so the reduced final frame is exactly the resolved graph.
    const zoomFrame = openingGraphZoomFrame(reduced ? 0 : handle.progress, active);
    // NETWORK RESOLVE: the constellation → demo icon-node crossfade, riding the
    // tail of the dive. Reduced motion lands on the RESOLVED final frame.
    const resolve = openingGraphResolveAt(reduced ? 1 : handle.progress, active);
    const resolveCap = openingNetworkDepthCapAt(resolve, active);
    const halfH = CINEMATIC_CAMERA_HALF_EXTENT;
    const aspect = Math.max(size.width / Math.max(size.height, 1), 0.01);
    const halfW = halfH * aspect;
    // Per-axis mapping: the graph fills a target fraction of EACH viewport
    // half-extent. Wide screens get a wide graph; portrait screens a tall one.
    // graphScale is art-directed (1.3 = the large final network) and remains
    // calibration-tunable in the dev lab.
    const worldX = ((halfW * GRAPH_X_FRACTION) / LAYOUT_EDGE) * graphScale;
    const worldY = ((halfH * GRAPH_Y_FRACTION) / LAYOUT_EDGE) * graphScale;
    const clock = state.clock.elapsedTime;
    const group = groupRef.current;
    // The calibration `alignmentX/alignmentY` are OVERLAY-ONLY offsets: they
    // move the guide layer drawn by CinematicCalibrationOverlay, never the real
    // field. The DOM→world mapping itself is exact by construction and must not
    // be nudged in the scene, so the group stays centred at all times.
    if (group) group.position.set(0, 0, 0);

    const positionAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const radiusAttr = geometry.getAttribute("aRadius") as THREE.BufferAttribute;
    const colorAttr = geometry.getAttribute("aColor") as THREE.BufferAttribute;
    const alphaAttr = geometry.getAttribute("aAlpha") as THREE.BufferAttribute;
    const scaleAttr = geometry.getAttribute("aScale") as THREE.BufferAttribute;
    const emissionAttr = geometry.getAttribute("aEmission") as THREE.BufferAttribute;
    const depthAttr = geometry.getAttribute("aDepth") as THREE.BufferAttribute;
    const positions = positionAttr.array as Float32Array;
    const radii = radiusAttr.array as Float32Array;
    const colors = colorAttr.array as Float32Array;
    const alphas = alphaAttr.array as Float32Array;
    const scales = scaleAttr.array as Float32Array;
    const emissions = emissionAttr.array as Float32Array;
    if (!depthsUploaded.current) {
      depthAttr.array.set(depthByIndex);
      depthAttr.needsUpdate = true;
      depthsUploaded.current = true;
    }

    // Glyph AUDIT freezes every particle on its sampled glyph position (no
    // decompose, no release) so the 50% DOM overlay can be compared 1:1.
    const decompose = audit ? 0 : reduced ? 0 : handle.decompose;
    const release = audit ? 0 : reduced ? 1 : handle.release;
    const decomposeVisual = audit ? 0 : reduced ? 0 : handle.decomposeVisual;
    const ambient = 1 + 0.05 * handle.interactionEnvelope;
    const envelope = handle.interactionEnvelope;

    const interaction = effects.interaction;
    const nodeEmission = interaction?.nodeEmission;
    const nodeScale = interaction?.nodeScale;
    const glyphX = layout?.glyphX;
    const glyphY = layout?.glyphY;
    const curveX = layout?.curveX;
    const curveY = layout?.curveY;
    const start = layout?.start;
    const sizes = layout?.size;
    const classAlphas = layout?.classAlpha;
    const bounds = layout?.bound;
    const blurIn = reduced ? 0 : smoothstep(0.2, 0.6, decomposeVisual);

    let visibleCount = 0;

    for (let i = 0; i < count; i += 1) {
      const node = i < nodeCount ? bundle.nodes[i]! : null;
      const isNode = node !== null && (bounds?.[i] ?? 1) === 1;
      const ox = node ? node.nx * worldX : 0;
      const oy = node ? node.ny * worldY : 0;
      const snap = start?.[i] ?? 0;

      const dLoc = openingDecomposeAt(snap, decompose);
      const rLoc = openingReleaseAt(snap, release);

      const gx = glyphX?.[i] ?? 0;
      const gy = glyphY?.[i] ?? 0;
      const cxi = curveX?.[i] ?? 0;
      const cyi = curveY?.[i] ?? 0;
      const pSize = sizes?.[i] ?? 0.009;
      const pAlpha = audit ? 1 : classAlphas?.[i] ?? OPENING_CLASS_ALPHA.peripheral;

      // Outward decomposition: every chip leaves the word centre along its own
      // radial direction plus a small seeded curl. NO gravity, NO falling, NO
      // one-directional blowout — the silhouette bursts apart, not downward.
      // releaseSpread/releaseCurl are art-directed (outward + a subtle curl),
      // and remain calibration-tunable in the dev lab (1 = shipped).
      const len = Math.hypot(gx, gy) || 1;
      const dirX = gx / len;
      const dirY = gy / len;
      const spread = pSize * 10 * decomposeVisual * releaseSpread;
      const curl = cxi * 0.4 * releaseCurl;
      const curlY = cyi * 0.4 * releaseCurl;
      const crackX = gx + (dirX + curl) * spread;
      const crackY = gy + (dirY + curlY) * spread;
      let px = crackX;
      let py = crackY;

      let alpha: number;
      // GRAPH ZOOM / DEPTH: per-node dive values — depth (deterministic), the
      // visual scale multiplier (1/distance × fg/bg bias) and the parallax
      // position multiplier. Identity outside the dive window (audit or not yet
      // released), so the graph-zoom phase folds into the resolved network.
      const diveNode = isNode && !audit;
      const depth = diveNode ? depthByIndex[i]! : 1;
      const zScale = diveNode ? openingGraphZoomScale(zoomFrame, depth) : 1;
      const zPar = diveNode ? openingGraphZoomParallax(zoomFrame, depth) : 1;
      if (isNode) {
        const travel = smoothstep(0, 0.55, rLoc);
        const lift = Math.sin(Math.PI * travel);
        px = crackX + (ox + cxi * lift * releaseCurl - crackX) * travel;
        py = crackY + (oy + cyi * lift * releaseCurl - crackY) * travel;

        focal[i] = smoothstep(0.25, 0.7, rLoc);
        if (!reduced && !audit && focal[i]! > 0) {
          const drift = (node?.driftAmplitude ?? 0.02) * focal[i]!;
          px += Math.sin(clock * 1.3 + (node?.phase ?? 0)) * drift;
          py += Math.cos(clock * 1.7 + (node?.phase ?? 0)) * drift;
        }
        const sx = lerp(px, ox * ambient, focal[i]!);
        const sy = lerp(py, oy * ambient, focal[i]!);
        // The dive scales the whole settled slot about the viewport CENTRE —
        // the projection is symmetric, so the expansion is always centred.
        positions[i * 3] = diveNode ? sx * zPar * zoomFrame.plane : sx;
        positions[i * 3 + 1] = diveNode ? sy * zPar * zoomFrame.plane : sy;
        alpha =
          openingNodeAlpha(dLoc, rLoc, pAlpha, reduced) *
          particleOpacity *
          (diveNode ? zoomFrame.nodeBlend : 1);
      } else {
        // Glyph-only dust: it cracks outward and fades as the graph forms.
        focal[i] = 0;
        const out = smoothstep(0.1, 1, rLoc) * 0.18;
        positions[i * 3] = crackX + dirX * out;
        positions[i * 3 + 1] = crackY + dirY * out;
        alpha =
          pAlpha *
          smoothstep(0, 0.5, dLoc) *
          (1 - smoothstep(0.2, 0.8, rLoc)) *
          particleOpacity;
      }
      positions[i * 3 + 2] = diveNode
        ? openingGraphZoomZOffset(zoomFrame, depth)
        : 0;
      // NETWORK RESOLVE: a node turning into an icon circle dims its soft glow
      // disc underneath (the DOM layer paints the crisp ringed body on top), so
      // the blurred dot literally cedes the stage to the crisp node design.
      const resolvedGate = diveNode
        ? openingNetworkResolvedDepth(depth, resolveCap)
        : 0;
      alpha *= 1 - resolve * resolvedGate * (1 - OPENING_NETWORK_DISC_FADE);
      alphas[i] = alpha;
      if (alpha > 0.01) visibleCount += 1;

      // The dissolve blur: points swell soft (reading as the letters blurring
      // into particles) then contract crisp as they break away and settle. The
      // swell is hard-capped at the art-directed OPENING_POINT_SCALE_MAX so the
      // haze never becomes solid discs; the deliberate LARGE final-node size
      // comes from nodeScale + the particle-size ramp, not the blur.
      const focusFactor = audit
        ? 1
        : Math.min(
            pointScaleMax,
            1 + 0.6 * blurIn * (1 - smoothstep(0, 0.7, rLoc)),
          );
      const emScale = nodeScale?.[i] ?? 1;
      scales[i] = focusFactor * (1 + (emScale - 1) * envelope);
      emissions[i] = (nodeEmission?.[i] ?? 0) * envelope;
      // Neutral audit rendering: one uniform size for every particle so the
      // glyph silhouette, not the size hierarchy, is what is being compared.
      radii[i] =
        (audit ? OPENING_CLASS_SIZE.core : pSize) * particleSize *
        (audit ? 1 : isNode ? calibrationNodeScale : 1) *
        (diveNode ? zScale : 1);

      // Bake tint × alpha into the color attribute (finite colour space).
      if (audit) scratch.current.color.copy(tints.particle);
      else if (node?.accent === 1) scratch.current.color.copy(tints.rose);
      else if (node?.class === "core") scratch.current.color.copy(tints.core);
      else scratch.current.color.copy(tints.particle);
      scratch.current.step
        .copy(scratch.current.color)
        .multiplyScalar(alpha * brightness);
      colors[i * 3] = scratch.current.step.r;
      colors[i * 3 + 1] = scratch.current.step.g;
      colors[i * 3 + 2] = scratch.current.step.b;
    }
    positionAttr.needsUpdate = true;
    radiusAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    scaleAttr.needsUpdate = true;
    emissionAttr.needsUpdate = true;

    // Edges: alpha × emphasis baked into vertex colors in draw-order slots.
    const linePosAttr = edgeGeometry.getAttribute("position") as THREE.BufferAttribute;
    const lineColorAttr = edgeGeometry.getAttribute("color") as THREE.BufferAttribute;
    const linePositions = linePosAttr.array as Float32Array;
    const lineColors = lineColorAttr.array as Float32Array;
    const edgeMult = effects.interaction?.edgeMult;

    for (let i = 0; i < edgeCount; i += 1) {
      const edge = bundle.edges[i]!;
      const mul = edgeMult ? (edgeMult[i] ?? 1) : 1;
      // Edges only draw once BOTH endpoints have broken away and settled —
      // the network visibly grows OUT of the letters instead of tangle-wiring
      // over the dissolving wordmark.
      const settleGate = Math.min(
        focal[edge.sourceIndex] ?? 0,
        focal[edge.targetIndex] ?? 0,
      );
      // NETWORK RESOLVE: the OLD GPU edge buffer is REMOVED from the screen the
      // exact moment the icon network starts (resolve > 0) — see the
      // `edgeMaterial.visible` switch at the end of this block. No dim-through:
      // the blink would pass through BLACK (vertex-colour lines have no
      // per-line alpha), so instead the crisp DOM edges simply take over.
      const alpha = hideGraph
        ? 0
        : Math.min(
            1,
            openingEdgeAlpha(
              edge.formationStart,
              handle.progress,
              reduced,
              edgeWindow,
              edgeOpacity,
            ) *
              settleGate *
              mul *
              zoomFrame.edgeBlend,
          );
      const order = edge.slot;
      if (alpha <= 0.001) {
        lineColors[order * 6] = 0;
        lineColors[order * 6 + 1] = 0;
        lineColors[order * 6 + 2] = 0;
        lineColors[order * 6 + 3] = 0;
        lineColors[order * 6 + 4] = 0;
        lineColors[order * 6 + 5] = 0;
        // DEGENERATE the segment instead of leaving stale positions behind.
        // Vertex-colour lines have no per-line alpha, so a zeroed color is
        // still DRAWN as black over whatever position was last written —
        // that's the black ghosting when scrolling back through the dive.
        linePositions[order * 6] = 0;
        linePositions[order * 6 + 1] = 0;
        linePositions[order * 6 + 2] = 0;
        linePositions[order * 6 + 3] = 0;
        linePositions[order * 6 + 4] = 0;
        linePositions[order * 6 + 5] = 0;
        continue;
      }
      const xs = positions[edge.sourceIndex * 3] ?? 0;
      const ys = positions[edge.sourceIndex * 3 + 1] ?? 0;
      const zs = positions[edge.sourceIndex * 3 + 2] ?? 0;
      const xt = positions[edge.targetIndex * 3] ?? 0;
      const yt = positions[edge.targetIndex * 3 + 1] ?? 0;
      const zt = positions[edge.targetIndex * 3 + 2] ?? 0;
      linePositions[order * 6] = xs;
      linePositions[order * 6 + 1] = ys;
      linePositions[order * 6 + 2] = zs;
      linePositions[order * 6 + 3] = xt;
      linePositions[order * 6 + 4] = yt;
      linePositions[order * 6 + 5] = zt;
      const rx = tints.edge.r * alpha;
      const ry = tints.edge.g * alpha;
      const rz = tints.edge.b * alpha;
      lineColors[order * 6] = rx;
      lineColors[order * 6 + 1] = ry;
      lineColors[order * 6 + 2] = rz;
      lineColors[order * 6 + 3] = rx;
      lineColors[order * 6 + 4] = ry;
      lineColors[order * 6 + 5] = rz;
    }
    linePosAttr.needsUpdate = true;
    lineColorAttr.needsUpdate = true;

    // NETWORK RESOLVE — hard removal, latched: the instant the resolve window
    // opens (resolve > 0) the icon network starts forming and the OLD blurred
    // edge buffer is taken off the screen. Because the removal is a latch,
    // scrolling BACK up never resurrects the dust edges (and never lets them
    // flicker black): once the graph has started forming the old buffer stays
    // gone for the rest of the session.
    if (resolve > 0) networkFormedRef.current = true;
    edgeMaterial.visible = !networkFormedRef.current;

    // GPU uniforms reflect zoom + device pixel ratio.
    const pixelRatio = gl.getPixelRatio();
    nodeMaterial.uniforms.uWorldToPx!.value = size.height / (2 * halfH);
    nodeMaterial.uniforms.uPixelRatio!.value = pixelRatio;
    nodeMaterial.uniforms.uZoom!.value = reduced ? 1 : handle.camera.zoom;
    nodeMaterial.uniforms.uDive!.value = zoomFrame.ease;
    nodeMaterial.uniforms.uResolve!.value = resolve;
    radiiRef.current = radii;

    effects.stats.visibleNodeCount = visibleCount;
    effects.stats.sampleCount = count;
  });

  // --- Pose writer: label anchors for the DOM layer (bundle-derived picks).
  useFrame(() => {
    const active = effectiveRef.current;
    if (!active) return;
    const pose = effects.pose;
    const decompose = reduced ? 0 : handle.decompose;
    const release = reduced ? 1 : handle.release;
    // Same per-axis mapping the node compute uses, expressed as a fraction of
    // the viewport half-extents so the DOM %-positioned labels sit ON nodes.
    const graphScale = active.graphScale;
    const labelStart = active.labelStart;
    const labelOpacity = active.labelOpacity;
    const hideGraph = active.glyphAudit || active.particlesOnly;
    // GRAPH ZOOM / DEPTH: the pose layer applies the SAME dive projection for
    // this node (parallax × plane about the centre) so DOM labels track the
    // dived nodes exactly.
    const zoomFrame = openingGraphZoomFrame(reduced ? 0 : handle.progress, active);
    const fracX = (GRAPH_X_FRACTION / LAYOUT_EDGE) * graphScale;
    const fracY = (GRAPH_Y_FRACTION / LAYOUT_EDGE) * graphScale;
    for (let k = 0; k < pose.rows.length; k += 1) {
      const row = pose.rows[k]!;
      const node = bundle.nodes[row.nodeIndex];
      if (!node) continue;
      const snap = layout?.start ? layout.start[node.index]! : 0;
      const depth = hideGraph ? 1 : depthByIndex[node.index] ?? 1;
      const zPar = openingGraphZoomParallax(zoomFrame, depth);
      const dive = !reduced;
      const labelOpacityBlend = dive ? zoomFrame.labelBlend : 1;
      row.alpha = hideGraph
        ? 0
        : openingNodeAlpha(
            openingDecomposeAt(snap, decompose),
            openingReleaseAt(snap, release),
            OPENING_CLASS_ALPHA[node.class],
            reduced,
          ) *
          openingLabelAlpha(k, handle.progress, reduced, labelStart, labelOpacity) *
          labelOpacityBlend;
      row.worldX = node.nx * fracX * (dive ? zPar * zoomFrame.plane : 1);
      row.worldY = node.ny * fracY * (dive ? zPar * zoomFrame.plane : 1);
      row.dirty = true;
    }

    // NETWORK RESOLVE rows: the DOM icon circles track the SAME dived
    // projection as the pose labels. Their alpha is the depth gate MASKED BY
    // the resolve ramp — nothing renders before the resolve window opens, then
    // the front layer fades in with the crossfade and the cap widens so the
    // periphery converts last. Reduced motion lands fully resolved (resolve 1).
    const network = effects.network;
    if (network.enabled) {
      const resolve = openingGraphResolveAt(reduced ? 1 : handle.progress, active);
      const cap = openingNetworkDepthCapAt(resolve, active);
      const pw = size.height / (2 * CINEMATIC_CAMERA_HALF_EXTENT);
      const uZoom = reduced ? 1 : handle.camera.zoom;
      const nodeSize =
        active.networkNodeSize ?? OPENING_NETWORK_NODE_SIZE;
      const radii = radiiRef.current;
      const rowByIndex = new Map<number, OpeningNetworkRow>();
      for (let k = 0; k < network.rows.length; k += 1) {
        const row = network.rows[k]!;
        rowByIndex.set(row.nodeIndex, row);
        const node = bundle.nodes[row.nodeIndex];
        if (!node) continue;
        const depth = depthByIndex[node.index] ?? 1;
        const gate = hideGraph
          ? 0
          : openingNetworkResolvedDepth(depth, cap);
        const zPar = openingGraphZoomParallax(zoomFrame, depth);
        const dive = !reduced;
        row.alpha = gate * resolve;
        row.worldX = node.nx * fracX * (dive ? zPar * zoomFrame.plane : 1);
        row.worldY = node.ny * fracY * (dive ? zPar * zoomFrame.plane : 1);
        row.radiusPx = (radii[node.index] ?? 0) * pw * uZoom * nodeSize;
        row.dirty = true;
      }

      // LINKS: the crisp icon-to-icon edges. A link holds its composed opacity
      // (GATE: both endpoints must be resolved icons; × resolve ramp; × the
      // same far-edge depth dim as the blurred buffer) — endpoints move WITH
      // the icons because the DOM layer reads them from the node rows above.
      const gateFor = (index: number): number => {
        if (hideGraph) return 0;
        const depth = depthByIndex[index] ?? 1;
        return openingNetworkResolvedDepth(depth, cap);
      };
      for (let k = 0; k < network.edges.length; k += 1) {
        const edgeA = network.edges[k]!;
        const gA = gateFor(edgeA.aIndex);
        const gB = gateFor(edgeA.bIndex);
        const dMid =
          ((depthByIndex[edgeA.aIndex] ?? 0) +
            (depthByIndex[edgeA.bIndex] ?? 0)) /
          2;
        edgeA.alpha =
          resolve *
          Math.min(gA, gB) *
          openingNetworkEdgeDepthAlpha(dMid, resolve);
        edgeA.dirty = true;
      }

      // GRAPH HOLES: amber dashed gaps over candidate pairs with NO real link.
      // Midpoint rides the dived projection of its two endpoints; alpha gates
      // on the WEAKER of the two so a hole never bleeds onto blurred dust.
      for (let k = 0; k < network.holes.length; k += 1) {
        const hole = network.holes[k]!;
        const a = rowByIndex.get(hole.aIndex);
        const b = rowByIndex.get(hole.bIndex);
        if (!a || !b) continue;
        const g = Math.min(a.alpha, b.alpha);
        hole.midWorldX = (a.worldX + b.worldX) / 2;
        hole.midWorldY = (a.worldY + b.worldY) / 2;
        hole.alpha = g * OPENING_NETWORK_HOLE_OPACITY;
        hole.dirty = true;
      }
    }
  });

  return (
    <group ref={groupRef}>
      <points geometry={geometry} material={nodeMaterial} frustumCulled={false} />
      <lineSegments
        geometry={edgeGeometry}
        material={edgeMaterial}
        frustumCulled={false}
      />
    </group>
  );
}
