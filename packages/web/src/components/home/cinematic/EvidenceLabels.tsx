// ============================================================================
// PR — INDAGO Cinematic Home Opening · Sparse DOM evidence labels
//
// The fiction anchors ("Rohan S.", "AX-4471", …) live as tiny muted text above
// the WebGL canvas — but the canvas never touches the DOM and this layer never
// touches WebGL. The R3F compute writes normalized label anchors into a shared
// preallocated OpeningPoseView every frame; this layer re-reads that buffer on
// a slow ~120ms cadence and updates ≤3 spans via style.left/top (percent units
// — no per-frame layout measurement). Positions are normalized ±1 so they map
// onto any stage size without measuring it.
// ============================================================================

"use client";

import { useEffect, useRef, useState } from "react";
import type { OpeningEffects } from "./opening/opening.types";
import type { OpeningPoseRow } from "./opening/opening.types";

interface EvidenceLabelsProps {
  effects: OpeningEffects;
}

const LABEL_READ_MS = 120;

export function EvidenceLabels({ effects }: EvidenceLabelsProps) {
  const spansRef = useRef<Array<HTMLSpanElement | null>>([]);
  const rowsRef = useRef<readonly OpeningPoseRow[]>(effects.pose.rows);
  const [rows, setRows] = useState<readonly OpeningPoseRow[]>(effects.pose.rows);

  useEffect(() => {
    setRows(effects.pose.rows);
    rowsRef.current = effects.pose.rows;
  }, [effects]);

  // Slow read of the scene's shared pose buffer. No React state here.
  useEffect(() => {
    const pose = effects.pose;
    const apply = (): void => {
      for (let k = 0; k < pose.rows.length; k += 1) {
        const span = spansRef.current[k];
        if (!span) continue;
        const row = pose.rows[k]!;
        if (row.alpha <= 0.01) {
          span.style.opacity = "0";
          continue;
        }
        const x = 50 + row.worldX * 50;
        const y = 50 - row.worldY * 50;
        span.style.left = `${x.toFixed(3)}%`;
        span.style.top = `${y.toFixed(3)}%`;
        span.style.opacity = row.alpha.toFixed(3);
      }
      for (const row of pose.rows) row.dirty = false;
    };
    apply();
    const interval = window.setInterval(apply, LABEL_READ_MS);
    return () => window.clearInterval(interval);
  }, [effects]);

  if (rows.length === 0 || !effects.pose.enabled) return null;

  return (
    <div
      className="cinematic-scene__labels"
      data-cinematic-labels=""
      aria-hidden="true"
    >
      {rows.map((row, k) => (
        <span
          key={row.nodeIndex}
          ref={(el) => {
            spansRef.current[k] = el;
          }}
          className="cinematic-scene__label"
          style={{ opacity: 0 }}
        >
          {row.text}
        </span>
      ))}
    </div>
  );
}