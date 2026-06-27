// TouchKeyProvenance — reserved type (P4a, T018).
//
// Tags the origin of a touch key placement. No propagation logic reads this
// in P4a; it is declared here so the type exists for P5 to build on without
// a breaking change to the editor/assignLoop package boundary.
//
// Source of truth: specs/012-step-model-manifest/data-model.md § TouchKeyProvenance

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/**
 * Describes how a touch key placement was derived.
 *
 * - "base-derived"       — Came from the base keyboard's touch layout.
 * - "physical-suggested" — Proposed by the touchSuggest generator from a
 *                          physical key decision (S-01/S-02/S-03/S-08).
 * - "hand-set"           — Manually edited by the author. Default for
 *                          pre-existing keys: never auto-overwritten (FR-020).
 */
export type TouchKeyProvenance =
  | "base-derived"
  | "physical-suggested"
  | "hand-set";

// ---------------------------------------------------------------------------
// Default helper
// ---------------------------------------------------------------------------

/**
 * Returns the default provenance for a key that has not been explicitly tagged.
 *
 * Pre-existing keys in the base layout are "hand-set" by default — they
 * represent the keyboard author's intent and must never be silently overwritten
 * by the suggestion engine (FR-020).
 */
export function defaultProvenance(): TouchKeyProvenance {
  return "hand-set";
}
