// Check 18.6 — KM_LINT_INVENTORY_UNCOVERED
// Criteria: Every character in the confirmed linguist inventory is produced by some
// reachable input sequence in the draft keyboard.
//
// SCOPE GUARD: only runs when keyboardIR.origin === "scaffolded". If origin is
// "imported" or "synthesized", or if any RawKmnFragment is present, return [].
//
// The emittable-char set is built by statically scanning every IRRule.output:
//   - Consecutive {kind:"char"} elements within a single rule are accumulated into
//     a run buffer. When a non-char element or the end of the output array is
//     reached, the run is NFC-normalized and each resulting code point is added to
//     the emittable set. Individual raw char values are also added so standalone
//     combining marks in the inventory are covered.
//   - {kind:"outs"} and {kind:"index"}: each item.value is NFC-normalized before adding.
//   - {kind:"deadkey"}, {kind:"beep"}, {kind:"raw"} are ignored.
//
// For each LinguistInventory char NOT in the emittable set, emit one finding.
// The inventory char is NFC-normalized before lookup so precomposed codepoints in
// the inventory match when the keyboard emits the NFC form directly.
//
// Accepted heuristic limit: opaque/raw fragments — if the keyboard body contains a
// RawKmnFragment the scope guard exits early (ir.raw.length > 0 → return []).
// However if the raw content lives inside a store item marked {kind:"raw"}, the
// store-expansion loop skips it and the character will appear uncovered even though
// it is reachable. Reviewers should treat a finding on a keyboard with raw store
// items as a possible false positive.

import type { LintFinding, KeyboardIR, LinguistInventory } from "@keyboard-studio/contracts";
import { linguistInventoryChars } from "@keyboard-studio/contracts";

/**
 * Flush an accumulated run of consecutive char elements.
 * Adds each raw char value to `emittable`, then NFC-normalizes the joined run
 * and adds each code point of the normalized form. This ensures both:
 *   - individual combining marks already in the inventory are recognized, and
 *   - base+combining sequences (NFD/decomposed emission) are matched against the
 *     NFC-precomposed codepoint expected by linguistInventoryChars.
 */
function flushRun(run: string[], emittable: Set<string>): void {
  if (run.length === 0) return;
  // Always add the individual raw chars first (superset guarantee).
  for (const ch of run) {
    emittable.add(ch);
  }
  // Add the NFC-normalized code points of the joined run.
  const normalized = run.join("").normalize("NFC");
  for (const ch of normalized) {
    emittable.add(ch);
  }
  run.length = 0;
}

/**
 * Build the set of all characters statically emittable by the keyboard IR.
 * Expands outs() and index() references via the store map.
 * NFC-normalizes multi-char runs so base+combining sequences are covered.
 */
function buildEmittableSet(ir: KeyboardIR): Set<string> {
  const storeMap = new Map(ir.stores.map((s) => [s.name, s]));
  const emittable = new Set<string>();

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const run: string[] = [];

      for (const elem of rule.output) {
        if (elem.kind === "char") {
          // Accumulate into run; do not flush yet.
          run.push(elem.value);
        } else {
          // Non-char element: flush the buffered run first.
          flushRun(run, emittable);

          if (elem.kind === "outs" || elem.kind === "index") {
            const store = storeMap.get(elem.storeRef);
            if (store) {
              for (const item of store.items) {
                if (item.kind === "char") {
                  // Store items are treated individually (no cross-item run merging).
                  emittable.add(item.value);
                  emittable.add(item.value.normalize("NFC"));
                }
              }
            }
          }
          // deadkey, beep, raw are intentionally ignored
        }
      }

      // End of rule output: flush any trailing run.
      flushRun(run, emittable);
    }
  }

  return emittable;
}

/**
 * Check that every character in the linguist inventory is emittable by the keyboard.
 * Only runs for scaffolded keyboards with no raw fragments.
 *
 * @param ir - The keyboard IR (must have origin === "scaffolded" to run).
 * @param inventory - The confirmed linguist inventory.
 * @param kmnPath - Virtual FS path used in `location.file`.
 */
export function checkInventoryCoverage(
  ir: KeyboardIR,
  inventory: LinguistInventory,
  kmnPath: string
): LintFinding[] {
  // Scope guard: only run for scaffolded keyboards
  if (ir.origin !== "scaffolded") return [];

  // Scope guard: skip if any RawKmnFragment is present (opaque content)
  if (ir.raw.length > 0) return [];

  const emittable = buildEmittableSet(ir);
  const inventoryChars = linguistInventoryChars(inventory);
  const findings: LintFinding[] = [];

  for (const ch of inventoryChars) {
    // NFC-normalize the inventory char before lookup so precomposed codepoints
    // match when the keyboard also emits the NFC form.
    const chNFC = ch.normalize("NFC");
    if (!emittable.has(chNFC)) {
      const codePoint = chNFC.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") ?? "?";
      findings.push({
        code: "KM_LINT_INVENTORY_UNCOVERED",
        severity: "warning",
        layer: "C",
        message: `Inventory character U+${codePoint} "${chNFC}" is not produced by any reachable rule in the keyboard.`,
        location: { file: kmnPath, line: 1 },
        hint: `Add an output rule that emits "${chNFC}" (U+${codePoint}), or verify it is covered via an opaque/raw fragment (static analysis does not see those). If your keyboard emits this character as a base codepoint followed by a combining mark (NFD/decomposed form), confirm that sequence normalizes to the expected NFC-precomposed codepoint — or mark the keyboard as having a raw fragment to suppress this check for abugida/abjad layouts where opaque store content handles composition.`,
      });
    }
  }

  return findings;
}
