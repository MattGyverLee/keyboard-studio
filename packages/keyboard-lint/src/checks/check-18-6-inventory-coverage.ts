// Check 18.6 — KM_LINT_INVENTORY_UNCOVERED
// Criteria: Every character in the confirmed linguist inventory is produced by some
// reachable input sequence in the draft keyboard.
//
// SCOPE GUARD: only runs when keyboardIR.origin === "scaffolded". If origin is
// "imported" or "synthesized", or if any RawKmnFragment is present, return [].
//
// The emittable-char set is built by statically scanning every IRRule.output:
//   - {kind:"char"}.value is collected directly.
//   - {kind:"outs"} and {kind:"index"}: expand referenced IRStore.items for char values.
//   - {kind:"deadkey"}, {kind:"beep"}, {kind:"raw"} are ignored.
//
// For each LinguistInventory char NOT in the emittable set, emit one finding.
//
// Accepted heuristic limits (two classes of false positives that are by design):
//   1. Opaque/raw fragments — if the keyboard body contains a RawKmnFragment the scope
//      guard exits early (ir.raw.length > 0 → return []). However if the raw content
//      lives inside a store item marked {kind:"raw"}, the store-expansion loop skips it
//      and the character will appear uncovered even though it is reachable. Reviewers
//      should treat a finding on a keyboard with raw store items as a possible false
//      positive.
//   2. NFC-composed sequences — inventory characters that are emitted as separate
//      base+combining `char` outputs (e.g. U+0061 + U+0300 instead of U+00E0) will
//      appear falsely uncovered because the check compares whole code points, not
//      canonical decompositions. This is a known limitation of the static scan.

import type { LintFinding, KeyboardIR, LinguistInventory } from "@keyboard-studio/contracts";
import { linguistInventoryChars } from "@keyboard-studio/contracts";

/**
 * Build the set of all characters statically emittable by the keyboard IR.
 * Expands outs() and index() references via the store map.
 */
function buildEmittableSet(ir: KeyboardIR): Set<string> {
  const storeMap = new Map(ir.stores.map((s) => [s.name, s]));
  const emittable = new Set<string>();

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const elem of rule.output) {
        if (elem.kind === "char") {
          emittable.add(elem.value);
        } else if (elem.kind === "outs" || elem.kind === "index") {
          const store = storeMap.get(elem.storeRef);
          if (store) {
            for (const item of store.items) {
              if (item.kind === "char") {
                emittable.add(item.value);
              }
            }
          }
        }
        // deadkey, beep, raw are intentionally ignored
      }
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
    if (!emittable.has(ch)) {
      const codePoint = ch.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") ?? "?";
      findings.push({
        code: "KM_LINT_INVENTORY_UNCOVERED",
        severity: "warning",
        layer: "C",
        message: `Inventory character U+${codePoint} "${ch}" is not produced by any reachable rule in the keyboard.`,
        location: { file: kmnPath, line: 1 },
        hint: `Add an output rule that emits "${ch}" (U+${codePoint}), or verify it is covered via an opaque/raw fragment (static analysis does not see those) or as a NFC-composed sequence of base+combining chars.`,
      });
    }
  }

  return findings;
}
