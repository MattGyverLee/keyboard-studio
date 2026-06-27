// touchSuggest — touch-layout suggestion generator scaffold (P4a, T020).
//
// Reserved stub. The generator that maps physical-key decisions (S-01/S-02/
// S-03/S-08) to touch-key placements does NOT run propagation in P4a; it is
// scaffolded here so P5 can implement the body without a breaking change to
// the editors/touchSuggest package boundary.
//
// When implemented (P5):
//   - Reads the working copy's physical-layer KeyboardIR.
//   - Applies DEFAULT_TOUCH_SUGGEST_POLICY (merged with any per-project
//     overrides, then per-key overrides — FR-021).
//   - Produces a TouchAssignment[] with provenance="physical-suggested" for
//     each key that has no existing "hand-set" placement (FR-020).
//   - Returns the suggestions without committing them; the caller (editor
//     step or store action) decides when to apply them.
//
// Source of truth: specs/012-step-model-manifest/data-model.md § touchSuggest

import type { TouchAssignment } from "@keyboard-studio/contracts";
import type { TouchSuggestPolicy } from "./defaults.ts";
import { DEFAULT_TOUCH_SUGGEST_POLICY } from "./defaults.ts";
import type { TouchKeyProvenance } from "../assignLoop/provenance.ts";

// ---------------------------------------------------------------------------
// Input / output shapes
// ---------------------------------------------------------------------------

/**
 * Input to the touch-suggestion generator.
 *
 * Reserved for P5. In P4a the generator is a no-op stub.
 */
export interface TouchSuggestInput {
  /**
   * The physical keyboard IR serialised as the minimal representation the
   * generator needs.
   *
   * TODO(P5): replace Record<string, unknown> with KeyboardIR once the mutate
   * seam lands. This stub exists so the generator's call site is typed in P4a
   * without pulling in the full engine types.
   */
  readonly physicalIR: Readonly<Record<string, unknown>>;

  /**
   * Policy overrides to merge over {@link DEFAULT_TOUCH_SUGGEST_POLICY}.
   * Partial — unset fields fall back to the default.
   */
  readonly policyOverrides?: Partial<TouchSuggestPolicy>;
}

/**
 * One suggested touch-key placement produced by the generator.
 *
 * Extends the base {@link TouchAssignment} from contracts with the provenance
 * tag required by FR-020 and FR-021.
 */
export interface TouchSuggestion extends TouchAssignment {
  /**
   * Always "physical-suggested" for generator output.
   * The caller may downgrade to "base-derived" or upgrade to "hand-set" when
   * applying suggestions.
   */
  readonly provenance: TouchKeyProvenance;
}

// ---------------------------------------------------------------------------
// Generator (stub)
// ---------------------------------------------------------------------------

/**
 * Generates touch-layout placement suggestions from physical-key decisions.
 *
 * **Reserved — returns an empty array in P4a.** No propagation logic runs.
 * The full implementation lands in P5.
 *
 * @param input - Physical IR + optional policy overrides.
 * @returns     - Array of suggestions (empty in P4a).
 */
export function touchSuggest(input: TouchSuggestInput): TouchSuggestion[] {
  // Merge policy (reserved — not yet consumed).
  const _policy: TouchSuggestPolicy = {
    ...DEFAULT_TOUCH_SUGGEST_POLICY,
    ...input.policyOverrides,
  };

  // P4a: no propagation. Return empty; P5 will implement the body.
  void _policy;
  return [];
}
