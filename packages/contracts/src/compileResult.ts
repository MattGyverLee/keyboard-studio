// see spec.md section 4 / section 8 step 11 - compiler service (kmcmplib WASM)

import type { LintFinding } from "./lintFinding";

export interface CompileArtifact {
  /** e.g. "tyv.kmx", "tyv.kvk", "tyv.js". */
  filename: string;
  /**
   * URL the consumer can fetch / present for download.
   * - In browser contexts: a `blob:` URL produced by `URL.createObjectURL()`.
   * - In Node contexts (compiler service tests, CI, headless runs): a `file://`
   *   URI, a `data:` URI, or a relative path the caller can resolve.
   * The compiler-service implementation chooses the form per environment; the
   * field is opaque to consumers — they just pass it to the download / preview
   * site or pipe its bytes downstream.
   */
  url: string;
  sizeBytes: number;
}

export interface CompileResult {
  success: boolean;
  artifacts: CompileArtifact[];
  diagnostics: LintFinding[];
  /** Wall-clock warm-recompile time in ms. Target: 100-300 ms (spec section 4). */
  warmCompileMs: number;
}

/**
 * Input shape for {@link makeCompileResult}.
 *
 * Mirrors `CompileResult` exactly today (all fields required). The factory
 * exists for symmetry with {@link makePattern} / {@link makeBaseKeyboard} and
 * as a forward-compatible anchor: when optional fields are added to
 * `CompileResult` in a future revision, the factory's conditional-spread
 * idiom handles the `exactOptionalPropertyTypes` stripping without churn at
 * the construction site.
 */
export type CompileResultInit = {
  success: boolean;
  artifacts: CompileArtifact[];
  diagnostics: LintFinding[];
  warmCompileMs: number;
};

/**
 * Construct a {@link CompileResult} from a {@link CompileResultInit}.
 *
 * Mirrors the `makePattern` / `makeBaseKeyboard` factory pattern. All current
 * fields are required so the body is straight-line; the function exists as a
 * stable construction surface for fixtures + tests and to make future
 * optional-field additions ergonomic.
 *
 * @see spec.md §4 (compiler service)
 */
export function makeCompileResult(init: CompileResultInit): CompileResult {
  return {
    success: init.success,
    artifacts: init.artifacts,
    diagnostics: init.diagnostics,
    warmCompileMs: init.warmCompileMs,
  };
}
