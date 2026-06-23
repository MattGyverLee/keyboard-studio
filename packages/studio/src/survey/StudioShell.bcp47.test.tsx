// Unit tests: contextFromIdentity threads bcp47 from IdentityLiteResult
// into SurveyContext so Phase B's linguist path receives the correct tag.
//
// contextFromIdentity is not exported, so we test it indirectly by verifying
// that the surveyCOntext populated after identity-complete has bcp47 set when
// the identity carries a non-empty bcp47, and absent when bcp47 is "".
//
// The function under test lives in StudioShell.tsx. We use the mocked SurveyView
// pattern already established in StudioShell.test.tsx and inspect the context
// that PhaseB receives when the survey advances to stage B.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// vi.hoisted refs
// ---------------------------------------------------------------------------

const { capturedContextRef, mockPhaseBDoneRef2 } = vi.hoisted(() => {
  const capturedContextRef = { current: null as null | Record<string, unknown> };
  const mockPhaseBDoneRef2 = { current: null as null | ((...args: unknown[]) => void) };
  return { capturedContextRef, mockPhaseBDoneRef2 };
});

// ---------------------------------------------------------------------------
// Mocks — mirror StudioShell.test.tsx pattern
// ---------------------------------------------------------------------------

vi.mock("./index.ts", () => {
  // Two variants of fakeIdentity: one with bcp47, one without.
  const fakeIdentityWithBcp47 = {
    autonym: "Hausa",
    english: "Hausa",
    languageSubtag: "ha",
    targetScriptRaw: "Latn",
    bcp47: "ha-Latn",
    supported: true,
    prefill: { script: "Latn", scriptClass: "alphabetic", routingGroup: "qwerty-qwertz" },
  };
  const fakeIdentityNoBcp47 = {
    autonym: "Unknown",
    english: "Unknown",
    languageSubtag: "",
    targetScriptRaw: "Latn",
    bcp47: "",
    supported: true,
    prefill: { script: "Latn", scriptClass: "alphabetic", routingGroup: "qwerty-qwertz" },
  };
  const fakePhaseResult = { phase: "B" as const, answers: [], confirmedInventory: [] };

  // Controlled by test: toggle which identity to emit
  let emitNoBcp47 = false;
  const setEmitNoBcp47 = (v: boolean) => { emitNoBcp47 = v; };

  return {
    IdentityLite: ({ onComplete }: { onComplete: (result: unknown, identity: unknown) => void }) => {
      const identity = emitNoBcp47 ? fakeIdentityNoBcp47 : fakeIdentityWithBcp47;
      return (
        <div data-testid="stage-identity">
          <button
            type="button"
            data-testid="identity-complete-bcp47"
            onClick={() => onComplete(fakePhaseResult, identity)}
          >
            identity-complete
          </button>
          <button
            type="button"
            data-testid="identity-complete-no-bcp47"
            onClick={() => {
              setEmitNoBcp47(true);
              onComplete(fakePhaseResult, fakeIdentityNoBcp47);
            }}
          >
            identity-complete-no-bcp47
          </button>
        </div>
      );
    },
    Prefill: ({ onConfirm }: { onConfirm: () => void }) => (
      <div data-testid="stage-prefill">
        <button type="button" data-testid="prefill-confirm" onClick={onConfirm}>
          prefill-confirm
        </button>
      </div>
    ),
    // PhaseB captures the context it receives
    PhaseB: ({ context, onComplete }: { context: Record<string, unknown>; onComplete: (...args: unknown[]) => void }) => {
      capturedContextRef.current = context;
      mockPhaseBDoneRef2.current = onComplete;
      return (
        <div data-testid="stage-B">
          <button type="button" data-testid="phaseB-complete" onClick={() => onComplete(fakePhaseResult)}>
            phaseB-complete
          </button>
        </div>
      );
    },
    PhaseF: ({ onComplete }: { onComplete: (...args: unknown[]) => void }) => (
      <div data-testid="stage-F">
        <button type="button" data-testid="phaseF-complete" onClick={() => onComplete(fakePhaseResult)}>
          phaseF-complete
        </button>
      </div>
    ),
    PhaseA: () => <div data-testid="stage-A" />,
    SurveyRunner: () => <div data-testid="survey-runner" />,
    extractIdentityLite: (r: unknown) => r,
    extractIdentity: () => ({}),
    extractProvenance: () => ({}),
    buildPrefillRows: () => [],
  };
});

vi.mock("../components/BaseResolution.tsx", () => ({
  BaseResolution: ({ onResolved }: { onResolved: (base: unknown) => void }) => {
    const fakeBase = { id: "basic_kbdus", path: "release/b/basic_kbdus", script: "Latn", displayName: "English (US)", targets: ["windows"], version: "1.0" };
    return (
      <div data-testid="stage-base">
        <button type="button" data-testid="base-resolved" onClick={() => onResolved(fakeBase)}>base-resolved</button>
      </div>
    );
  },
}));

vi.mock("../components/CarveGallery.tsx", () => ({
  CarveGallery: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="stage-carve">
      <button type="button" data-testid="carve-complete" onClick={onComplete}>carve-complete</button>
    </div>
  ),
}));

vi.mock("../components/MechanismGallery.tsx", () => ({
  MechanismGallery: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="stage-mechanisms">
      <button type="button" data-testid="mechanisms-complete" onClick={onComplete}>mechanisms-complete</button>
    </div>
  ),
}));

vi.mock("../components/TouchGallery", () => ({
  TouchGallery: ({ onComplete }: { onComplete: (a: unknown[]) => void }) => (
    <div data-testid="stage-E">
      <button type="button" data-testid="e-complete" onClick={() => onComplete([])}>Continue</button>
    </div>
  ),
}));

vi.mock("../components/UnsupportedScriptStub.tsx", () => ({
  UnsupportedScriptStub: () => <div data-testid="stage-unsupported" />,
}));

vi.mock("../components/TrackStep.tsx", () => ({
  TrackStep: ({ onNext }: { onNext: (t: "copy" | "adapt") => void }) => (
    <div data-testid="stage-track">
      <button type="button" data-testid="track-copy" onClick={() => onNext("copy")}>track-copy</button>
    </div>
  ),
}));

vi.mock("../components/ProjectNameStep.tsx", () => ({
  ProjectNameStep: ({ onNext }: { onNext: (dn: string, id: string) => void }) => (
    <div data-testid="stage-project-name">
      <button type="button" data-testid="project-name-next" onClick={() => onNext("Test Keyboard", "test_keyboard")}>
        project-name-next
      </button>
    </div>
  ),
}));

vi.mock("../components/OSKFrame.tsx", () => ({ OSKFrame: () => <div /> }));
vi.mock("../components/OskModeToggle.tsx", () => ({ OskModeToggle: () => <div /> }));
vi.mock("../hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: () => ({ stage: { kind: "idle" }, retry: vi.fn(), recompile: vi.fn() }),
}));
vi.mock("../hooks/useWorkingCopyTransform.ts", () => ({ useWorkingCopyTransform: () => null }));
vi.mock("../lib/confirmRebase.ts", () => ({ instantiateFromBaseIfConfirmed: vi.fn() }));
vi.mock("../lib/buildTouchLayoutJson.ts", () => ({ buildTouchLayoutJson: () => ({ json: "{}", warnings: [] }) }));
vi.mock("../components/PreviewScreen.tsx", () => ({ PreviewScreen: () => <div /> }));
vi.mock("../components/OutputScreen.tsx", () => ({ OutputScreen: () => <div /> }));
vi.mock("../flowmap/FlowMapView.tsx", () => ({ FlowMapView: () => <div /> }));
vi.mock("../lib/navigate.ts", () => ({ navigateTo: vi.fn() }));

import { SurveyView } from "../StudioShell.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

afterEach(() => {
  cleanup();
  capturedContextRef.current = null;
  useWorkingCopyStore.getState().reset();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function advanceToB() {
  fireEvent.click(screen.getByTestId("identity-complete-bcp47"));
  fireEvent.click(screen.getByTestId("base-resolved"));
  fireEvent.click(screen.getByTestId("track-copy"));
  fireEvent.click(screen.getByTestId("project-name-next"));
  fireEvent.click(screen.getByTestId("prefill-confirm"));
}

function advanceToBNoBcp47() {
  fireEvent.click(screen.getByTestId("identity-complete-no-bcp47"));
  fireEvent.click(screen.getByTestId("base-resolved"));
  fireEvent.click(screen.getByTestId("track-copy"));
  fireEvent.click(screen.getByTestId("project-name-next"));
  fireEvent.click(screen.getByTestId("prefill-confirm"));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("contextFromIdentity — threads bcp47 into PhaseB context", () => {
  it("passes bcp47 to PhaseB when identity has a non-empty bcp47", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToB();

    expect(screen.getByTestId("stage-B")).toBeTruthy();
    expect(capturedContextRef.current).not.toBeNull();
    expect(capturedContextRef.current?.["bcp47"]).toBe("ha-Latn");
    expect(capturedContextRef.current?.["language_name"]).toBe("Hausa");
    expect(capturedContextRef.current?.["script_family"]).toBe("Latn");
  });

  it("does NOT set bcp47 in context when identity bcp47 is empty string", async () => {
    await act(async () => {
      render(<SurveyView baseKeyboard={null} />);
    });

    advanceToBNoBcp47();

    expect(screen.getByTestId("stage-B")).toBeTruthy();
    expect(capturedContextRef.current?.["bcp47"]).toBeUndefined();
  });
});
