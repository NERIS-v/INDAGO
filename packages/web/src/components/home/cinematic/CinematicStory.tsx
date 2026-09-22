// ============================================================================
// PR — INDAGO Cinematic Home Story Act · Scroll surface
//
// The story act's real scroll extent. Absolute to the TRACK and sized by the
// two --cinematic-* length vars, this wrapper starts exactly where the intro's
// reserved distance ends (360svh full motion / 0svh reduced) and stretches to
// the document's max scroll. The scene controller measures its document top +
// height once (on mount + resize) and maps raw scroll → story fraction from
// those cached numbers, so the twelve beats below scrub 0 → 1 deterministically
// and reverse on scroll-up.
//
// The wrapper carries ONLY scroll geometry — the copy itself lives inside the
// pinned STAGE (it must stay on screen while the wrapper scrolls beneath). Its
// twelve spacers keep this surface visually indifferent (transparent, aria-
// hidden, pointer-events none) — their proportional flex growth mirrors the
// model's STORY_SECTION_LENGTHS_SVH so beat anchors could query this surface
// later without re-measuring.
// ============================================================================

"use client";

import {
  STORY_SECTION_COUNT,
  STORY_SECTION_LENGTHS_SVH,
} from "./story/story.constants";

export function CinematicStory() {
  return (
    <div
      className="cinematic-scene__story-wrapper"
      data-cinematic-story-wrapper=""
      aria-hidden="true"
    >
      {Array.from({ length: STORY_SECTION_COUNT }, (_, slot) => (
        <span
          key={slot}
          className="cinematic-scene__story-proportion"
          style={{ flexGrow: STORY_SECTION_LENGTHS_SVH[slot] }}
        />
      ))}
    </div>
  );
}