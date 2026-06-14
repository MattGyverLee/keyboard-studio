// Script → axis derivation for base-derived prefill (spec §5 "Base-derived
// pre-fill", §7.1 A2, §9 routing). The chosen TARGET script (from identity-lite,
// possibly a romanization or IPA — decoupled from the language) determines the
// routing group and the A2 script class, shown to the author as confirmations
// rather than asked blank. refs #369.

import type { ScriptClass } from "@keyboard-studio/contracts";

/** Routing group per spec §9 three-group routing. */
export type RoutingGroup = "qwerty-qwertz" | "azerty" | "non-roman";

/**
 * Normalize an `il_target_script` answer into a BCP47 script subtag + optional
 * variant. Romanization and IPA both resolve to a Latin script; IPA adds the
 * `fonipa` variant (spec §8 identity-lite engine notes).
 */
export function normalizeTargetScript(raw: string): {
  script: string;
  variant?: "fonipa";
} {
  if (raw === "romanization-Latn") return { script: "Latn" };
  if (raw === "fonipa") return { script: "Latn", variant: "fonipa" };
  return { script: raw };
}

// Latin-family alphabetic scripts typed on a QWERTY-family physical layout.
const LATIN_ALPHABETIC = new Set(["Latn", "Cyrl", "Grek", "Geor", "Armn", "Cher"]);
const ABUGIDA = new Set([
  "Deva", "Beng", "Taml", "Telu", "Knda", "Mlym", "Guru", "Gujr",
  "Orya", "Sinh", "Thai", "Khmr", "Mymr", "Laoo", "Tibt",
]);
const ABJAD = new Set(["Arab", "Hebr"]);
const SYLLABARY = new Set(["Cans", "Vaii"]);
const LOGOGRAPHIC = new Set(["Hani"]);

/**
 * A2 script class (spec §7.1) for a BCP47 script subtag. Defaults to
 * `"alphabetic"` for unknown subtags — the safe, most-common assumption that the
 * survey then confirms. Pass a normalized subtag (see {@link normalizeTargetScript}).
 */
export function scriptClassOf(script: string): ScriptClass {
  if (LATIN_ALPHABETIC.has(script)) return "alphabetic";
  if (ABUGIDA.has(script)) return "abugida";
  if (ABJAD.has(script)) return "abjad";
  if (SYLLABARY.has(script)) return "syllabary";
  if (LOGOGRAPHIC.has(script)) return "logographic";
  return "alphabetic";
}

/**
 * Routing group (spec §9) for a script subtag. Latin-family alphabetic scripts
 * route to the QWERTY/QWERTZ group; everything else to non-Roman. AZERTY is a
 * base-layout refinement not derivable from the script alone — it is detected
 * from the chosen base's structural shape, so it is never returned here.
 */
export function routingGroupOf(script: string): RoutingGroup {
  return LATIN_ALPHABETIC.has(script) ? "qwerty-qwertz" : "non-roman";
}

/** The script-derived prefill confirmations the survey shows instead of asking. */
export interface ScriptPrefill {
  /** Normalized BCP47 script subtag. */
  script: string;
  /** BCP47 variant, when the target is IPA. */
  variant?: "fonipa";
  /** A2 script class (§7.1). */
  scriptClass: ScriptClass;
  /** Routing group (§9). */
  routingGroup: RoutingGroup;
}

/**
 * Derive the script-based prefill confirmations from a raw `il_target_script`
 * answer. The author confirms or overrides these (Sec 5); routing follows the
 * chosen script, never the language's default. A7 (spare keys) and the full
 * BCP47 tag are resolved later from the base IR diff / langtags, not here.
 */
export function deriveScriptPrefill(rawTargetScript: string): ScriptPrefill {
  const { script, variant } = normalizeTargetScript(rawTargetScript);
  const prefill: ScriptPrefill = {
    script,
    scriptClass: scriptClassOf(script),
    routingGroup: routingGroupOf(script),
  };
  if (variant !== undefined) prefill.variant = variant;
  return prefill;
}
