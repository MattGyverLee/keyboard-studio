// addTouchAdapter — wraps TouchGallery as an EditorStep (P4a, T012).
//
// TouchGallery's onComplete receives TouchAssignment[] — the adapter passes
// them through as the step result. The manifest (P4b) will consume the result
// when it wires the buildTouchLayoutJson block (currently in StudioShell and
// reserved for P4b — plan.md §"Out of scope for P4a").
//
// Declared but NOT yet wired into StudioShell. T014 repoints the imports;
// P4b introduces the manifest that actually uses these adapters.

import type { EditorStepProps } from "../../steps/types.ts";
import { TouchGallery } from "../assignLoop/TouchGallery.tsx";
import type { TouchAssignment } from "@keyboard-studio/contracts";

/**
 * EditorStep adapter for the Touch Gallery (Phase E — touch key assignment
 * loop). Satisfies React.ComponentType<EditorStepProps>.
 */
export function AddTouchAdapter({ onComplete, onBack }: EditorStepProps) {
  function handleComplete(assignments: TouchAssignment[]) {
    onComplete(assignments);
  }

  // TouchGallery requires onBack — the manifest must supply it for this step.
  // If absent (misconfigured manifest), fall back to a no-op so the UI doesn't crash.
  const handleBack = onBack ?? (() => undefined);
  return <TouchGallery onComplete={handleComplete} onBack={handleBack} />;
}
