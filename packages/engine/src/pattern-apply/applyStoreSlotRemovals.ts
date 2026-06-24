// Store-slot removal: replace specific output-store slots with `nul` fillers.
//
// This is the non-destructive carve projection for parallel-store deadkey patterns
// (the SIL Cameroon pattern). In that pattern, a single rule like:
//
//   dk(003b) any(dkf003b) > index(dkt003b, 2)
//
// outputs ~83 characters: pressing the input key matching position P in `dkf003b`
// outputs `dkt003b[P]`. To carve out ONE output character we MUST NOT delete the
// rule (loses all 83 outputs) and MUST NOT splice/remove the store entry (shifts
// every later index, corrupting alignment). Instead we replace the target slot in
// the OUTPUT store with `{kind:"raw",text:"nul"}`, which the KMN codec emits
// verbatim as `nul` and kmcmplib treats as a silent no-op — preserving alignment
// exactly. (`beep` was considered but produces an audible bell on every carved
// keystroke; `nul` is the silent equivalent, matching the Cameroon QWERTY padding
// idiom.)
//
// Slot id encoding (the engine<->studio seam — do not change):
//   "<outputStoreNodeId>#<itemsIndex>"  where itemsIndex is 0-based into IRStore.items.
//   This differs from whole-node deletion ids (bare nodeId, no `#`) so the two can be
//   unambiguously partitioned at the call site.
//
// Safety: only output stores (referenced by index()/outs() in rule outputs) are
// eligible. Targeting an input/source-only store (`any()`) would corrupt the matcher.
// Targeting an out-of-range index warns and skips that slot.
//
// baseIr is never mutated. Structural-sharing shallow copy:
//   { ...baseIr, stores: baseIr.stores.map(s => replacedById.get(s.nodeId) ?? s) }
// Untouched stores keep the same object reference; groups/comments/raw are passed
// through by reference.

import type { KeyboardIR, IRStore, StoreItem } from "@keyboard-studio/contracts";
import { parseSlotId } from "./slotId.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Result of {@link applyStoreSlotRemovals}.
 *
 * - `ir`           — new IR with targeted output-store slots replaced by nul fillers.
 * - `warnings`     — diagnostic messages for malformed ids, missing stores, non-output
 *                    stores, and out-of-range indices (empty when all is well).
 * - `appliedCount` — number of slots actually replaced.
 */
export interface StoreSlotRemovalResult {
  ir: KeyboardIR;
  warnings: string[];
  appliedCount: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Nul filler placed at a deleted slot position (silent no-op, preserves index() alignment). */
const NUL_FILLER: StoreItem = { kind: "raw", text: "nul" };

/**
 * Return true when the store named `storeName` appears as an output target
 * (index() or outs()) in any rule across all groups of `ir`.
 *
 * Reimplemented inline from the studio's analyzeStoreUsage — the engine must
 * not import from the studio package (team-boundary invariant, spec §12).
 */
function isOutputStore(storeName: string, ir: KeyboardIR): boolean {
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.output) {
        if ((el.kind === "index" || el.kind === "outs") && el.storeRef === storeName) {
          return true;
        }
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Replace specific output-store slots with `nul` fillers in a new IR without
 * mutating `baseIr`.
 *
 * Each `slotId` in `slotIds` must have the form `"<storeNodeId>#<itemsIndex>"`.
 * Multiple slots targeting the same store are processed in one pass so that
 * e.g. removing indices 3 and 7 from the same store is a single shallow copy.
 *
 * @param baseIr  Source-of-truth IR. Never mutated.
 * @param slotIds Set of slot ids encoding which output-store items to replace.
 * @returns       New IR, diagnostic warnings, and count of applied replacements.
 */
export function applyStoreSlotRemovals(
  baseIr: KeyboardIR,
  slotIds: ReadonlySet<string>,
): StoreSlotRemovalResult {
  const warnings: string[] = [];

  if (slotIds.size === 0) {
    return { ir: baseIr, warnings, appliedCount: 0 };
  }

  // --- Parse and group slot ids by storeNodeId ----------------------------
  /** Map from storeNodeId -> set of 0-based item indices to replace. */
  const targetsByStore = new Map<string, Set<number>>();

  for (const id of slotIds) {
    const parsed = parseSlotId(id);
    if (parsed === null) {
      warnings.push(
        `[store-slot] malformed slot id (expected "<storeNodeId>#<itemsIndex>"): ${id}`,
      );
      continue;
    }
    const { storeNodeId, itemsIndex } = parsed;

    let indexSet = targetsByStore.get(storeNodeId);
    if (indexSet === undefined) {
      indexSet = new Set<number>();
      targetsByStore.set(storeNodeId, indexSet);
    }
    indexSet.add(itemsIndex);
  }

  if (targetsByStore.size === 0) {
    // All ids were malformed.
    return { ir: baseIr, warnings, appliedCount: 0 };
  }

  // --- Build the map of replaced store objects ----------------------------
  /** Map from storeNodeId -> replacement IRStore (only stores that pass all guards). */
  const replacedById = new Map<string, IRStore>();
  let appliedCount = 0;

  for (const [storeNodeId, indexSet] of targetsByStore) {
    const store = baseIr.stores.find((s) => s.nodeId === storeNodeId);
    if (store === undefined) {
      warnings.push(
        `[store-slot] store not found in IR (nodeId: ${storeNodeId}); slot(s) skipped.`,
      );
      continue;
    }

    // Pattern-class guard: only output stores are eligible.
    if (!isOutputStore(store.name, baseIr)) {
      warnings.push(
        `[store-slot] store "${store.name}" (nodeId: ${storeNodeId}) is not referenced ` +
          `as an output target by any rule's index()/outs(); skipping to avoid corrupting ` +
          `the input matcher. Only output (dkt-style) stores can receive nul fillers.`,
      );
      continue;
    }

    // Validate indices and build new items array.
    const newItems: StoreItem[] = [...store.items]; // shallow copy
    let storeApplied = 0;

    for (const idx of indexSet) {
      if (idx < 0 || idx >= store.items.length) {
        warnings.push(
          `[store-slot] index ${idx} out of range for store "${store.name}" ` +
            `(length: ${store.items.length}); slot skipped.`,
        );
        continue;
      }
      newItems[idx] = NUL_FILLER; // replace — never splice
      storeApplied++;
    }

    if (storeApplied === 0) {
      // All indices were out of range; no need to copy the store.
      continue;
    }

    appliedCount += storeApplied;
    replacedById.set(storeNodeId, { ...store, items: newItems });
  }

  if (replacedById.size === 0) {
    // Nothing survived the guards.
    return { ir: baseIr, warnings, appliedCount: 0 };
  }

  // --- Structural-sharing shallow copy of the IR --------------------------
  const newIr: KeyboardIR = {
    ...baseIr,
    stores: baseIr.stores.map((s) => replacedById.get(s.nodeId) ?? s),
    // groups, comments, raw, touchLayout, visualKeyboard passed through by reference.
  };

  return { ir: newIr, warnings, appliedCount };
}
