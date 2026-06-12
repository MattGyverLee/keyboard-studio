// Check 18.3 — KM_WARN_TOUCH_KEYS_PER_ROW
// Criteria: Touch layout uses at most 10 keys per row on phone and 13 on tablet.
// One finding per offending row.

import type { LintFinding } from "@keyboard-studio/contracts";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";

const MAX_KEYS: Partial<Record<string, number>> = {
  phone: 10,
  tablet: 13,
  // desktop: no rule
};

/**
 * Check that each row does not exceed the platform key-count maximum.
 *
 * @param ir - Parsed touch layout.
 * @param touchLayoutPath - Virtual FS path used in `location.file`.
 */
export function checkKeysPerRow(
  ir: TouchLayoutIR,
  touchLayoutPath: string
): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const platform of ir.platforms) {
    const maxKeys = MAX_KEYS[platform.id];
    if (maxKeys === undefined) continue;

    for (const layer of platform.layers) {
      layer.rows.forEach((row, rowIdx) => {
        const keyCount = row.keys.length;
        if (keyCount > maxKeys) {
          findings.push({
            code: "KM_WARN_TOUCH_KEYS_PER_ROW",
            severity: "warning",
            layer: "C",
            message: `Platform "${platform.id}" layer "${layer.id}" row ${rowIdx + 1} has ${keyCount} key(s); maximum is ${maxKeys}.`,
            location: { file: touchLayoutPath, line: 1 },
            hint: `Remove keys from row ${rowIdx + 1} of layer "${layer.id}" on ${platform.id} until it has ${maxKeys} or fewer to avoid crowding on small screens.`,
          });
        }
      });
    }
  }

  return findings;
}
