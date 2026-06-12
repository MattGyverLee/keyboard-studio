// Check 18.5 — KM_WARN_LAYER_SWITCH_NO_RETURN
// Criteria: Every non-default layer that is switched into must contain at least one
// key with a `nextlayer` value (an exit/return key). This is the simplest sound rule:
// it does not trace full reachability back to "default" — it only requires that a
// switched-into layer has SOME layer-switch key so the user can leave it.
//
// Rule: collect all layers referenced by any key's `nextlayer`. For each such target
// layer, verify that it contains at least one key whose `nextlayer` is set. Warn for
// any switched-into layer with no exit.
//
// Accepted heuristic limit: layers that are reached via a hardware modifier (e.g. the
// Shift key activating a shift layer) rather than via a `nextlayer` target are not
// modeled as "switched-into" by this check. Those layers never appear in the
// switchedInto set and therefore never trigger a false warning. This is intentional —
// hardware-modifier layers have a built-in return path (releasing the modifier) that
// is invisible to the static touch-layout JSON.

import type { LintFinding } from "@keyboard-studio/contracts";
import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";

/**
 * Collect all keys in a layer that have `nextlayer` set (recursively including sk/multitap).
 */
function collectNextlayerKeys(keys: TouchKeyIR[]): string[] {
  const result: string[] = [];
  for (const key of keys) {
    if (key.nextlayer) result.push(key.nextlayer);
    if (key.sk) result.push(...collectNextlayerKeys(key.sk));
    if (key.multitap) result.push(...collectNextlayerKeys(key.multitap));
    if (key.flick) {
      result.push(...collectNextlayerKeys(Object.values(key.flick).filter((v): v is TouchKeyIR => v !== undefined)));
    }
  }
  return result;
}

/**
 * Check that every layer switched into has at least one exit key (a key with nextlayer set).
 *
 * @param ir - Parsed touch layout.
 * @param touchLayoutPath - Virtual FS path used in `location.file`.
 */
export function checkLayerSwitchReturn(
  ir: TouchLayoutIR,
  touchLayoutPath: string
): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const platform of ir.platforms) {
    // Build a map of layerId -> all keys flat
    const layerKeys = new Map<string, TouchKeyIR[]>();
    for (const layer of platform.layers) {
      const allKeys = layer.rows.flatMap((r) => r.keys);
      layerKeys.set(layer.id, allKeys);
    }

    // Collect all layers that are switched into via nextlayer
    const switchedInto = new Set<string>();
    for (const keys of layerKeys.values()) {
      for (const target of collectNextlayerKeys(keys)) {
        switchedInto.add(target);
      }
    }

    // For each switched-into layer, verify it has at least one exit
    for (const targetLayerId of switchedInto) {
      const keys = layerKeys.get(targetLayerId);
      if (!keys) continue; // target layer doesn't exist in this platform — a different issue

      const exits = collectNextlayerKeys(keys);
      if (exits.length === 0) {
        findings.push({
          code: "KM_WARN_LAYER_SWITCH_NO_RETURN",
          severity: "warning",
          layer: "C",
          message: `Platform "${platform.id}" layer "${targetLayerId}" is switched into but has no key with a nextlayer value (no exit).`,
          location: { file: touchLayoutPath, line: 1 },
          hint: `Add a key with nextlayer set in layer "${targetLayerId}" on ${platform.id} so users can navigate to another layer.`,
        });
      }
    }
  }

  return findings;
}
