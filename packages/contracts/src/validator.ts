// see spec.md section 10 — validator service (Layer A + Layer B)
// see spec.md section 9 — 14 compiler checks (9 TS-portable + 5 WASM-only)

import type { LintFinding } from "./lintFinding";

/**
 * Service contract for the Layer A (validity) and Layer B (style) validator.
 * Packaged as `@keymanapp/kmn-validator`.
 *
 * Layer A runs 9 TS-portable checks per-keystroke and 5 WASM-oracle checks
 * per-compile, all within a single 300 ms debounce cycle (Decision 3, §14).
 * Layer B style rules (AST-based canonical-form checks) share the compile pass.
 *
 * Implementations MUST route the 9 TS-portable checks (identifier validation,
 * duplicate group/store names, deprecated store IDs, deadkey resolution,
 * if()-store resolution, codepoint validation, context statement ordering,
 * index(store,N) offset validity) without invoking the WASM binary. The 5
 * WASM-only checks (CAPS/NCAPS consistency, unreachable rules, platform()
 * parsing, context(N) offset, named code constants) are deferred to the compile
 * microtask. A TS-check error suppresses the WASM call.
 *
 * @see spec.md §10
 * @see spec.md §9
 */
export interface ValidatorService {
  /**
   * Validate a complete KMN source string.
   *
   * Runs all 9 TS-portable Layer A checks immediately, then (if no fatal
   * TS error) schedules the WASM oracle for the 5 deferred checks and the
   * Layer B style pass. WASM diagnostics always supersede conflicting TS
   * diagnostics for the same location.
   *
   * Returns the union of all findings, deduplicated by (code, location).
   *
   * @param kmnSource - Complete `.kmn` source text.
   * @returns Sorted findings: errors first, then warnings, then hints.
   * @see spec.md §10 Layer A / Layer B
   */
  validate(kmnSource: string): Promise<LintFinding[]>;

  /**
   * Validate a KMN fragment after slot substitution.
   *
   * Called immediately after `{{slotId}}` placeholders are filled with user
   * answers, before the fragment is merged into the project `.kmn`. Runs the
   * same Layer A TS-portable checks as `validate()` but scoped to the
   * fragment; WASM oracle runs only when no TS-fatal finding is present.
   *
   * A validation failure here surfaces to the user as a slot-fill error, not
   * a compiler error (Decision 1, §14).
   *
   * @param kmnFragment - KMN rule fragment with all `{{slotId}}` replaced.
   * @param slots - The substitution map (slotId -> resolved value) for
   *   diagnostic context messages; not re-applied here, just carried forward.
   * @returns Findings scoped to the fragment; locations are fragment-relative.
   * @see spec.md §6 placeholder substitution semantics
   * @see spec.md §10
   */
  validateFragment(
    kmnFragment: string,
    slots: Record<string, string>
  ): Promise<LintFinding[]>;
}
