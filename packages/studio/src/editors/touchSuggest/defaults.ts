// TouchSuggestPolicy — reserved declarative adaptation policy (P4a, T019).
//
// Defines the defaults-as-data object that governs how the touch-suggestion
// generator maps physical-key decisions to touch-layout placements. Every
// field has a stable default; policies are overridable per-key and per-project
// (FR-021). No propagation logic consumes this in P4a — it is declared here so
// P5 can build on the shape without a breaking change to the
// editors/touchSuggest package boundary.
//
// Source of truth: specs/012-step-model-manifest/data-model.md § TouchSuggestPolicy

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Where number-row characters go when the physical keyboard has a number row
 * but the touch layout does not.
 *
 * - "symbol-layer" — emit them into a dedicated symbols/punctuation layer
 *   (the safe default: keeps the base layer clean).
 * - "numeric-layer" — emit them into a standalone numeric layer.
 */
export type NumberRowTarget = "symbol-layer" | "numeric-layer";

/**
 * How modifier keys (Shift, AltGr, etc.) are represented on touch.
 *
 * - "long-press-demotion" — consolidate: modifier outputs go to long-press
 *   slots on the base character; no standalone modifier key is added.
 *   Prevents replication of the physical keyboard's modifier grid.
 */
export type ModifierPolicy = "long-press-demotion";

/**
 * Where dead-key output characters are hosted on the touch layout.
 *
 * - "base" — emit as long-press variants on the triggering base character
 *   (e.g. dead_acute + 'a' → long-press on 'a').
 */
export type DeadKeyHost = "base";

/**
 * The default gesture type for characters without an explicit placement hint.
 *
 * - "long-press" — long-press is the primary promotion mechanism; flick is
 *   opt-in only (per the spec's "flick opt-in" principle).
 */
export type DefaultGesture = "long-press";

/**
 * Declarative, overridable adaptation policy consumed by the touch-suggestion
 * generator.  All fields have stable defaults captured in
 * {@link DEFAULT_TOUCH_SUGGEST_POLICY}.
 *
 * Reserved shape — the generator does not run propagation in P4a.
 */
export interface TouchSuggestPolicy {
  /**
   * Maximum number of keys per row in the suggested touch layout.
   * Defaults to 10 (a common row width for phone-sized layouts); 11 is a
   * reasonable maximum for wider layouts.
   */
  readonly widthBudget: number;

  /**
   * Disposition for physical number-row characters.
   */
  readonly numberRowTarget: NumberRowTarget;

  /**
   * How modifier-key outputs are placed on the touch layout.
   */
  readonly modifierPolicy: ModifierPolicy;

  /**
   * Host mechanism for dead-key output characters.
   */
  readonly deadKeyHost: DeadKeyHost;

  /**
   * Default gesture when no explicit placement hint is present.
   */
  readonly defaultGesture: DefaultGesture;
}

// ---------------------------------------------------------------------------
// Default policy
// ---------------------------------------------------------------------------

/**
 * The built-in defaults for TouchSuggestPolicy.
 *
 * Projects that do not override this object get exactly these values;
 * per-key and per-project overrides are layered on top at runtime (FR-021).
 *
 * Reserved — consumed only by the P5 generator; not read in P4a.
 */
export const DEFAULT_TOUCH_SUGGEST_POLICY: TouchSuggestPolicy = {
  widthBudget: 10,
  numberRowTarget: "symbol-layer",
  modifierPolicy: "long-press-demotion",
  deadKeyHost: "base",
  defaultGesture: "long-press",
} as const;
