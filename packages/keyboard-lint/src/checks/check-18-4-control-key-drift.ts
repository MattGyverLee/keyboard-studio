// Check 18.4 — KM_WARN_CONTROL_KEY_DRIFT
// Criteria: Within a platform, control keys (K_BKSP, K_ENTER) must not move or
// resize across layers. "Geometry" = sp + width + position (rowIndex + indexInRow).
// Skip platforms or keys that lack the data needed for comparison.

import type { LintFinding } from "@keyboard-studio/contracts";
import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";

const CONTROL_KEY_IDS = new Set(["K_BKSP", "K_ENTER"]);

interface KeyGeometry {
  sp: number | undefined;
  width: number | undefined;
  rowIndex: number;
  keyIndex: number;
  layerId: string;
}

/**
 * Check that control keys maintain consistent geometry (sp, width, position) across
 * all layers within each platform. Skips keys with no sp/width data on either side.
 *
 * @param ir - Parsed touch layout.
 * @param touchLayoutPath - Virtual FS path used in `location.file`.
 */
export function checkControlKeyDrift(
  ir: TouchLayoutIR,
  touchLayoutPath: string
): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const platform of ir.platforms) {
    // Build a map: keyId -> first-seen geometry (from first layer that has the key)
    const baseline = new Map<string, KeyGeometry>();

    for (const layer of platform.layers) {
      layer.rows.forEach((row, rowIndex) => {
        row.keys.forEach((key: TouchKeyIR, keyIndex) => {
          if (!CONTROL_KEY_IDS.has(key.id)) return;

          const geometry: KeyGeometry = {
            sp: key.sp,
            width: key.width,
            rowIndex,
            keyIndex,
            layerId: layer.id,
          };

          const base = baseline.get(key.id);
          if (!base) {
            baseline.set(key.id, geometry);
            return;
          }

          // Skip comparison if neither side has sp/width data
          const hasData =
            (base.sp !== undefined || base.width !== undefined) &&
            (geometry.sp !== undefined || geometry.width !== undefined);
          if (!hasData) return;

          const drifts: string[] = [];

          if (
            base.sp !== undefined &&
            geometry.sp !== undefined &&
            base.sp !== geometry.sp
          ) {
            drifts.push(`sp changed from ${base.sp} (layer "${base.layerId}") to ${geometry.sp}`);
          }

          if (
            base.width !== undefined &&
            geometry.width !== undefined &&
            base.width !== geometry.width
          ) {
            drifts.push(`width changed from ${base.width} (layer "${base.layerId}") to ${geometry.width}`);
          }

          if (base.rowIndex !== geometry.rowIndex) {
            drifts.push(`row changed from ${base.rowIndex + 1} (layer "${base.layerId}") to ${geometry.rowIndex + 1}`);
          }

          if (base.keyIndex !== geometry.keyIndex) {
            drifts.push(`position in row changed from ${base.keyIndex + 1} (layer "${base.layerId}") to ${geometry.keyIndex + 1}`);
          }

          if (drifts.length > 0) {
            findings.push({
              code: "KM_WARN_CONTROL_KEY_DRIFT",
              severity: "warning",
              layer: "C",
              message: `Control key "${key.id}" on platform "${platform.id}" has inconsistent geometry in layer "${layer.id}": ${drifts.join("; ")}.`,
              location: { file: touchLayoutPath, line: 1 },
              hint: `Restore "${key.id}" to the same position and size it has in the baseline layer on ${platform.id} so users can always find it.`,
            });
          }
        });
      });
    }
  }

  return findings;
}
