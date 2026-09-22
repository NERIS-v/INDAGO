// ============================================================================
// PR — INDAGO Cinematic Home Story Act · Beat copy
//
// The twelve narrative beats of the post-intro act, rendered inside the pinned
// STAGE (an in-flow sibling of the canvas/wordmark layer). Every beat is
// scrubbed purely by CSS: the controller publishes the global story fraction t
// as --story-t on the TRACK (inherited down through the stage), and each beat
// exposes a pair of FADE WINDOWS — --in-a + --in-s (arrival point + slope) and
// --out-a + --out-s — computed from STORY_SECTION_LENGTHS_SVH so beats crossfade
// exactly where the camera keys move. A beat's opacity is
//   fadeIn(t) · (1 − fadeOut(t))   (both clamped 0..1)
// so a beat is fully invisible while t = −1 (the intro owns the stage) and
// never needs React state or a rAF to move.
//
// Copy contract (honesty): Gap = philosophy only; Time = conceptual ranges,
// never a fabricated timestamp; Cross-case = ONE line; the possible-match 0.51
// and the +0.14 gain are bare numbers with no downstream claim; the lead is
// explicitly "a candidate, not a verdict"; nothing references the judge; no
// robustness claim is made.
//
// The whole layer is aria-hidden: the cinematic is the home page's atmosphere,
// and the real content (including the workspace CTA) lives in the documents
// that follow this section.
// ============================================================================

"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  STORY_SECTION_COUNT,
  STORY_SECTION_LENGTHS_SVH,
  STORY_TOTAL_LENGTH_SVH,
} from "./story.constants";

interface BeatWindow {
  inA: number;
  inS: number;
  outA: number;
  outS: number;
}

/** The fade window for one beat, in story-fraction units. Each beat fades in
 *  over the FIRST 18% of its span and out over the LAST 18% (the closing beat
 *  never fades out — it must hold through s = 1). Values are (point, slope)
 *  pairs so the CSS calc stays a pure multiply. */
function beatWindow(slot: number, start: number, span: number): BeatWindow {
  const edge = Math.max(span * 0.18, 1e-4);
  const isLast = slot === STORY_SECTION_COUNT - 1;
  return {
    inA: start,
    inS: 1 / edge,
    outA: isLast ? 2 : start + span * 0.82,
    outS: isLast ? 1 : 1 / edge,
  };
}

interface BeatProps {
  /** 0-based section slot (0 = beat 1). */
  slot: number;
  position: "is-left" | "is-right" | "is-center";
  kicker?: string;
  headline: ReactNode;
  sub?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
}

function Beat({
  slot,
  position,
  kicker,
  headline,
  sub,
  meta,
  children,
}: BeatProps) {
  let cumulative = 0;
  for (let i = 0; i < slot; i += 1) {
    cumulative += STORY_SECTION_LENGTHS_SVH[i] ?? 0;
  }
  const start = cumulative / STORY_TOTAL_LENGTH_SVH;
  const span = (STORY_SECTION_LENGTHS_SVH[slot] ?? 0) / STORY_TOTAL_LENGTH_SVH;
  const window = beatWindow(slot, start, span);
  const style = {
    "--in-a": window.inA,
    "--in-s": window.inS,
    "--out-a": window.outA,
    "--out-s": window.outS,
  } as CSSProperties;

  return (
    <div
      className={`cinematic-scene__story-beat ${position}`}
      data-story-beat=""
      style={style}
    >
      {kicker ? <p className="cinematic-scene__story-kicker">{kicker}</p> : null}
      <h2 className="cinematic-scene__story-headline">{headline}</h2>
      {sub ? <p className="cinematic-scene__story-sub">{sub}</p> : null}
      {meta ? <div className="cinematic-scene__story-meta">{meta}</div> : null}
      {children}
    </div>
  );
}

function ResolveTag({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) {
  return (
    <span className="cinematic-scene__story-tag" style={{ color }}>
      {children}
    </span>
  );
}

export function StoryCopy() {
  return (
    <div className="cinematic-scene__story-copy" data-cinematic-story-copy="" aria-hidden="true">
      <Beat
        slot={0}
        position="is-center"
        headline="Form first."
        sub="A case begins as scattered signals."
      />

      <Beat
        slot={1}
        position="is-left"
        headline="Something separates."
        sub="Candidates rise out of the field."
      />

      <Beat
        slot={2}
        position="is-center"
        kicker="POSSIBLE MATCH"
        headline="Two records, one shape."
        sub="Similarity is a suggestion — nothing merges on its own."
        meta={<span className="cinematic-scene__story-mono">0.51</span>}
      />

      <Beat
        slot={3}
        position="is-right"
        headline="One link at a time."
        sub="Every edge is an assertion with a source."
      />

      <Beat
        slot={4}
        position="is-left"
        headline="Read the quiet."
        sub="even a quiet interval stays quiet, not empty."
      />

      <Beat
        slot={5}
        position="is-center"
        headline="Step back."
        sub="The whole field, undimmed."
      />

      <Beat
        slot={6}
        position="is-right"
        headline="Where the graph stops."
        sub="A gap is a question the data hasn't answered."
      />

      <Beat
        slot={7}
        position="is-left"
        headline="Weight the gap."
        sub="Estimated gain"
        meta={<span className="cinematic-scene__story-mono">+0.14</span>}
      />

      <Beat
        slot={8}
        position="is-center"
        kicker="LEAD"
        headline="One candidate leads the field."
        sub="a lead is a candidate, not a verdict."
      />

      <Beat
        slot={9}
        position="is-right"
        headline="Time is a window."
        sub="Conceptual ranges — never a fabricated timestamp."
        meta={
          <span className="cinematic-scene__story-meta-months">
            <span className="cinematic-scene__story-mono">MAR 2024</span>
            <span className="cinematic-scene__story-mono">AUG 2024</span>
            <span className="cinematic-scene__story-mono">JAN 2025</span>
          </span>
        }
      />

      <Beat
        slot={10}
        position="is-center"
        headline="Across cases."
        sub="A single line, cross-case."
      />

      <Beat
        slot={11}
        position="is-center"
        kicker="RESOLUTION"
        headline="Weigh the record."
        sub="Then act — and keep the reasoning."
      >
        <div
          className="cinematic-scene__story-tags"
          style={{ color: "var(--color-semantic-foreground)" }}
        >
          <ResolveTag color="var(--color-success)">Accept</ResolveTag>
          <ResolveTag color="var(--color-danger)">Reject</ResolveTag>
          <ResolveTag color="var(--color-info)">Request evidence</ResolveTag>
          <ResolveTag color="var(--color-warning)">Reassess</ResolveTag>
        </div>
        <Link
          className="cinematic-scene__story-cta"
          href="/dashboard"
          tabIndex={-1}
          aria-hidden="true"
        >
          Open the workspace →
        </Link>
      </Beat>
    </div>
  );
}