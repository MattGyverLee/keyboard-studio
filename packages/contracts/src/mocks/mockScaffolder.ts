// see spec.md section 11 — ScaffolderService mock

import type { ScaffolderService } from "../scaffolder";
import type { BaseKeyboard } from "../baseKeyboard";
import type { VirtualFS } from "../virtualFS";
import { scaffoldedFS } from "./mockVirtualFS";

const AVAILABLE_TEMPLATES = ["qwerty", "qwertz", "azerty", "non-roman"] as const;

/**
 * In-memory mock of {@link ScaffolderService}.
 * Returns fixture data without invoking the real implementation.
 * @see spec.md §11
 */
export const mockScaffolder: ScaffolderService = {
  scaffold(
    _base: BaseKeyboard,
    _keyboardId: string,
    _displayName: string
  ): Promise<VirtualFS> {
    // Returns the pre-built scaffolded FS fixture.
    // A real implementation would clone base, run template-cleanup pipeline.
    return Promise.resolve(scaffoldedFS);
  },

  listTemplates(): Promise<string[]> {
    return Promise.resolve([...AVAILABLE_TEMPLATES]);
  },
};
