// Question module registry — consolidated entry point.
//
// Maps every question ID across all phases to its QuestionModule via static
// imports (synchronous; loadModularFlow assembles FlowDef on the call stack).
//
// Per-phase sub-registries (registry.a.ts, registry.b.ts, registry.f.ts) own
// the actual import lists — one file per phase keeps merge conflicts off the
// hot path during parallel migration cycles. This file just merges them.
//
// Fan-out rule: a new question lands in questions/<phase>/<id>.ts AND its phase
// sub-registry. This file does not need editing unless a NEW phase is added.

import type { QuestionModule } from "../types.ts";
import { phaseARegistry } from "./registry.a.ts";
import { phaseBRegistry } from "./registry.b.ts";
import { phaseFRegistry } from "./registry.f.ts";

/**
 * Synchronous registry: { [questionId]: QuestionModule }
 *
 * All entries are populated at module-init time; the map never grows at runtime.
 * If a question ID is not found here, loadModularFlow throws immediately rather
 * than silently skipping the question.
 */
export const questionRegistry: Readonly<Record<string, QuestionModule>> = {
  ...phaseARegistry,
  ...phaseBRegistry,
  ...phaseFRegistry,
} as const;
