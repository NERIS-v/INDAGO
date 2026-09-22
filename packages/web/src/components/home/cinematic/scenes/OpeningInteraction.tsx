// ============================================================================
// PR — INDAGO Cinematic Home Opening · Interaction compute owner
//
// Pointer WITHOUT drag. A single useFrame (priority −1, before the scene's
// compute) reads the latest pointer sample on the canvas, hit-tests the node
// field in un-zoomed world space, eases the hover/focus strengths toward their
// targets and bakes node emphasis + edge multipliers into the shared buffers
// the OpeningScene reads. Emphasis is gated by the scrub mode: "none" kills
// everything, "passive" (node release) lifts at half strength, "limited"
// (graph connect) allows the full hover lift but the tap-to-focus pin only
// opens at "full" (graph resolve).
//
// Reduced motion and coarse-pointer builds never mount this component (the
// interaction is null), so there is nothing to disable — the buffers simply
// never exist.
// ============================================================================

"use client";

import { useLayoutEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CINEMATIC_CAMERA_HALF_EXTENT } from "../cinematic.constants";
import { OPENING_LAYOUT_FIT_MARGIN } from "../opening/opening.constants";
import type { OpeningEffects } from "../opening/opening.types";
import {
  findNearestPoint,
  openingEdgeMultiplier,
  openingNodeEmphasis,
  approach,
} from "../opening/opening.interaction";
import {
  OPENING_COARSE_HIT_MULT,
  OPENING_HIT_RADIUS,
} from "../opening/opening.interaction";
import type { CinematicSceneHandle } from "../cinematic.types";

/** Same per-axis graph mapping the OpeningScene compute uses (see there). */
const GRAPH_X_FRACTION = 0.5;
const GRAPH_Y_FRACTION = 0.5;
const LAYOUT_EDGE = 1 - OPENING_LAYOUT_FIT_MARGIN;

export function OpeningInteraction({
  handle,
  effects,
}: {
  handle: CinematicSceneHandle;
  effects: OpeningEffects;
}) {
  const size = useThree((state) => state.size);
  const gl = useThree((state) => state.gl);
  const interaction = effects.interaction;
  const bundle = effects.bundle;

  const focusSet = useMemo(
    () => new Uint8Array(bundle.nodes.length),
    [bundle],
  );

  // Preallocated node-position mirrors for the hit test (no per-frame alloc).
  const hitXs = useMemo(
    () => new Float32Array(bundle.nodes.length),
    [bundle],
  );
  const hitYs = useMemo(
    () => new Float32Array(bundle.nodes.length),
    [bundle],
  );

  useLayoutEffect(() => {
    if (!interaction) return;
    const dom = gl.domElement;

    const toCursor = (event: PointerEvent): void => {
      if (event.pointerType === "touch") return;
      const rect = dom.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      interaction.cursor.x =
        ((event.clientX - rect.left) / rect.width) * 2 - 1;
      interaction.cursor.y =
        1 - ((event.clientY - rect.top) / rect.height) * 2;
      interaction.cursor.inside = true;
    };

    const onPointerMove = (event: PointerEvent): void => toCursor(event);
    const onPointerLeave = (): void => {
      interaction.cursor.inside = false;
    };
    const onBlur = (): void => {
      interaction.cursor.inside = false;
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (event.pointerType === "touch") return;
      if (handle.interactionMode !== "full") return;
      // Tap toggles the focus; dropping it clears hover emphasis too.
      const next =
        interaction.hoveredId !== null
          ? interaction.hoveredId === interaction.focusedId
            ? null
            : interaction.hoveredId
          : null;
      interaction.focusedId = next;
      interaction.hoveredId = null;
      interaction.hoverStrength = 0;
      interaction.focusStrength = next !== null ? 1 : 0;
      interaction.focusRevision += 1;
    };

    dom.addEventListener("pointermove", onPointerMove, { passive: true });
    dom.addEventListener("pointerdown", onPointerDown, { passive: true });
    dom.addEventListener("pointerleave", onPointerLeave, { passive: true });
    window.addEventListener("blur", onBlur, { passive: true });
    return () => {
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onBlur);
    };
  }, [gl, interaction, handle]);

  useFrame((_state, dt) => {
    if (!interaction) return;
    const halfH = CINEMATIC_CAMERA_HALF_EXTENT;
    const aspect = Math.max(size.width / Math.max(size.height, 1), 0.01);
    const halfW = halfH * aspect;
    const worldX = (halfW * GRAPH_X_FRACTION) / LAYOUT_EDGE;
    const worldY = (halfH * GRAPH_Y_FRACTION) / LAYOUT_EDGE;
    const zoom = Math.max(handle.camera.zoom, 0.01);

    const mode = handle.interactionMode;
    const cursor = interaction.cursor;

    let hovered: number | null = null;
    if (mode !== "none" && cursor.inside) {
      const wx = (cursor.x * halfW) / zoom;
      const wy = (cursor.y * halfH) / zoom;
      for (let i = 0; i < bundle.nodes.length; i += 1) {
        hitXs[i] = bundle.nodes[i]!.nx * worldX;
        hitYs[i] = bundle.nodes[i]!.ny * worldY;
      }
      hovered = findNearestPoint(
        wx,
        wy,
        hitXs,
        hitYs,
        bundle.nodes.length,
        OPENING_HIT_RADIUS * (interaction.coarse ? OPENING_COARSE_HIT_MULT : 1),
      );
    }
    const hoveredId =
      hovered !== null && hovered >= 0 && hovered < bundle.nodes.length
        ? bundle.nodes[hovered]!.id
        : null;
    interaction.hoveredId = hoveredId;

    // Ease strengths with a half-life so hover/focus read as lifts, not pops.
    const targetFocus = interaction.focusedId !== null ? 1 : 0;
    const targetHover =
      hoveredId !== null && hoveredId === interaction.focusedId ? 0 : hoveredId !== null ? 1 : 0;
    interaction.focusStrength = approach(
      interaction.focusStrength,
      targetFocus,
      dt,
    );
    interaction.hoverStrength = approach(
      interaction.hoverStrength,
      targetHover,
      dt,
    );

    // Bake emphasis into the shared buffers (scene multiplies by envelope).
    const nodeEmission = interaction.nodeEmission;
    const nodeScale = interaction.nodeScale;
    const edgeMult = interaction.edgeMult;
    const layout = interaction.layout;

    focusSet.fill(0);
    const focusedId = interaction.focusedId;
    const focusedMates = focusedId === null
      ? null
      : layout.neighborsByNodeId.get(focusedId);
    if (focusedId !== null && focusedMates) {
      for (const mateId of focusedMates) {
        const mateIndex = layout.nodeIndexById.get(mateId);
        if (mateIndex !== undefined) focusSet[mateIndex] = 1;
      }
    }

    for (let i = 0; i < bundle.nodes.length; i += 1) {
      const id = bundle.nodes[i]!.id;
      const em = openingNodeEmphasis(
        focusedId === id,
        hoveredId === id,
        focusSet[i] === 1,
      );
      // Passive (node release) keeps the lift SUBTLE — warmth, not focus; the
      // limited mode (graph connect) unlocks the full hover lift while still
      // refusing the tap-to-focus pin, which only opens at "full".
      const lift = mode === "passive" ? 0.5 : 1;
      nodeEmission[i] = em.emission * lift;
      nodeScale[i] = 1 + (em.scale - 1) * lift;
    }

    for (let i = 0; i < bundle.edges.length; i += 1) {
      const edge = bundle.edges[i]!;
      edgeMult[i] = openingEdgeMultiplier(
        edge.source,
        edge.target,
        focusedId,
        hoveredId,
      );
    }
  }, -1);

  return null;
}