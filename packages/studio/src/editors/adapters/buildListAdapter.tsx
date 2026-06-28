// buildListAdapter — wraps the Phase B BuildListView as an EditorStep.
//
// The build-list is the DEFAULT Phase B character-discovery experience (the
// "build my character list" surface: CLDR suggestions + type-in chips + grid
// placeholder). It is a mature, hand-built component that, until now, lived
// only inside survey/PhaseB.tsx and appeared NOWHERE on the flow map.
//
// This adapter bridges the EditorStepProps contract so the manifest can carry
// the build-list as a single, opaque first-class step (id: build_list). The
// adapter is intentionally additive: registering the step makes the build-list
// appear on the flow map by construction (via the manifest projection), WITHOUT
// changing how/when PhaseB renders it to the user. PhaseB still mounts
// BuildListView directly through its own discoveryMethod branch — behavior is
// unchanged.
//
// Boundary: editors/ may import survey/ (galleries already bind survey types).
// Forbidden: editors/ -> dashboard/.

import type { EditorStepProps, SurveyContext } from "../../steps/types.ts";
import { BuildListView } from "../../survey/PhaseB.tsx";

/**
 * EditorStep adapter for the Phase B build-list (default character discovery).
 * Satisfies React.ComponentType<EditorStepProps>.
 *
 * `onBack` is required by BuildListView; when the manifest runtime omits it we
 * supply a no-op so the contract stays satisfied without inventing navigation.
 */
export function BuildListAdapter({ onComplete, onBack, ctx }: EditorStepProps) {
  const context: SurveyContext = ctx ?? {};
  return (
    <BuildListView
      context={context}
      onComplete={(result) => onComplete(result)}
      onBack={onBack ?? (() => {})}
    />
  );
}
