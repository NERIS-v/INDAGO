// ============================================================================
// PR — INDAGO Cinematic Home Opening · Font readiness
//
// The particles are rasterized from the SAME font the DOM wordmark uses. If the
// canvas falls back to a system face while the @font-face is still loading, the
// sampled silhouette is WRONG but the layout is published once and never
// revisited — the particles would permanently trace the wrong letterforms.
//
// This guard runs before sampling: load the exact font shorthand (the same
// computed value the H1 paints with), resolve the document's font set, then
// verify the face actually resolves for the wordmark text. When it reports
// false the orchestration defers sampling and retries on the next frame
// instead of keeping fallback-sampled points.
// ============================================================================

/** True when a browser font set is present; SSr/jsdom have no fonts, so the
 *  guard passes (there is nothing to wait for — the skeleton fallback runs).
 *  `fonts` is an injectable seam for tests; the browser path reads the live
 *  document.fonts. */
export async function ensureWordmarkFontReady(
  font: string,
  text: string,
  fonts?: FontFaceSet | undefined,
): Promise<boolean> {
  const set = fonts ?? (typeof document !== "undefined" ? document.fonts : null);
  if (!set) return true;
  try {
    if (typeof set.load === "function") await set.load(font);
    if (set.status === "loading" && typeof set.ready?.then === "function") {
      await set.ready;
    }
  } catch {
    // A rejected load/ready is NOT a ready face — left for check() to decide.
  }
  return typeof set.check === "function" ? set.check(font, text) : true;
}