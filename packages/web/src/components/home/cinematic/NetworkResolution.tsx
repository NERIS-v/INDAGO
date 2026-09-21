// ============================================================================
// PR — INDAGO Cinematic Home Opening · Network resolution layer
//
// At the very end of the dive the soft glow discs cede the stage to the DEMO
// network's node design: circular ringed bodies with entity icons, dashed
// attention rings (contradicted → red, gap → amber, bridge/accent → rose),
// ICON-TO-ICON LINK EDGES that reach the moving circles, deterministic amber
// GRAPH HOLES over unlinked pairs, and a bounded set of entity names.
//
// Like EvidenceLabels, this layer is a pure DOM surface — the R3F pose writer
// fills the shared OpeningNetworkView every frame (normalized ±1 anchors + px
// radii) and a rAF loop here writes to ONE absolutely-positioned <div> per
// node and ONE inset-0 <svg> for all links+holes. The <svg> has NO viewBox,
// so its coordinates are raw CSS px — which EXACTLY match the node anchors'
// percent mapping (50 + nx*50 %) with zero DOM measurement. React state never
// changes per frame; child SVG nodes are resolved lazily on first write.
// ============================================================================

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { OpeningEffects } from "./opening/opening.types";
import type { OpeningNetworkRow } from "./opening/opening.types";
import { getNodeIconPath } from "@/lib/graph/node-icon-path";
import {
  OPENING_NETWORK_BODY_SCALE,
  OPENING_NETWORK_ICON_SCALE,
} from "./opening/opening.constants";

interface NetworkResolutionProps {
  effects: OpeningEffects;
  /** Off → no CSS hole-pulse animation (reduced motion). */
  animate?: boolean;
}

interface ResolvedNode {
  body: SVGCircleElement;
  ring: SVGCircleElement | null;
  icon: SVGSVGElement | null;
  label: SVGTextElement | null;
}

interface ResolvedHole {
  line: SVGLineElement;
  dot: SVGCircleElement;
  text: SVGTextElement;
}

const RING_OFFSETS = {
  none: 0,
  contradicted: 2.5,
  gap: 6.5,
  bridge: 4,
} as const;

/** Node anchor as CSS px given the container's CSS px size and the matched
 *  normalized anchor. Percent mapping = px mapping, if and only if the svg
 *  uses raw px units (no viewBox) and fills the same container. */
function anchorPx(normalized: number, cssLength: number): number {
  return ((50 + normalized * 50) / 100) * cssLength;
}

export function NetworkResolution({
  effects,
  animate = true,
}: NetworkResolutionProps) {
  const rootsRef = useRef<Array<HTMLDivElement | null>>([]);
  const resolvedRef = useRef<Array<ResolvedNode | null>>([]);
  const edgeRefsRef = useRef<Array<SVGLineElement | null>>([]);
  const holeGroupsRefRef = useRef<Array<SVGGElement | null>>([]);
  const resolvedHolesRef = useRef<Array<ResolvedHole | null>>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef({ width: 1, height: 1 });
  const [rows, setRows] = useState<readonly OpeningNetworkRow[]>(
    effects.network.rows,
  );

  const edges = useMemo(
    () => effects.network.edges,
    [effects],
  );
  const holes = useMemo(
    () => effects.network.holes,
    [effects],
  );

  useEffect(() => {
    setRows(effects.network.rows);
  }, [effects]);

  // Container size once + on resize only (edges render in CSS px, so the
  // anchors need the real box; percent-based anchors handle it for free).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = (): void => {
      const rect = root.getBoundingClientRect();
      sizeRef.current = {
        width: rect.width > 1 ? rect.width : 1,
        height: rect.height > 1 ? rect.height : 1,
      };
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(root);
      return () => ro.disconnect();
    }
    if (typeof window !== "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    return undefined;
  }, []);

  useEffect(() => {
    const view = effects.network;
    if (!view.enabled) return;

    const apply = (): void => {
      // Cached container px size (ResizeObserver), never measured per frame.
      const safeW = sizeRef.current.width;
      const safeH = sizeRef.current.height;

      // Node anchors first, so edges/holes below read CURRENT positions.
      for (let k = 0; k < view.rows.length; k += 1) {
        const row = view.rows[k]!;
        if (!row.dirty) continue;
        row.dirty = false;
        const el = rootsRef.current[k];
        if (!el) continue;
        if (row.alpha <= 0.01) {
          el.style.opacity = "0";
          el.style.visibility = "hidden";
          continue;
        }

        let node = resolvedRef.current[k];
        if (!node) {
          const body = el.querySelector<SVGCircleElement>(
            ".cinematic-scene__net-body",
          );
          if (!body) continue;
          node = {
            body,
            ring: el.querySelector<SVGCircleElement>(
              ".cinematic-scene__net-ring",
            ),
            icon: el.querySelector<SVGSVGElement>(
              ".cinematic-scene__net-icon",
            ),
            label: el.querySelector<SVGTextElement>(
              ".cinematic-scene__net-label",
            ),
          };
          resolvedRef.current[k] = node;
        }

        el.style.visibility = "visible";
        el.style.left = `${(50 + row.worldX * 50).toFixed(3)}%`;
        el.style.top = `${(50 - row.worldY * 50).toFixed(3)}%`;
        el.style.opacity = row.alpha.toFixed(3);

        const svg = el.querySelector<SVGSVGElement>(
          ".cinematic-scene__net-svg",
        );
        const r = Math.max(0.25, row.radiusPx);
        if (svg) {
          svg.setAttribute("width", String(2 * r));
          svg.setAttribute("height", String(2 * r));
          svg.setAttribute("viewBox", `${-r} ${-r} ${2 * r} ${2 * r}`);
        }
        const bodyR = r * OPENING_NETWORK_BODY_SCALE;
        node.body.setAttribute("r", bodyR.toFixed(2));
        if (node.ring) {
          node.ring.setAttribute(
            "r",
            (bodyR + RING_OFFSETS[row.ring]).toFixed(2),
          );
        }
        const iconBox = bodyR * OPENING_NETWORK_ICON_SCALE;
        if (node.icon) {
          node.icon.setAttribute("x", String(-iconBox));
          node.icon.setAttribute("y", String(-iconBox));
          node.icon.setAttribute("width", String(2 * iconBox));
          node.icon.setAttribute("height", String(2 * iconBox));
        }
        if (node.label) {
          node.label.setAttribute("y", String(-bodyR - 10));
        }
      }

      // Icon-to-icon LINKS: endpoints are the node rows' CURRENT dived
      // anchors — the crisp edges genuinely reach the moving icon circles.
      const rowByIndex = new Map<number, OpeningNetworkRow>();
      for (const row of view.rows) rowByIndex.set(row.nodeIndex, row);
      for (let k = 0; k < view.edges.length; k += 1) {
        const link = view.edges[k]!;
        const line = edgeRefsRef.current[k];
        if (!line) continue;
        const a = rowByIndex.get(link.aIndex);
        const b = rowByIndex.get(link.bIndex);
        if (!a || !b || link.alpha <= 0.005) {
          line.setAttribute("opacity", "0");
          link.dirty = false;
          continue;
        }
        line.setAttribute("x1", anchorPx(a.worldX, safeW).toFixed(2));
        line.setAttribute("y1", anchorPx(-a.worldY, safeH).toFixed(2));
        line.setAttribute("x2", anchorPx(b.worldX, safeW).toFixed(2));
        line.setAttribute("y2", anchorPx(-b.worldY, safeH).toFixed(2));
        line.setAttribute("opacity", link.alpha.toFixed(3));
        link.dirty = false;
      }

      // GRAPH HOLES: dashed amber gap + "?" badge at the pair midpoint.
      for (let k = 0; k < view.holes.length; k += 1) {
        const hole = view.holes[k]!;
        const group = holeGroupsRefRef.current[k];
        if (!group) continue;
        let g = resolvedHolesRef.current[k];
        if (!g) {
          const line = group.querySelector<SVGLineElement>(
            ".cinematic-scene__net-hole",
          );
          const dot = group.querySelector<SVGCircleElement>(
            ".cinematic-scene__net-hole-dot",
          );
          const text = group.querySelector<SVGTextElement>(
            ".cinematic-scene__net-hole-text",
          );
          if (!line || !dot || !text) continue;
          g = { line, dot, text };
          resolvedHolesRef.current[k] = g;
        }
        if (hole.alpha <= 0.005) {
          g.line.setAttribute("opacity", "0");
          g.dot.setAttribute("opacity", "0");
          g.text.setAttribute("opacity", "0");
          hole.dirty = false;
          continue;
        }
        const a = rowByIndex.get(hole.aIndex);
        const b = rowByIndex.get(hole.bIndex);
        if (!a || !b) {
          hole.dirty = false;
          continue;
        }
        const opacity = hole.alpha.toFixed(3);
        g.line.setAttribute("x1", anchorPx(a.worldX, safeW).toFixed(2));
        g.line.setAttribute("y1", anchorPx(-a.worldY, safeH).toFixed(2));
        g.line.setAttribute("x2", anchorPx(b.worldX, safeW).toFixed(2));
        g.line.setAttribute("y2", anchorPx(-b.worldY, safeH).toFixed(2));
        g.line.setAttribute("opacity", opacity);
        const mx = anchorPx(hole.midWorldX, safeW);
        const my = anchorPx(-hole.midWorldY, safeH);
        g.dot.setAttribute("cx", mx.toFixed(2));
        g.dot.setAttribute("cy", my.toFixed(2));
        g.dot.setAttribute("opacity", opacity);
        g.text.setAttribute("x", mx.toFixed(2));
        g.text.setAttribute("y", my.toFixed(2));
        g.text.setAttribute("opacity", opacity);
        hole.dirty = false;
      }
    };
    apply();
    let raf = window.requestAnimationFrame(function loop() {
      apply();
      raf = window.requestAnimationFrame(loop);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [effects]);

  if (!effects.network.enabled || rows.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className="cinematic-scene__network"
      data-cinematic-network=""
      data-net-animated={animate ? "true" : undefined}
      aria-hidden="true"
    >
      <svg className="cinematic-scene__net-edges">
        {edges.map((link, k) => (
          <line
            key={`net-edge-${link.aIndex}-${link.bIndex}`}
            ref={(el) => {
              edgeRefsRef.current[k] = el;
            }}
            className="cinematic-scene__net-edge"
            opacity={0}
          />
        ))}
        {holes.map((hole, k) => (
          <g
            key={`net-hole-${hole.aIndex}-${hole.bIndex}`}
            ref={(el) => {
              holeGroupsRefRef.current[k] = el;
            }}
          >
            <line className="cinematic-scene__net-hole" opacity={0} />
            <circle className="cinematic-scene__net-hole-dot" r={13} opacity={0} />
            <text
              className="cinematic-scene__net-hole-text"
              textAnchor="middle"
              dominantBaseline="central"
              opacity={0}
            >
              ?
            </text>
          </g>
        ))}
      </svg>

      {rows.map((row, k) => (
        <div
          key={`net-${row.nodeIndex}`}
          ref={(el) => {
            rootsRef.current[k] = el;
          }}
          className="cinematic-scene__net-node"
          data-resolve-ring={row.ring}
          data-resolve-label={row.showLabel ? "true" : undefined}
          style={{ opacity: 0, visibility: "hidden" }}
          data-node-index={row.nodeIndex}
        >
          <svg
            className="cinematic-scene__net-svg"
            width={0}
            height={0}
            viewBox="0 0 0 0"
          >
            <circle className="cinematic-scene__net-body" r={0} />
            {row.ring !== "none" ? (
              <circle
                className="cinematic-scene__net-ring"
                r={0}
                strokeDasharray={row.ring === "contradicted" ? "3 4" : "4 5"}
              />
            ) : null}
            <svg
              className="cinematic-scene__net-icon"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                d={getNodeIconPath({
                  type: "ENTITY",
                  label: row.label,
                })}
              />
            </svg>
            {row.showLabel ? (
              <text className="cinematic-scene__net-label" textAnchor="middle">
                {row.label}
              </text>
            ) : null}
          </svg>
        </div>
      ))}
    </div>
  );
}