// ============================================================================
// F-PR6 + F-PR16 + F-PR18 + F-PR19 — Entity Pulse glyph: one entity's enclosed,
// continuous organic activity field.
//
// F-PR19 redesign (fully organic, sector-coloured):
//  • ONE continuous, closed, organic field whose radius varies smoothly around
//    the circumference (never a circle with radial bars, never a regular ring).
//  • The circumference is divided into SEMANTIC ACTIVITY SECTORS, one per
//    observed category. Each sector contributes its own bounded local
//    deformation (a smooth wave scaled by that category's relative strength)
//    and its own subtle hue, and the sector hues blend smoothly into their
//    neighbours via a raised-cosine opacity ramp that fades to the shared
//    neutral field at every sector boundary.
//  • Stronger activity ⇒ larger local wave/expansion; weaker activity stays
//    near the calm baseline.
//  • Short categorical labels (FIN, COMM, LOC, IDN, XCS, OTH) sit just outside
//    their sector, joined by a subtle leader line.
//  • NO dates and NO calendar positions on the Pulse — the Timeline remains the
//    only temporal display.
//  • The centre remains a large graph-node-like entity (icon/name node).
//  • Same data + same timeRange ⇒ identical geometry at rest. No random
//    breathing and no per-frame noise — every sample, angle and opacity is
//    derived deterministically from the entity's provider-backed observations.
//  • The contour is a LIVING field: a slow, per-entity CSS drift (a full spin
//    plus a gentle breathe, ~36–50 s, seeded by a stable hash of the entity id,
//    reversed for half of all entities) animates the WHOLE organic field so it
//    reads as real activity over time. The drift never redraws geometry per
//    frame — every angle/sample/opacity data attribute stays stable — and it
//    switches off under prefers-reduced-motion.
//
// The outer contour still MORPHS (restrained ease-out, 320 ms) between two
// deterministic states when the shared workspace timeRange changes.
// prefers-reduced-motion (or an environment without rAF/perf) renders directly
// to the target geometry.
//
// Animation state lives ONLY here (never in the shell or a global store).
// ============================================================================

"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  closedRadialPath,
  PULSE_CATEGORY_COLORS,
  PULSE_PHASE,
  PULSE_SAMPLE_COUNT,
  shortEntityLabel,
  stableHash,
} from "@/lib/network/pulse/pulse-model";
import type {
  EntityPulseField,
  EntityPulseIndicator,
  PulseCategory,
} from "@/lib/network/pulse/pulse-model";

export const PULSE_GLYPH_VIEWBOX = 200;
const PULSE_GLYPH_CENTER = PULSE_GLYPH_VIEWBOX / 2;
const PULSE_GLYPH_NODE_RADIUS = 42;
const PULSE_GLYPH_HALO_RADIUS = PULSE_GLYPH_NODE_RADIUS * 1.15;
const PULSE_GLYPH_AURA_BASE = 70;
const PULSE_GLYPH_AURA_MAX = 88;
const PULSE_GLYPH_AURA_SPAN = PULSE_GLYPH_AURA_MAX - PULSE_GLYPH_AURA_BASE;
const PULSE_GLYPH_SECTOR_INNER = PULSE_GLYPH_NODE_RADIUS + 2;
const PULSE_GLYPH_LABEL_MAX_RADIUS = 97;
const PULSE_GLYPH_LABEL_GAP = 11;
const PULSE_GLYPH_SELECTED_RING = 99;
const TWO_PI = Math.PI * 2;
const MORPH_DURATION_MS = 320;
const EASE_OUT_CUBIC = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Live-drift animation applied to the WHOLE organic field (never to the node,
 * halo, or selection ring). A slow spin + breathe makes the contour read as
 * living activity over time while keeping every data attribute stable. Fully
 * disabled under prefers-reduced-motion. Inert in test/jsdom environments
 * (CSS animation is not evaluated), so geometry determinism is preserved.
 */
const LIVE_DRIFT_KEYFRAMES = `
@keyframes pulse-live-drift-spin-breathe {
  0%, 100% { transform: rotate(0deg) scale(1); }
  25% { transform: rotate(90deg) scale(1.015); }
  50% { transform: rotate(180deg) scale(1); }
  75% { transform: rotate(270deg) scale(0.985); }
}
.pulse-live-drift {
  animation-name: pulse-live-drift-spin-breathe;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform;
}
@media (prefers-reduced-motion: reduce) {
  .pulse-live-drift { animation: none !important; }
}
`;

/** Per-entity drift timing, deterministic from a stable hash of the entity id:
 *  a 36–50 s period, a phase offset so entities start mid-stream, and a
 *  clockwise/counter-clockwise direction shared by roughly half of entities. */
function liveDriftStyle(entityId: string | undefined): CSSProperties {
  const seed = stableHash(`pulse-live-drift:${entityId ?? ""}`);
  const period = 36000 + (seed % 14000);
  const delay = -((seed >> 5) % 70000);
  const direction = (seed >> 3) % 2 === 1 ? "reverse" : "normal";
  return {
    animationDuration: `${period}ms`,
    animationDelay: `${delay}ms`,
    animationDirection: direction,
    transformOrigin: "50% 50%",
  };
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Normalise an angle (PULSE_PHASE-relative) into [0, 2π). */
function normalizeAngle(angle: number): number {
  const a = (angle - PULSE_PHASE) % TWO_PI;
  return a < 0 ? a + TWO_PI : a;
}

/** Clockwise angular distance from a to b in [0, 2π). */
function cwDist(a: number, b: number): number {
  return (b - a + TWO_PI) % TWO_PI;
}

/** Radius of the organic contour at an arbitrary angle, lerped between samples. */
function radiusAtAngle(
  mapped: readonly number[],
  angle: number,
): number {
  const n = mapped.length;
  if (n === 0) return PULSE_GLYPH_AURA_BASE;
  const f = (normalizeAngle(angle) / TWO_PI) * n;
  const i0 = Math.floor(f) % n;
  const i1 = (i0 + 1) % n;
  const frac = f - Math.floor(f);
  return mapped[i0]! + (mapped[i1]! - mapped[i0]!) * frac;
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

interface SectorGeometry {
  readonly indicator: EntityPulseIndicator;
  /** Sector angular start (normalised, [0, 2π)). */
  readonly start: number;
  /** Sector angular width (2π / sectorCount, so every sector is equal). */
  readonly span: number;
}

/**
 * Deterministic partition of the circle into EQUAL angular sectors, one per
 * activity indicator. Each sector owns an equal arc of the perimeter, so labels
 * sit equally spaced around the field regardless of how clustered the raw
 * observation angles are. Sector order follows the stable indicator order.
 */
function buildSectors(
  indicators: readonly EntityPulseIndicator[],
): readonly SectorGeometry[] {
  const n = indicators.length;
  if (n === 0) return [];
  if (n === 1) {
    return [{ indicator: indicators[0]!, start: 0, span: TWO_PI }];
  }
  const span = TWO_PI / n;
  // Stable reference order (category order) so the sector layout is
  // deterministic and independent of observation-angle clustering.
  return indicators.map((indicator, index) => ({
    indicator,
    start: (index / n) * TWO_PI,
    span,
  }));
}

/**
 * Raised-cosine field intensity: peaks mid-sector, 0 at both edges, so adjacent
 * sectors blend smoothly into the shared neutral field. A single-sector (or
 * lone calm) entity keeps a uniform intensity — no artificial rim dip.
 */
function sectorIntensity(
  sectors: readonly SectorGeometry[],
  sectorIndex: number,
  angle: number,
  single: boolean,
): number {
  if (single) return 1;
  const sector = sectors[sectorIndex]!;
  const t = cwDist(sector.start, angle) / sector.span;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.pow(Math.sin(Math.PI * clamped), 0.9);
}

/**
 * Deterministic, entity-specific irregular wave distortion of the outer aura.
 *
 * A realistic "pulse wave" is never a single smooth raised-cosine blob — it is
 * the superposition of several incommensurate sine harmonics with per-entity,
 * per-category phase offsets, so the contour looks organic and alive rather
 * than a uniform balloon. Everything is derived from a stable hash of the
 * entity id + the indicator category, so:
 *  • every Case B entity gets its OWN distinct, irregular wave signature, and
 *  • identical (entity, observation set, timeRange) ⇒ identical geometry
 *    (no Math.random, no Date.now, no per-frame noise — the determinism
 *    contract in the model header is preserved).
 *
 * `t` is the normalised angular position [0, 1) around the circumference; the
 * result is a multiplier already scaled to sit inside [0, 1].
 */
function irregularWave(entityId: string, category: PulseCategory, t: number): number {
  // Per-cell phase offsets so adjacent cells break symmetry (no repeating band).
  const p1 =
    ((stableHash(`${entityId}|${category}|w1`) % 628) / 628) * Math.PI * 2;
  const p2 =
    ((stableHash(`${entityId}|${category}|w2`) % 628) / 628) * Math.PI * 2;
  const p3 =
    ((stableHash(`${entityId}|${category}|w3`) % 628) / 628) * Math.PI * 2;
  const p4 =
    ((stableHash(`${entityId}|${category}|w4`) % 628) / 628) * Math.PI * 2;

  // 4 incommensurate harmonics, ALL ≥ 1.5 cycles around the face (≈1.7, ≈3.1,
  // ≈5.3, and ≈12.9 cycles). No sub-cycle "lope": a below-one-cycle term biases
  // the whole bulge to a single hemisphere (the field reads "only in one
  // direction"). With every term above one cycle, the wave peaks sweep around
  // the full circumference and the contour stays evenly multi-directional —
  // whichever way the strongest harmonic sits, opposite sectors still deform.
  const harmonic =
    0.30 * Math.sin(2 * Math.PI * t * 1.7 + p1) +
    0.24 * Math.sin(2 * Math.PI * t * 3.1 + p2) +
    0.22 * Math.sin(2 * Math.PI * t * 5.3 + p3) +
    0.14 * Math.sin(2 * Math.PI * t * 12.9 + p4);

  // Map the sum (roughly [-0.90, 0.90]) onto [0, 1], gently compressed at the
  // extremes so it never spikes into a degenerate circle.
  return 0.5 + 0.5 * Math.max(-1, Math.min(1, harmonic * 1.08));
}

/**
 * Sector-driven organic field: 96 radii, one per sample angle. Every sample
 * belongs to exactly one equal sector; the radius there grows from the calm
 * baseline by that sector's strength times an entity-specific irregular wave
 * (see irregularWave). Stronger activity ⇒ a larger local wave/expansion;
 * weaker activity stays near the calm baseline. The superposed harmonics make
 * the contour genuinely irregular (never a perfect circle and never a
 * repeating smooth lobe), while staying a pure, deterministic function of the
 * indicators + entity id — identical inputs ⇒ identical geometry.
 */
function buildSectorRadii(
  sectors: readonly SectorGeometry[],
  entityId: string,
): number[] {
  const radii: number[] = [];
  const single = sectors.length === 1;
  for (let i = 0; i < PULSE_SAMPLE_COUNT; i += 1) {
    const angle = normalizeAngle(PULSE_PHASE + (i / PULSE_SAMPLE_COUNT) * TWO_PI);
    const t = i / PULSE_SAMPLE_COUNT;
    let radius = PULSE_GLYPH_AURA_BASE;
    if (sectors.length > 0) {
      if (single) {
        const sector = sectors[0]!;
        const wave = irregularWave(entityId, sector.indicator.category, t);
        radius =
          PULSE_GLYPH_AURA_BASE + sector.indicator.strength * wave * PULSE_GLYPH_AURA_SPAN;
      } else {
        for (let s = 0; s < sectors.length; s += 1) {
          if (cwDist(sectors[s]!.start, angle) < sectors[s]!.span) {
            const local = cwDist(sectors[s]!.start, angle) / sectors[s]!.span;
            const wave = irregularWave(entityId, sectors[s]!.indicator.category, t);
            const sectorWave =
              wave * (0.7 + 0.3 * Math.pow(Math.sin(Math.PI * local), 0.9));
            radius =
              PULSE_GLYPH_AURA_BASE +
              sectors[s]!.indicator.strength * sectorWave * PULSE_GLYPH_AURA_SPAN;
            break;
          }
        }
      }
    }
    radii.push(radius);
  }
  return radii;
}

/** One annular trapezoid between two adjacent contour samples. */
function wedgePolygon(
  angleA: number,
  radiusA: number,
  angleB: number,
  radiusB: number,
): string {
  const ax = PULSE_GLYPH_CENTER + Math.cos(angleA) * radiusA;
  const ay = PULSE_GLYPH_CENTER + Math.sin(angleA) * radiusA;
  const bx = PULSE_GLYPH_CENTER + Math.cos(angleB) * radiusB;
  const by = PULSE_GLYPH_CENTER + Math.sin(angleB) * radiusB;
  const axI = PULSE_GLYPH_CENTER + Math.cos(angleA) * PULSE_GLYPH_SECTOR_INNER;
  const ayI = PULSE_GLYPH_CENTER + Math.sin(angleA) * PULSE_GLYPH_SECTOR_INNER;
  const bxI = PULSE_GLYPH_CENTER + Math.cos(angleB) * PULSE_GLYPH_SECTOR_INNER;
  const byI = PULSE_GLYPH_CENTER + Math.sin(angleB) * PULSE_GLYPH_SECTOR_INNER;
  return `${ax.toFixed(3)},${ay.toFixed(3)} ${bx.toFixed(3)},${by.toFixed(3)} ${bxI.toFixed(3)},${byI.toFixed(3)} ${axI.toFixed(3)},${ayI.toFixed(3)}`;
}

export const PulseGlyph = memo(function PulseGlyph({
  field,
  dimmed = false,
  selected = false,
  ariaLabel,
  onSelect,
}: PulseGlyphProps) {
  // Deterministic semantic sectors (one per active category, EQUAL arcs).
  const sectors = buildSectors(field.indicators);
  const singleSector = sectors.length === 1;

  // Sector-driven organic field. Memoized on the indicators list identity so
  // the morph target stays stable between recomputes (same data ⇒ same
  // geometry; no per-frame re-animation).
  const sectorRadii = useMemo(
    () => buildSectorRadii(sectors, field.entityId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [field.indicators, field.entityId],
  );
  const mappedOuter = useMorphSamples(sectorRadii);
  const outerPath = closedRadialPath(
    mappedOuter,
    PULSE_GLYPH_CENTER,
    PULSE_GLYPH_CENTER,
    1,
    PULSE_PHASE,
  );
  const color = PULSE_CATEGORY_COLORS[field.category];

  // Per-sample sector assignment + field intensity (raised-cosine blending).
  const sampleSector: number[] = [];
  const sampleIntensity: number[] = [];
  for (let i = 0; i < PULSE_SAMPLE_COUNT; i += 1) {
    const angle = PULSE_PHASE + (i / PULSE_SAMPLE_COUNT) * TWO_PI;
    let sectorIndex = -1;
    let intensity = 0;
    if (sectors.length > 0) {
      if (singleSector) {
        sectorIndex = 0;
        intensity = sectorIntensity(sectors, 0, normalizeAngle(angle), true);
      } else {
        const a = normalizeAngle(angle);
        for (let s = 0; s < sectors.length; s += 1) {
          if (cwDist(sectors[s]!.start, a) < sectors[s]!.span) {
            sectorIndex = s;
            intensity = sectorIntensity(sectors, s, a, false);
            break;
          }
        }
      }
    }
    sampleSector.push(sectorIndex);
    sampleIntensity.push(intensity);
  }

  interface SectorRender {
    readonly indicator: EntityPulseIndicator;
    readonly polygons: readonly { points: string; opacity: number; color: string }[];
    readonly labelRadius: number;
    readonly angle: number;
  }

  const sectorRenders: SectorRender[] = sectors.map((sector, s) => {
    const polygons: { points: string; opacity: number; color: string }[] = [];
    const sectorColor = PULSE_CATEGORY_COLORS[sector.indicator.category];
    for (let i = 0; i < PULSE_SAMPLE_COUNT; i += 1) {
      if (sampleSector[i] !== s) continue;
      const iNext = (i + 1) % PULSE_SAMPLE_COUNT;
      const angleA = PULSE_PHASE + (i / PULSE_SAMPLE_COUNT) * TWO_PI;
      const angleB = PULSE_PHASE + (iNext / PULSE_SAMPLE_COUNT) * TWO_PI;
      const opacity =
        sector.indicator.strength * (sampleIntensity[i] ?? 0);
      polygons.push({
        points: wedgePolygon(
          angleA,
          mappedOuter[i]!,
          angleB,
          mappedOuter[iNext]!,
        ),
        opacity,
        color: sectorColor,
      });
    }
    const angle = PULSE_PHASE + sector.start + sector.span / 2;
    const contourR = radiusAtAngle(mappedOuter, angle);
    const labelRadius = Math.min(
      contourR + PULSE_GLYPH_LABEL_GAP,
      PULSE_GLYPH_LABEL_MAX_RADIUS,
    );
    return {
      indicator: sector.indicator,
      polygons,
      labelRadius,
      angle,
    };
  });

  const label = (render: SectorRender) => {
    const cos = Math.cos(render.angle);
    const sin = Math.sin(render.angle);
    const dotRadius = render.labelRadius - 6;
    return (
      <>
        <circle
          cx={PULSE_GLYPH_CENTER + cos * dotRadius}
          cy={PULSE_GLYPH_CENTER + sin * dotRadius}
          r={3}
          fill={PULSE_CATEGORY_COLORS[render.indicator.category]}
        />
        <line
          x1={PULSE_GLYPH_CENTER + cos * (dotRadius + 3)}
          y1={PULSE_GLYPH_CENTER + sin * (dotRadius + 3)}
          x2={PULSE_GLYPH_CENTER + cos * (render.labelRadius - 2)}
          y2={PULSE_GLYPH_CENTER + sin * (render.labelRadius - 2)}
          stroke={PULSE_CATEGORY_COLORS[render.indicator.category]}
          strokeWidth={0.75}
          strokeOpacity={0.65}
        />
        <text
          x={PULSE_GLYPH_CENTER + cos * render.labelRadius}
          y={PULSE_GLYPH_CENTER + sin * render.labelRadius + 2.5}
          textAnchor="middle"
          fontSize={7}
          fontFamily="var(--font-mono, ui-monospace, monospace)"
          fontWeight={700}
          fill={PULSE_CATEGORY_COLORS[render.indicator.category]}
        >
          {render.indicator.label}
        </text>
      </>
    );
  };

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
      data-pulse-peaks-count={sectorRenders.length}
      className={`h-full w-full transition-opacity duration-300 ${
        dimmed ? "opacity-40" : "opacity-100"
      } ${onSelect ? "cursor-pointer" : ""}`}
    >
      <style>{LIVE_DRIFT_KEYFRAMES}</style>
      <title>{ariaLabel}</title>

      {/* Salience halo: faint inner circle just outside the node. */}
      <circle
        cx={PULSE_GLYPH_CENTER}
        cy={PULSE_GLYPH_CENTER}
        r={PULSE_GLYPH_HALO_RADIUS}
        fill="none"
        stroke="var(--color-surface-400)"
        strokeWidth={1}
        strokeOpacity={0.4}
      />

      {/* The LIVING organic field: the whole contour (base wash, sectors,
          labels, crisp boundary) drifts as one per-entity animated group so it
          reads as activity over time while geometry stays deterministic. */}
      <g
        className="pulse-live-drift"
        style={liveDriftStyle(field.entityId)}
        data-pulse-live-drift="true"
      >
        {/* Continuous organic field: shared neutral base wash. */}
        <path
          d={outerPath}
          fill={color}
          fillOpacity={field.active ? 0.07 : 0.03}
          stroke="none"
        />

        {/* Semantic activity sectors — each a bounded, blended hue lobe. */}
        {sectorRenders.map((render) => (
          <g
            key={render.indicator.category}
            data-pulse-peak
            data-pulse-peak-label={render.indicator.label}
            data-pulse-peak-angle={render.indicator.angle.toFixed(3)}
            data-pulse-peak-magnitude={render.indicator.strength.toFixed(3)}
            data-pulse-indicator-category={render.indicator.category}
            data-pulse-indicator-count={render.indicator.count}
          >
            <title>{`${render.indicator.label}: ${render.indicator.count} ${render.indicator.count === 1 ? "observation" : "observations"}, ${(render.indicator.strength * 100).toFixed(0)}% strength`}</title>
            {render.polygons.map((polygon, p) => (
              <polygon
                key={p}
                points={polygon.points}
                fill={polygon.color}
                fillOpacity={polygon.opacity}
                stroke="none"
              />
            ))}
            {label(render)}
          </g>
        ))}

        {/* Crisp organic boundary of the continuous field. */}
        <path
          d={outerPath}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeOpacity={field.active ? 0.55 : 0.25}
        />
      </g>

      {/* Centre entity node (large, graph-node-like). */}
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
