// ============================================================================
// PR1 · Cinematic Home — Foundation · Quality / capability config
//
// Resolves one CinematicQuality per device so desktop and mobile never share a
// single hard-coded budget. Pure — takes an environment snapshot instead of
// poking the DOM — so the tier matrix is unit-testable. Later PRs hang graph
// density / effect flags off the same tier instead of inventing new detection.
// ============================================================================

import { REDUCED_MOTION_MEDIA_QUERY } from "@/lib/theme/tokens";
import {
  CINEMATIC_SCROLL_DISTANCE_COLLAPSED_SVH,
  CINEMATIC_SCROLL_DISTANCE_SVH,
} from "./cinematic.constants";
import type {
  CinematicEnvironment,
  CinematicQuality,
} from "./cinematic.types";

/** Defaults used before hydration; replaced once the hook reads the env. */
export const BASE_CINEMATIC_QUALITY: CinematicQuality = {
  tier: "medium",
  pixelRatio: 1.75,
  motion: "full",
  interaction: true,
  scrollLength: CINEMATIC_SCROLL_DISTANCE_SVH,
};

const REDUCED_MOTION_QUALITY: CinematicQuality = {
  tier: "reduced-motion",
  pixelRatio: 1,
  motion: "reduced",
  interaction: false,
  scrollLength: CINEMATIC_SCROLL_DISTANCE_COLLAPSED_SVH,
};

const MOBILE_QUALITY: CinematicQuality = {
  tier: "mobile",
  pixelRatio: 1.5,
  motion: "full",
  interaction: false,
  scrollLength: CINEMATIC_SCROLL_DISTANCE_SVH,
};

const MEDIUM_QUALITY: CinematicQuality = {
  tier: "medium",
  pixelRatio: 2,
  motion: "full",
  interaction: true,
  scrollLength: CINEMATIC_SCROLL_DISTANCE_SVH,
};

/** Resolve a quality tier from an explicit environment snapshot. */
export function buildCinematicQuality(
  env: CinematicEnvironment,
): CinematicQuality {
  if (env.prefersReducedMotion) return REDUCED_MOTION_QUALITY;
  if (env.coarsePointer) return MOBILE_QUALITY;
  if (!env.pointerFine) return MEDIUM_QUALITY; // unknown/touch-primary desktops keep a safe default
  const pixelRatio = Math.min(Math.max(env.devicePixelRatio, 1), 2);
  return {
    ...MEDIUM_QUALITY,
    tier: env.smallViewport ? "medium" : "high",
    pixelRatio,
  };
}

/** Snapshot the browser environment. Returns null during SSR. */
export function readCinematicEnvironment(): CinematicEnvironment | null {
  if (typeof window === "undefined") return null;
  const match = (query: string): boolean => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  };
  return {
    prefersReducedMotion: match(REDUCED_MOTION_MEDIA_QUERY),
    pointerFine: match("(hover: hover) and (pointer: fine)"),
    coarsePointer: match("(pointer: coarse)"),
    devicePixelRatio: Math.max(window.devicePixelRatio || 1, 1),
    smallViewport: window.innerWidth < 768,
  };
}
