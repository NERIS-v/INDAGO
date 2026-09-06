// ============================================================================
// F-PR6 — Entity Pulse glyph (corrective pass): one entity's enclosed field.
//
// A single, memoized, localized SVG. The outer contour is the entity's own
// continuous activity field; the inner halo is its analytical salience. The
// contour MORPHS (restrained ease-out, 320 ms, IDLE→MORPH→SETTLE→IDLE) between
// two deterministic states when the shared workspace timeRange changes — both
// start and end timeline handles alter geometry through the derived overview.
// prefers-reduced-motion (or a jsdom/embed environment without rAF/perf) skips
// the morph and renders directly to the target geometry.
//
// Animation state lives ONLY here (never in the shell or a global store), so a
// time-range drag does not rerender the surrounding workspace.
// ============================================================================

"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  closedRadialPath,
  PULSE_CATEGORY_COLORS,
  PULSE_PHASE,
  PULSE_SAMPLE_COUNT,
} from "@/lib/network/pulse/pulse-model";
import type { EntityPulseField } from "@/lib/network/pulse/pulse-model";

export const PULSE_GLYPH_VIEWBOX = 100;
const PULSE_GLYPH_CENTER = PULSE_GLYPH_VIEWBOX / 2;
const PULSE_GLYPH_FIELD_SCALE = 34;
const MORPH_DURATION_MS = 320;
const EASE_OUT_CUBIC = (t: number) => 1 - Math.pow(1 - t, 3);

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Localized contour morph. When the target sample set changes (a real temporal
 * recompute), animates the displayed radii toward it. Any environment without
 * lifecycle rAF/perf, or which prefers reduced motion, snaps to the target.
 */
function useMorphSamples(target: readonly number[]): readonly number[] {
  const fromRef = useRef<readonly number[]>(target);
  const rafRef = useRef<number | null>(null);
  const [display, setDisplay] = useState<readonly number[]>(target);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    if (
      prefersReducedMotion() ||
      typeof requestAnimationFrame !== "function" ||
      typeof cancelAnimationFrame !== "function" ||
      typeof performance === "undefined"
    ) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    const started = performance.now();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / MORPH_DURATION_MS);
      const k = EASE_OUT_CUBIC(t);
      setDisplay(from.map((value, i) => value + ((target[i] ?? 0) - value) * k));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target]);

  return display;
}

interface PulseGlyphProps {
  readonly field: EntityPulseField;
  /** De-emphasized (not the focused/selected entity). */
  readonly dimmed?: boolean;
  readonly selected?: boolean;
  readonly ariaLabel: string;
  readonly onSelect?: () => void;
}

export const PulseGlyph = memo(function PulseGlyph({
  field,
  dimmed = false,
  selected = false,
  ariaLabel,
  onSelect,
}: PulseGlyphProps) {
  const outer = useMorphSamples(field.outerSamples);
  const outerPath = closedRadialPath(
    outer,
    PULSE_GLYPH_CENTER,
    PULSE_GLYPH_CENTER,
    PULSE_GLYPH_FIELD_SCALE,
    PULSE_PHASE,
  );
  const innerPath = closedRadialPath(
    field.innerSamples,
    PULSE_GLYPH_CENTER,
    PULSE_GLYPH_CENTER,
    PULSE_GLYPH_FIELD_SCALE,
    PULSE_PHASE,
  );
  const color = PULSE_CATEGORY_COLORS[field.category];

  return (
    <svg
      viewBox={`0 0 ${PULSE_GLYPH_VIEWBOX} ${PULSE_GLYPH_VIEWBOX}`}
      role="img"
      aria-label={ariaLabel}
      data-pulse-entity={field.entityId}
      data-pulse-sample-count={PULSE_SAMPLE_COUNT}
      data-pulse-entity-active={String(field.active)}
      data-pulse-entity-observation-count={field.observationCount}
      data-pulse-entity-category={field.category}
      data-pulse-entity-salience={
        field.salienceAvailable ? String(field.salience) : "unavailable"
      }
      className={`h-full w-full transition-opacity duration-300 ${
        dimmed ? "opacity-40" : "opacity-100"
      } ${onSelect ? "cursor-pointer" : ""}`}
    >
      <title>{ariaLabel}</title>
      <path
        d={innerPath}
        fill="none"
        stroke="var(--color-surface-400)"
        strokeWidth={0.75}
        strokeOpacity={0.5}
      />
      <path
        d={outerPath}
        fill={color}
        fillOpacity={field.active ? 0.14 : 0.05}
        stroke={color}
        strokeWidth={1}
        strokeOpacity={field.active ? 0.9 : 0.45}
      />
      <circle cx={PULSE_GLYPH_CENTER} cy={PULSE_GLYPH_CENTER} r={3} fill="var(--color-surface-700)" />
      {selected && (
        <circle
          cx={PULSE_GLYPH_CENTER}
          cy={PULSE_GLYPH_CENTER}
          r={PULSE_GLYPH_VIEWBOX / 2 - 1.5}
          fill="none"
          stroke="var(--color-accent-rose)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      )}
    </svg>
  );
});