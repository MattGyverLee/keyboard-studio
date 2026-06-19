// buildTouchLayoutJson — shared seed→apply→emit path so preview and output
// cannot drift. Both TouchGallery (live preview) and StudioShell
// (handlePhaseEComplete) call this single function.
//
// The path is:
//   baseIr → scaffoldTouchLayout → applyTouchAssignments → emitTouchLayout
//
// Callers must pre-filter `assignments` to exclude `touch_inherited` before
// passing them here; this function does not filter.

import type { KeyboardIR, TouchAssignment } from "@keyboard-studio/contracts";
import {
  applyTouchAssignments,
  scaffoldTouchLayout,
  emitTouchLayout,
} from "@keyboard-studio/engine";

export interface BuildTouchLayoutJsonResult {
  /**
   * Wire-format `.keyman-touch-layout` JSON string, ready to inject into VFS.
   * Null when the emit pipeline threw (malformed baseIr or engine error) — callers
   * must treat null as "omit the touch layout" rather than injecting an empty file.
   */
  json: string | null;
  /** Diagnostic messages for unmatched host keys or unhandled assignments. */
  warnings: string[];
}

/**
 * Derive a `.keyman-touch-layout` JSON string from a base KeyboardIR plus an
 * array of Phase E touch assignments. Pure — no side-effects, no VFS writes.
 *
 * @param baseIr      Post-lockDesktop IR snapshot (the authoritative base for
 *                    both preview and output — do NOT pass the carve-working IR).
 * @param assignments Non-inherited touch assignments from Phase E. Callers MUST
 *                    filter out `touch_inherited` entries before calling.
 */
export function buildTouchLayoutJson(
  baseIr: KeyboardIR,
  assignments: ReadonlyArray<TouchAssignment>,
): BuildTouchLayoutJsonResult {
  try {
    const scaffolded = scaffoldTouchLayout(baseIr);
    const { layout, warnings } = applyTouchAssignments(scaffolded, assignments);
    return { json: emitTouchLayout(layout), warnings };
  } catch (err) {
    return {
      json: null,
      warnings: ["[buildTouchLayoutJson] failed: " + String(err)],
    };
  }
}
