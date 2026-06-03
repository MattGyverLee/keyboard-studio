// see spec.md section 11 — project scaffolder (template-cleanup pipeline)

import type { VirtualFS } from "./virtualFS";
import type { BaseKeyboard } from "./baseKeyboard";

/**
 * Service contract for the project scaffolder.
 *
 * The scaffolder duplicates a chosen base keyboard into a fresh in-memory
 * virtual FS and applies the full template-cleanup pipeline:
 *   - Identity propagation: keyboard name, BCP47 tag, copyright, version
 *     reset to match the new keyboard being authored.
 *   - NCAPS strip: leftover NCAPS modifiers removed.
 *   - [CAPS] deletion: [CAPS ...] rules removed.
 *   - &CasedKeys insertion: appropriate CasedKeys store added per
 *     Three-group routing and Decision 2 (§14).
 *   - Touch-layout cleanup: blank or base-only touch-layout entries cleared.
 *
 * The output virtual FS is clean-by-construction before the user touches
 * anything; Layer C hygiene (§10) runs immediately after scaffolding to
 * confirm all band-1 criteria are satisfied (§14, Decision 4).
 *
 * @see spec.md §11
 * @see spec.md §8 step 2 (scaffolding is pipeline step 2)
 */
export interface ScaffolderService {
  /**
   * Create a fresh virtual FS from `base` and apply the full
   * template-cleanup pipeline.
   *
   * The returned FS contains the complete source tree layout (§12):
   * `source/<keyboardId>.kmn`, `.kps`, `.kvks`, `.keyman-touch-layout`,
   * `.ico`, `welcome.htm`, `readme.htm`, `help/<keyboardId>.php`,
   * `LICENSE.md`, `HISTORY.md`, `README.md`, and a skeletal test file.
   *
   * @param base - The chosen base keyboard; drives identity propagation
   *   and template selection.
   * @param keyboardId - snake_case identifier for the new keyboard
   *   (e.g. "my_new_keyboard"). Must satisfy the §10 Layer A identifier
   *   rules: 1-255 chars, no spaces/parens/brackets/commas/controls.
   * @param displayName - Human-readable name written into the package
   *   descriptor and `welcome.htm`.
   * @returns A fully scaffolded, Layer-C-clean virtual FS ready for
   *   Phase B of the survey.
   * @see spec.md §11
   * @see spec.md §8 step 2
   */
  scaffold(
    base: BaseKeyboard,
    keyboardId: string,
    displayName: string
  ): Promise<VirtualFS>;

  /**
   * List the internal template names available to the scaffolder.
   *
   * Template names correspond to base-layout families (e.g. "qwerty",
   * "azerty", "non-roman") used by the Three-group routing (§9) to
   * select the correct cleanup pipeline variant.
   *
   * @returns Ordered array of template name strings.
   * @see spec.md §9 (Three-group routing)
   * @see spec.md §11
   */
  listTemplates(): Promise<string[]>;
}
