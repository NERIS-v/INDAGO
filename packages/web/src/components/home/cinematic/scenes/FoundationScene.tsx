// ============================================================================
// PR — INDAGO Cinematic Home Opening · Foundation scene
//
// The cinematic backdrop: ONE warm-dark color for the whole journey, a soft
// full-screen haze that breathes as the dissolve lands (uGlow follows
// handle.haze), and a centered orthographic camera that follows the scroll-
// scrubbed dolly dead-on (hero 1.0 → wide 0.62 → final 0.9). Everything the
// opening draws on top (OpeningScene + OpeningInteraction) mounts inside the
// SAME canvas — one Canvas, one camera, one clean tear-down.
//
// The full journey runs here: the whole-word particle field cracks outward, the
// persistent nodes travel to their organic slots and the graph weaves in. The
// pointer interaction layer mounts only for full motion (reduced motion renders
// the static end frame).
// ============================================================================

"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CinematicSceneHandle } from "../cinematic.types";
import { cinematicCameraBounds } from "../cinematic.constants";
import { OPENING_BACKDROP_HEX } from "../opening/opening.constants";
import type { OpeningEffects } from "../opening/opening.types";
import type { CinematicCalibration } from "../cinematic.calibration";
import { OpeningInteraction } from "./OpeningInteraction";
import { OpeningScene } from "./OpeningScene";

/** The one stable warm-dark background (matches --color-semantic-background). */
const SCENE_BACKGROUND_HEX = OPENING_BACKDROP_HEX;

/** Haze plane covers every zoom the camera reaches (hero zoom 1.8). */
const HAZE_SPAN = 14;

const HAZE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const HAZE_FRAGMENT = /* glsl */ `
precision mediump float;
uniform float uGlow;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float d = length(p * vec2(2.0, 1.2));
  float glow = smoothstep(1.1, 0.0, d);
  float alpha = uGlow * (0.16 + 0.36 * glow);
  gl_FragColor = vec4(uColor * (0.5 + 0.5 * glow), alpha);
}
`;

/**
 * The scene background: one stable Color instance mutated in place (never a
 * new color per tick), owned imperatively so node/edge fades bleed into the
 * SAME color the page behind it uses.
 */
function SceneBackdrop() {
  const scene = useThree((state) => state.scene);
  const colorRef = useRef(new THREE.Color(SCENE_BACKGROUND_HEX));

  useLayoutEffect(() => {
    scene.background = colorRef.current;
    colorRef.current.set(SCENE_BACKGROUND_HEX);
  }, [scene]);

  return null;
}

/**
 * The calm cinematic haze. A single shader plane at z = −4 sized to cover the
 * widest frame; uGlow rises with handle.haze so the warm pull reads as the
 * dissolve settles and the graph is fully formed.
 */
function Haze({ handle }: { handle: CinematicSceneHandle }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: HAZE_VERTEX,
        fragmentShader: HAZE_FRAGMENT,
        uniforms: {
          uGlow: { value: 0 },
          uColor: { value: new THREE.Color("#1a130c") },
        },
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  useFrame(() => {
    material.uniforms.uGlow!.value = handle.haze;
  });

  return (
    <mesh
      scale={[HAZE_SPAN, HAZE_SPAN, 1]}
      position={[0, 0, -4]}
      material={material}
      renderOrder={-2}
      frustumCulled={false}
    />
  );
}

/**
 * Centrally-managed orthographic camera. The camera sweeps with the scrub:
 * openingSnapshotAt derives it purely from progress, and this component copies
 * the cue straight onto the live camera every frame — reverse or rapid scroll
 * yanks the dolly with it (there is NO autonomous ease: the frame must belong
 * to the scroll, or reversing would fight the glide). Reduced motion snaps to
 * the static end camera once.
 */
function CinematicCamera({ handle }: { handle: CinematicSceneHandle }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useLayoutEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const bounds = cinematicCameraBounds(size.width / Math.max(size.height, 1));
    camera.left = bounds.left;
    camera.right = bounds.right;
    camera.top = bounds.top;
    camera.bottom = bounds.bottom;
    camera.zoom = 1;
    camera.position.set(0, 0, 10);
    camera.updateProjectionMatrix();
  }, [camera, size]);

  useFrame(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const zoom = handle.camera.zoom;
    if (Math.abs(zoom - camera.zoom) > 0.000001) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

export function FoundationScene({
  handle,
  effects,
  calibration = null,
}: {
  handle: CinematicSceneHandle;
  effects: OpeningEffects;
  calibration?: CinematicCalibration | null;
}) {
  const fullMotion = handle.config.motion !== "reduced";
  return (
    <>
      <SceneBackdrop />
      <CinematicCamera handle={handle} />
      <Haze handle={handle} />
      {/* The whole journey: the wordmark's particles crack apart, travel to
          their organic slots and weave into the graph. Reduced motion renders
          the SAME scene at its static end frame (no dissolve, no interaction). */}
      <OpeningScene handle={handle} effects={effects} calibration={calibration} />
      {fullMotion ? <OpeningInteraction handle={handle} effects={effects} /> : null}
    </>
  );
}