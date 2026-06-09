// see spec.md section 8 - data flow (Phases A..G; "C-prime" is the reorder phase)

import type { DiscoveryAxisVector } from "./axes";
import type { KeyboardIdentity } from "./keyboardIdentity";

/**
 * Survey phase identifiers per spec §8.
 *
 * The literal `"C-prime"` is the ASCII-safe programmatic form of the spec's
 * `C'` notation (apostrophe; pronounced "C prime"). User-facing UI labels
 * should render this as `C'` to match the spec. The string-literal form
 * exists so grep and TS string narrowing don't have to deal with the
 * apostrophe character.
 *
 * @see spec.md §8 (data flow — Phases A..G with C-prime reorder)
 */
export type SurveyPhase = "A" | "B" | "C" | "C-prime" | "D" | "E" | "F" | "G";

export type SurveyAnswer =
  | { questionId: string; answerType: "char-list"; value: string[] }
  | { questionId: string; answerType: "char-single"; value: string }
  | { questionId: string; answerType: "key-name"; value: string }
  | { questionId: string; answerType: "store-content"; value: string }
  | { questionId: string; answerType: "boolean"; value: boolean }
  | { questionId: string; answerType: "select"; value: string }
  | { questionId: string; answerType: "text"; value: string };

export interface SurveyPhaseResult {
  phase: SurveyPhase;
  answers: SurveyAnswer[];
  /** Typed identity fields resolved from Phase A; undefined for phases B..G. */
  identity?: KeyboardIdentity;
  /** Axes resolved at this phase; merged across phases to build the full vector. */
  computedAxes?: Partial<DiscoveryAxisVector>;
  /** Pattern IDs selected from the gallery during this phase. */
  selectedPatternIds?: string[];
}
