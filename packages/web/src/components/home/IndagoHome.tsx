// ============================================================================
// INDAGO Home — composition root
//
// Public landing page. Pure presentation: the cinematic opening — a large
// INDAGO wordmark whose particles dissolve into a real organic graph as the
// visitor scrolls — plus the fixed navigation. It never reaches into
// providers, the backend, authentication or any real case.
// ============================================================================

import { CinematicIntro } from "./cinematic/CinematicIntro";
import { HomeNavigation } from "./HomeNavigation";

export function IndagoHome() {
  return (
    <div className="relative bg-surface-0 text-surface-700">
      <HomeNavigation />
      <CinematicIntro />
    </div>
  );
}