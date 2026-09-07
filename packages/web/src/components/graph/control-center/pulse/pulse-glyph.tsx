// ============================================================================
// F-PR6 + F-PR16 + F-PR18 — Entity Pulse glyph: one entity's enclosed circular
// field.
//
// F-PR18 redesign (large radial language): the entity is a large circular NODE
// with its analytical aura (salience halo) and continuous in-window activity
// contour behind it. Category indicators sit on the aura boundary — each is a
// real data-backed observation cluster of one category, placed at that
// category's strongest observation angle, with its strength mapped to the aura
// radius. Nothing is invented: geometry derives from the entity's own
// provider-backed observations, salience and category totals.
//
// The outer contour still MORPHS (restrained ease-out, 320 ms) between two
// deterministic states when the shared workspace timeRange changes.
// prefers-reduced-motion (or an environment without rAF/perf) renders directly
// to the target geometry.
//
// Animation state lives ONLY here (never in the shell or a global store).
// ============================================================================

"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  closedRadialPath,
  PULSE_CATEGORY_COLORS,
  PULSE_PHASE,
  PULSE_SAMPLE_COUNT,
  shortEntityLabel,
} from "@/lib/network/pulse/pulse-model";
import type { EntityPulseField } from "@/lib/network/pulse/pulse-model";

export const PULSE_GLYPH_VIEWBOX = 200;
const PULSE_GLYPH_CENTER = PULSE_GLYPH_VIEWBOX / 2;
const PULSE_GLYPH_NODE_RADIUS = 34;
const PULSE_GLYPH_HALO_RADIUS = PULSE_GLYPH_NODE_RADIUS * 1.15;
const PULSE_GLYPH_AURA_BASE = PULSE_GLYPH_NODE_RADIUS + 30;
const PULSE_GLYPH_AURA_MAX = PULSE_GLYPH_NODE_RADIUS + 46;
const PULSE_GLYPH_AURA_SPAN = PULSE_GLYPH_AURA_MAX - PULSE_GLYPH_AURA_BASE;
const PULSE_GLYPH_INDICATOR_DOT_GAP = 2;
const PULSE_GLYPH_INDICATOR_LABEL_GAP = 12;
const PULSE_GLYPH_SELECTED_RING = 95;
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
  const mappedOuter = outer.map((sample) => {
    const t = (sample - 0.22) / 0.78;
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    return PULSE_GLYPH_AURA_BASE + clamped * PULSE_GLYPH_AURA_SPAN;
  });
  const outerPath = closedRadialPath(
    mappedOuter,
    PULSE_GLYPH_CENTER,
    PULSE_GLYPH_CENTER,
    1,
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
      data-pulse-peaks-count={field.indicators.length}
      className={`h-full w-full transition-opacity duration-300 ${
        dimmed ? "opacity-40" : "opacity-100"
      } ${onSelect ? "cursor-pointer" : ""}`}
    >
      <title>{ariaLabel}</title>

      {/* Halo: faint inner circle at nodeR * 1.15 */}
      <circle
        cx={PULSE_GLYPH_CENTER}
        cy={PULSE_GLYPH_CENTER}
        r={PULSE_GLYPH_HALO_RADIUS}
        fill="none"
        stroke="var(--color-surface-400)"
        strokeWidth={1}
        strokeOpacity={0.5}
      />

      {/* Aura: continuous contour */}
      <path
        d={outerPath}
        fill={color}
        fillOpacity={field.active ? 0.14 : 0.05}
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={field.active ? 0.9 : 0.45}
      />

      {/* Category indicators */}
      {field.indicators.map((indicator) => {
        const index =
          Math.round(
            (((indicator.angle - PULSE_PHASE) % (Math.PI * 2)) +
              Math.PI * 2) %
              (Math.PI * 2) /
              (Math.PI * 2) *
              (PULSE_SAMPLE_COUNT - 1),
          ) % PULSE_SAMPLE_COUNT;
        const boundaryRadius = mappedOuter[index] ?? PULSE_GLYPH_AURA_BASE;
        const cos = Math.cos(indicator.angle);
        const sin = Math.sin(indicator.angle);
        const dotRadius = boundaryRadius + PULSE_GLYPH_INDICATOR_DOT_GAP;
        const labelRadius = boundaryRadius + PULSE_GLYPH_INDICATOR_LABEL_GAP;
        const indicatorColor = PULSE_CATEGORY_COLORS[indicator.category];
        const description = `${indicator.label}: ${indicator.count} ${indicator.count === 1 ? "observation" : "observations"}, ${(indicator.strength * 100).toFixed(0)}% strength`;
        return (
          <g
            key={indicator.category}
            data-pulse-peak
            data-pulse-peak-label={indicator.label}
            data-pulse-peak-angle={indicator.angle.toFixed(3)}
            data-pulse-peak-magnitude={indicator.strength.toFixed(3)}
            data-pulse-indicator-category={indicator.category}
            data-pulse-indicator-count={indicator.count}
          >
            <title>{description}</title>
            <circle
              cx={PULSE_GLYPH_CENTER + cos * dotRadius}
              cy={PULSE_GLYPH_CENTER + sin * dotRadius}
              r={3.5}
              fill={indicatorColor}
            />
            <line
              x1={PULSE_GLYPH_CENTER + cos * (dotRadius + 2.5)}
              y1={PULSE_GLYPH_CENTER + sin * (dotRadius + 2.5)}
              x2={PULSE_GLYPH_CENTER + cos * (labelRadius - 3)}
              y2={PULSE_GLYPH_CENTER + sin * (labelRadius - 3)}
              stroke={indicatorColor}
              strokeWidth={0.75}
              strokeOpacity={0.6}
            />
            <text
              x={PULSE_GLYPH_CENTER + cos * labelRadius}
              y={PULSE_GLYPH_CENTER + sin * labelRadius + 2.5}
              textAnchor="middle"
              fontSize={7}
              fontFamily="var(--font-mono, ui-monospace, monospace)"
              fontWeight={700}
              fill={indicatorColor}
            >
              {indicator.label}
            </text>
          </g>
        );
      })}

      {/* Center entity node */}
      <g>
        <circle
          cx={PULSE_GLYPH_CENTER}
          cy={PULSE_GLYPH_CENTER}
          r={PULSE_GLYPH_NODE_RADIUS}
          fill="var(--color-surface-0)"
        />
        <circle
          cx={PULSE_GLYPH_CENTER}
          cy={PULSE_GLYPH_CENTER}
          r={PULSE_GLYPH_NODE_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeOpacity={field.active ? 0.9 : 0.5}
        />
        <text
          x={PULSE_GLYPH_CENTER}
          y={PULSE_GLYPH_CENTER + 2.5}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fontFamily="var(--font-sans, sans-serif)"
          fill="var(--color-surface-800)"
        >
          {shortEntityLabel(field.label)}
        </text>
      </g>

      {/* Selected ring */}
      {selected && (
        <circle
          cx={PULSE_GLYPH_CENTER}
          cy={PULSE_GLYPH_CENTER}
          r={PULSE_GLYPH_SELECTED_RING}
          fill="none"
          stroke="var(--color-accent-rose)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
      )}
    </svg>
  );
});
