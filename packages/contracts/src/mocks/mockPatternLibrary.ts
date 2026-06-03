// see spec.md section 5 / section 7.2 / section 8 step 4 — PatternLibraryService mock

import type { PatternLibraryService } from "../patternLibrary";
import type { Pattern } from "../pattern";
import type { BaseKeyboard } from "../baseKeyboard";
import type { DiscoveryAxisVector } from "../axes";
import { samplePatterns } from "../fixtures/index";

/** In-memory index keyed by Pattern.id. */
const byId = new Map<string, Pattern>(
  samplePatterns.map((p) => [p.id, p])
);

/**
 * In-memory mock of {@link PatternLibraryService}.
 * Returns fixture data without invoking the real implementation.
 * @see spec.md §5 / §7.2 / §8 step 4
 */
export const mockPatternLibrary: PatternLibraryService = {
  listAll(): Promise<Pattern[]> {
    return Promise.resolve([...samplePatterns].sort((a, b) =>
      a.id.localeCompare(b.id)
    ));
  },

  getById(id: string): Promise<Pattern | undefined> {
    return Promise.resolve(byId.get(id));
  },

  filterFor(
    base: BaseKeyboard,
    axes?: DiscoveryAxisVector
  ): Promise<Pattern[]> {
    // Simple mock ranking:
    // 1. Patterns whose appliesTo includes base.script (or is empty) qualify.
    // 2. If axes is provided and a pattern's strategyId matches S-02, rank it first.
    // 3. Reorder patterns always included (mock does not apply Three-group exclusion).
    const qualified = samplePatterns.filter(
      (p) =>
        p.appliesTo.length === 0 ||
        p.appliesTo.includes(base.script) ||
        p.appliesTo.includes(base.id)
    );

    if (axes === undefined) {
      return Promise.resolve(qualified);
    }

    // Promote patterns whose strategyId matches a hypothetical primary recommendation.
    // For the mock, S-02 is treated as the primary when diacriticBehavior is multi-family.
    const isPrimary = axes.diacriticBehavior === "multi-family"
      ? (p: Pattern) => p.strategyId === "S-02"
      : (_p: Pattern) => false;

    const ranked = [
      ...qualified.filter(isPrimary),
      ...qualified.filter((p) => !isPrimary(p)),
    ];
    return Promise.resolve(ranked);
  },
};
