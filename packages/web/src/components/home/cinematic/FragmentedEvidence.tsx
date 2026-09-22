// ============================================================================
// PR — INDAGO Cinematic Home · FRAGMENTED DATA narrative layer
//
// The single restrained statement for the moment right after INDAGO
// disintegrates. One tiny amber label + ONE editorial sentence, pinned to the
// bottom-left negative space of the stage so it never collides with the node
// field. NO card, panel, border or backdrop — just type over the fragments.
//
// Motion stays 100% CSS: the controller publishes intro-progress smoothsteps
// as --frag-label/--frag-text on the track (both fade in during
// disintegration → node release and are already leaving as the graph forms)
// plus calibration drift as --frag-scale/--frag-x/--frag-y/--frag-max-width.
// The CSS defaults are the shipped values, and reduced motion publishes zeros,
// so the layer is invisible there by construction.
//
// aria-hidden like the whole cinematic: this section is the home page's
// atmosphere; the real content lives in the documents that follow.
// ============================================================================

"use client";

export function FragmentedEvidence() {
  return (
    <div
      className="cinematic-scene__fragment"
      data-cinematic-fragment=""
      aria-hidden="true"
    >
      <p className="cinematic-scene__fragment-label">Fragmented evidence</p>
      <p className="cinematic-scene__fragment-statement">
        The record rarely arrives as one complete picture.
      </p>
    </div>
  );
}