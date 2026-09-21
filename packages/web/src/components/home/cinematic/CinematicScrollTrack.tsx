// ============================================================================
// PR1 · Cinematic Home — Foundation · Deferred scroll track
//
// Wraps the pinned stage and owns the scrollable range behind it. ScrollTrigger
// pins the stage against THIS element, so scene progress 0 → 1 maps
// deterministically onto real scroll distance and reverses on scroll-up.
//
// The track stands viewport + variable scroll length tall (the post-hydration
// --cinematic-scroll-length, expressed as a distance in svh) so the stage at
// its head is pinned from render *and* for the whole journey, not released
// after a single viewport.
// ============================================================================

"use client";

import { forwardRef, type ReactNode } from "react";

interface CinematicScrollTrackProps {
  children: ReactNode;
}

export const CinematicScrollTrack = forwardRef<
  HTMLDivElement,
  CinematicScrollTrackProps
>(function CinematicScrollTrack({ children }, ref) {
  return (
    <div
      ref={ref}
      className="cinematic-scene__track"
      data-cinematic-track=""
    >
      {children}
    </div>
  );
});

CinematicScrollTrack.displayName = "CinematicScrollTrack";