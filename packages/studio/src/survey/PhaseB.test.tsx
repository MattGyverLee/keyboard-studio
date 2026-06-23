// Unit and component tests for Phase B — Linguist discovery path.
//
// Coverage:
//   1. IntroChooser defaults to "linguist" when bcp47 is present, "manual" otherwise.
//   2. LinguistProposalView calls synthesizeInventory with the threaded bcp47
//      and language_name; renders grouped sections and at least one flag label.
//   3. Confirm/edit round-trip: edited selection produces the expected confirmedInventory
//      (NFC, deduped, edits respected).
//   4. Empty/blank-bcp47 path shows the fallback affordance.
//
// Strategy: mock getCharacterDiscoveryService so tests are fully deterministic
// and never touch the engine WASM or LLM services.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import type { LinguistInventory, SurveyPhaseResult } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Mock getCharacterDiscoveryService before importing PhaseB
// ---------------------------------------------------------------------------

const mockSynthesizeInventory = vi.fn<[string, string, string | undefined], Promise<LinguistInventory>>();

vi.mock("../lib/services.ts", () => ({
  getCharacterDiscoveryService: async () => ({
    harvestFromText: async () => [],
    pickerCandidates: async () => [],
    synthesizeInventory: mockSynthesizeInventory,
  }),
}));

// Mock the YAML raw import (not actually parsed in tests — loadModularFlow is mocked)
vi.mock("../../../../content/flows/phase_b_characters.modular.yaml?raw", () => ({
  default: "flow_id: phase_b\nphase: B\nquestions:\n  - pb_discovery_intro\n",
}));

// Mock loadModularFlow so we don't need the question registry in tests
vi.mock("./loadModularFlow.ts", () => ({
  loadModularFlow: () => ({
    flow_id: "phase_b",
    phase: "B",
    questions: [
      {
        id: "pb_discovery_intro",
        type: "radio",
        prompt: "Choose a method",
        required: true,
        next: "pb_routing_branch",
      },
      {
        id: "pb_routing_branch",
        type: "notice",
        prompt: "Routing",
        next: null,
      },
    ],
  }),
}));

import { PhaseB } from "./PhaseB.tsx";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HAUSA_INVENTORY: LinguistInventory = {
  language: "ha",
  script: "Latin",
  alphabetCore: {
    lowercase: ["a", "b", "c"],
    uppercase: ["A", "B", "C"],
  },
  mandatoryDiacriticsAndLigatures: [],
  languageSpecificPunctuation: [],
  numerals: ["0", "1"],
  flags: [
    { char: "ƴ", issue: "not-attested" },
    { char: "d", issue: "cldr-omitted" },
  ],
};

const HINDI_INVENTORY: LinguistInventory = {
  language: "hi",
  script: "Devanagari",
  alphabetCore: {
    lowercase: ["क", "ख"],
    uppercase: [],
  },
  mandatoryDiacriticsAndLigatures: [],
  languageSpecificPunctuation: [],
  numerals: ["०", "१"],
  nuktaAndBorrowedSoundMarkers: ["क़"],
  independentVowels: ["अ"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPhaseB(
  context: Record<string, string | undefined> = {},
  onComplete: (r: SurveyPhaseResult) => void = () => undefined,
  onBack: () => void = () => undefined,
) {
  return render(
    <PhaseB context={context} onComplete={onComplete} onBack={onBack} />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. IntroChooser default selection
// ---------------------------------------------------------------------------

describe("IntroChooser — default selection", () => {
  it("defaults to 'linguist' radio when bcp47 is present", () => {
    renderPhaseB({ bcp47: "ha-Latn", language_name: "Hausa" });

    const linguistRadio = screen.getByRole("radio", {
      name: /show me a suggested list based on my language/i,
    });
    expect((linguistRadio as HTMLInputElement).checked).toBe(true);
  });

  it("defaults to 'manual' radio when bcp47 is absent", () => {
    renderPhaseB({ language_name: "Unknown" });

    const manualRadio = screen.getByRole("radio", {
      name: /step by step/i,
    });
    expect((manualRadio as HTMLInputElement).checked).toBe(true);
  });

  it("defaults to 'manual' when bcp47 is empty string", () => {
    renderPhaseB({ bcp47: "", language_name: "Unknown" });

    const manualRadio = screen.getByRole("radio", {
      name: /step by step/i,
    });
    expect((manualRadio as HTMLInputElement).checked).toBe(true);
  });

  it("linguist option has no 'coming soon' badge", () => {
    renderPhaseB({ bcp47: "ha-Latn", language_name: "Hausa" });

    // The linguist label should not contain "coming soon"
    const linguistLabel = screen
      .getByRole("radio", { name: /show me a suggested list/i })
      .closest("label");
    expect(linguistLabel?.textContent).not.toMatch(/coming soon/i);
  });

  it("picker option still has 'coming soon' badge", () => {
    renderPhaseB({ bcp47: "ha-Latn", language_name: "Hausa" });

    const pickerLabel = screen
      .getByRole("radio", { name: /browse a character grid/i })
      .closest("label");
    expect(pickerLabel?.textContent).toMatch(/coming soon/i);
  });
});

// ---------------------------------------------------------------------------
// 2. LinguistProposalView: synthesizeInventory called with correct args;
//    renders grouped sections; shows at least one flag label
// ---------------------------------------------------------------------------

describe("LinguistProposalView — rendering and synthesizeInventory call", () => {
  it("calls synthesizeInventory with language_name and bcp47, then renders sections", async () => {
    mockSynthesizeInventory.mockResolvedValueOnce(HAUSA_INVENTORY);

    await act(async () => {
      renderPhaseB({ bcp47: "ha-Latn", language_name: "Hausa" });
    });

    // Advance through IntroChooser (linguist already selected by default)
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Loading state
    expect(screen.getByRole("status")).toBeTruthy();

    // Wait for the proposal to render
    await waitFor(() => {
      expect(screen.getByText(/suggested inventory for hausa/i)).toBeTruthy();
    });

    // synthesizeInventory was called with the right args
    expect(mockSynthesizeInventory).toHaveBeenCalledWith("Hausa", "ha-Latn", undefined);

    // Grouped sections are present
    expect(screen.getByRole("group", { name: /core alphabet.*lowercase/i })).toBeTruthy();
    expect(screen.getByRole("group", { name: /core alphabet.*uppercase/i })).toBeTruthy();
    expect(screen.getByRole("group", { name: /numerals/i })).toBeTruthy();
  });

  it("renders at least one flag provenance label when flags are present", async () => {
    mockSynthesizeInventory.mockResolvedValueOnce(HAUSA_INVENTORY);

    await act(async () => {
      renderPhaseB({ bcp47: "ha-Latn", language_name: "Hausa" });
    });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/not-attested/i)).toBeTruthy();
    });

    expect(screen.getByText(/cldr-omitted/i)).toBeTruthy();
  });

  it("renders optional sections (nukta, independent vowels) for Devanagari", async () => {
    mockSynthesizeInventory.mockResolvedValueOnce(HINDI_INVENTORY);

    await act(async () => {
      renderPhaseB({ bcp47: "hi-Deva", language_name: "Hindi" });
    });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/suggested inventory for hindi/i)).toBeTruthy();
    });

    expect(screen.getByRole("group", { name: /nukta/i })).toBeTruthy();
    expect(screen.getByRole("group", { name: /independent vowels/i })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 3. Confirm / edit round-trip
// ---------------------------------------------------------------------------

describe("LinguistProposalView — confirm / edit round-trip", () => {
  it("confirms all pre-selected chars by default (linguistInventoryChars output)", async () => {
    mockSynthesizeInventory.mockResolvedValueOnce(HAUSA_INVENTORY);

    const results: SurveyPhaseResult[] = [];
    await act(async () => {
      renderPhaseB(
        { bcp47: "ha-Latn", language_name: "Hausa" },
        (r) => results.push(r),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/confirm/i)).toBeTruthy();
    });

    // Click confirm
    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(results).toHaveLength(1);
    const result = results[0]!;
    expect(result.phase).toBe("B");
    expect(result.answers).toEqual([]);
    // Default confirmed inventory = linguistInventoryChars(HAUSA_INVENTORY)
    // = ["a","b","c","A","B","C","0","1"]
    expect(result.confirmedInventory).toContain("a");
    expect(result.confirmedInventory).toContain("A");
    expect(result.confirmedInventory).toContain("0");
    // No duplicates
    const charSet = new Set(result.confirmedInventory);
    expect(charSet.size).toBe(result.confirmedInventory!.length);
  });

  it("deselecting a char removes it from confirmedInventory", async () => {
    mockSynthesizeInventory.mockResolvedValueOnce(HAUSA_INVENTORY);

    const results: SurveyPhaseResult[] = [];
    await act(async () => {
      renderPhaseB(
        { bcp47: "ha-Latn", language_name: "Hausa" },
        (r) => results.push(r),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /deselect.*U\+0041/i })).toBeTruthy();
    });

    // Deselect "A" (U+0041)
    const aButton = screen.getByRole("button", { name: /deselect.*U\+0041/i });
    await act(async () => {
      fireEvent.click(aButton);
    });

    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.confirmedInventory).not.toContain("A");
    // Other chars still present
    expect(results[0]!.confirmedInventory).toContain("a");
  });

  it("adding a missing char includes it in confirmedInventory", async () => {
    mockSynthesizeInventory.mockResolvedValueOnce(HAUSA_INVENTORY);

    const results: SurveyPhaseResult[] = [];
    await act(async () => {
      renderPhaseB(
        { bcp47: "ha-Latn", language_name: "Hausa" },
        (r) => results.push(r),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /add missing characters/i })).toBeTruthy();
    });

    // Type "ŋ" in the add field and click + Add
    const addInput = screen.getByRole("textbox", { name: /add missing characters/i });
    await act(async () => {
      fireEvent.change(addInput, { target: { value: "ŋ" } });
    });
    const addBtn = screen.getByRole("button", { name: /\+ add/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    // Confirm
    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(results[0]!.confirmedInventory).toContain("ŋ");
  });

  it("confirmedInventory is NFC-normalized and deduplicated", async () => {
    // Inventory with NFD é (e + combining acute) in lowercase
    const NFD_E_ACUTE = "é";
    const NFC_E_ACUTE = "é";
    const invWithNfd: LinguistInventory = {
      language: "test",
      script: "Latin",
      alphabetCore: { lowercase: [NFD_E_ACUTE], uppercase: [] },
      mandatoryDiacriticsAndLigatures: [],
      languageSpecificPunctuation: [],
      numerals: [],
    };
    mockSynthesizeInventory.mockResolvedValueOnce(invWithNfd);

    const results: SurveyPhaseResult[] = [];
    await act(async () => {
      renderPhaseB(
        { bcp47: "fr", language_name: "French" },
        (r) => results.push(r),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /confirm/i })).toBeTruthy();
    });

    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(results[0]!.confirmedInventory).toContain(NFC_E_ACUTE);
    // Should NOT contain the NFD form
    expect(results[0]!.confirmedInventory).not.toContain(NFD_E_ACUTE);
  });
});

// ---------------------------------------------------------------------------
// 4. Empty / no-coverage fallback
// ---------------------------------------------------------------------------

describe("LinguistProposalView — empty / no-coverage state", () => {
  it("shows fallback when bcp47 is blank (no synthesizeInventory call)", async () => {
    renderPhaseB({ language_name: "Unknown", bcp47: "" });

    // Default is manual since bcp47 is empty — navigate to linguist manually
    const linguistRadio = screen.getByRole("radio", {
      name: /show me a suggested list/i,
    });
    await act(async () => {
      fireEvent.click(linguistRadio);
    });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Error state should show "step-by-step" fallback
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /use step-by-step instead/i }),
      ).toBeTruthy();
    });

    expect(mockSynthesizeInventory).not.toHaveBeenCalled();
  });

  it("shows fallback when synthesizeInventory rejects", async () => {
    mockSynthesizeInventory.mockRejectedValueOnce(new Error("Network failure"));

    await act(async () => {
      renderPhaseB({ bcp47: "ha-Latn", language_name: "Hausa" });
    });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /use step-by-step instead/i }),
      ).toBeTruthy();
    });
  });

  it("'Use step-by-step instead' button switches to manual path", async () => {
    mockSynthesizeInventory.mockRejectedValueOnce(new Error("oops"));

    await act(async () => {
      renderPhaseB({ bcp47: "ha-Latn", language_name: "Hausa" });
    });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /use step-by-step instead/i }),
      ).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /use step-by-step instead/i }),
      );
    });

    // Should now render the manual SurveyRunner heading
    expect(screen.getByText(/Phase B — Character inventory/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 5. contextFromIdentity bcp47 threading — tested via exported helper
// ---------------------------------------------------------------------------
// The contextFromIdentity function is not directly exported, but the IntroChooser
// behaviour above verifies the threading indirectly (bcp47 in context → linguist default).
// A direct unit test is in StudioShell.bcp47.test.tsx alongside the helper.
