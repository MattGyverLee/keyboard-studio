// Integration test: PhaseProjectName with the REAL SurveyRunner.
//
// Asserts the displayName→slug seed chain:
//   1. project_display_name renders with the defaultDisplayName seed.
//   2. Committing a display name seeds project_keyboard_id with the slug
//      derived by slugifyKeyboardId (the chain under test).
//   3. onProjectNameNext fires with the confirmed (displayName, keyboardId).
//
// Uses the real loadModularFlow + real project_name.modular.yaml ?raw import
// (via the same module the production component uses). No mocks.
//
// Flow-parity coverage:
//   Both track.modular.yaml and project_name.modular.yaml are covered here
//   (track.modular.yaml in the identity assertion block; project_name.modular.yaml
//   by the full render/flow-through). This satisfies the flow-parity coverage
//   requirement alongside the drift guardrail (driftGuardrail.test.ts) which
//   checks the bijection over all FLOW_SOURCES.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { PhaseProjectName } from "./PhaseProjectName.tsx";
import { loadModularFlow } from "./loadModularFlow.ts";
import { slugifyKeyboardId } from "@keyboard-studio/contracts";

// ?raw imports — resolved by Vite at build/test time; vitest transforms them via
// the vite.config.ts raw plugin (same path as the production component).
import projectNameRaw from "../../../../content/flows/project_name.modular.yaml?raw";
import trackRaw from "../../../../content/flows/track.modular.yaml?raw";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Flow-parity: both modular YAMLs parse without error
// ---------------------------------------------------------------------------

describe("flow-parity: track.modular.yaml + project_name.modular.yaml load cleanly", () => {
  it("track.modular.yaml parses to a FlowDef with flow_id 'track' and question 'track_choice'", () => {
    const flow = loadModularFlow(trackRaw as string);
    expect(flow.flow_id).toBe("track");
    expect(flow.phase).toBe("G");
    expect(flow.questions).toHaveLength(1);
    expect(flow.questions[0]?.id).toBe("track_choice");
    // track_choice is terminal (next: null) — the branch is handled by PhaseTrack.
    expect(flow.questions[0]?.next).toBeNull();
  });

  it("project_name.modular.yaml parses to a FlowDef with flow_id 'project_name' and 2 questions", () => {
    const flow = loadModularFlow(projectNameRaw as string);
    expect(flow.flow_id).toBe("project_name");
    expect(flow.phase).toBe("G");
    expect(flow.questions).toHaveLength(2);
    expect(flow.questions[0]?.id).toBe("project_display_name");
    expect(flow.questions[1]?.id).toBe("project_keyboard_id");
    // project_display_name advances to project_keyboard_id.
    expect(flow.questions[0]?.next).toBe("project_keyboard_id");
    // project_keyboard_id is terminal.
    expect(flow.questions[1]?.next).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration: PhaseProjectName with real SurveyRunner
// ---------------------------------------------------------------------------

describe("PhaseProjectName — displayName→slug seed chain (real SurveyRunner)", () => {
  it("seeds project_display_name from defaultDisplayName and auto-populates project_keyboard_id slug", async () => {
    const displayName = "Hausa (QWERTY)";
    const expectedSlug = slugifyKeyboardId(displayName);

    let capturedDisplayName: string | undefined;
    let capturedKeyboardId: string | undefined;

    const onProjectNameNext = vi.fn((dn: string, kid: string) => {
      capturedDisplayName = dn;
      capturedKeyboardId = kid;
    });

    render(
      <PhaseProjectName
        defaultDisplayName={displayName}
        onProjectNameNext={onProjectNameNext}
        onBack={vi.fn()}
      />,
    );

    // Step 1: project_display_name question renders with the seeded value.
    // The SurveyRunner seeds the field via getSeedValue on first arrival.
    // The text input should have the defaultDisplayName as its value.
    const displayNameInput = screen.getByRole("textbox");
    expect((displayNameInput as HTMLInputElement).value).toBe(displayName);

    // Step 2: click Next to advance to project_keyboard_id.
    // onAnswerCommit fires with the current value before the transition,
    // seeding displayNameRef so getSeedValue for project_keyboard_id is correct.
    const nextButton = screen.getByRole("button", { name: /next|continue/i });
    await act(async () => {
      fireEvent.click(nextButton);
    });

    // Step 3: project_keyboard_id question renders with the slug derived from displayName.
    const slugInput = screen.getByRole("textbox");
    expect((slugInput as HTMLInputElement).value).toBe(expectedSlug);

    // Step 4: click Next to complete the flow.
    const nextButton2 = screen.getByRole("button", { name: /next|continue|finish/i });
    await act(async () => {
      fireEvent.click(nextButton2);
    });

    // Step 5: onProjectNameNext fired with the correct pair.
    expect(onProjectNameNext).toHaveBeenCalledOnce();
    expect(capturedDisplayName).toBe(displayName);
    expect(capturedKeyboardId).toBe(expectedSlug);
  });

  it("slug is re-derived when display name is edited before advancing", async () => {
    const defaultName = "Ewondo";
    const editedName = "Ewondo (AZERTY)";
    const editedSlug = slugifyKeyboardId(editedName);

    const onProjectNameNext = vi.fn();

    render(
      <PhaseProjectName
        defaultDisplayName={defaultName}
        onProjectNameNext={onProjectNameNext}
        onBack={vi.fn()}
      />,
    );

    // Edit the display name before advancing.
    const displayNameInput = screen.getByRole("textbox");
    await act(async () => {
      fireEvent.change(displayNameInput, { target: { value: editedName } });
    });

    // Advance to project_keyboard_id. onAnswerCommit fires with editedName,
    // updating displayNameRef so getSeedValue derives the slug from editedName.
    const nextButton = screen.getByRole("button", { name: /next|continue/i });
    await act(async () => {
      fireEvent.click(nextButton);
    });

    // The slug input renders with the slug derived from editedName (not defaultName).
    const slugInput = screen.getByRole("textbox");
    expect((slugInput as HTMLInputElement).value).toBe(editedSlug);

    // Advance to complete with the derived slug.
    const nextButton2 = screen.getByRole("button", { name: /next|continue|finish/i });
    await act(async () => {
      fireEvent.click(nextButton2);
    });

    expect(onProjectNameNext).toHaveBeenCalledOnce();
    const [dn, kid] = (onProjectNameNext as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(dn).toBe(editedName);
    expect(kid).toBe(editedSlug);
  });

  it("onBack fires when Back is clicked", async () => {
    const onBack = vi.fn();

    render(
      <PhaseProjectName
        defaultDisplayName="Test"
        onProjectNameNext={vi.fn()}
        onBack={onBack}
      />,
    );

    // Back button is present on the first question.
    const backButton = screen.getByRole("button", { name: /back/i });
    await act(async () => {
      fireEvent.click(backButton);
    });

    expect(onBack).toHaveBeenCalledOnce();
  });
});
