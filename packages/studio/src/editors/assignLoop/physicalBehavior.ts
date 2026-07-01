// physicalBehavior.ts — hook encapsulating all state + handlers for the
// physical (desktop) assign-loop gallery (MechanismGallery Phase C).
//
// Extracted from MechanismGallery.tsx so AssignLoopShell can compose the same
// chrome around both the physical and touch galleries in a future pass.
//
// All logic is moved VERBATIM from MechanismGallery.tsx — no behaviour changes.

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useShallow } from "zustand/react/shallow";
import type {
  BaseKeyboard,
  Pattern,
  MechanismAssignment,
  PlacementMap,
} from "@keyboard-studio/contracts";
import { isDecomposableAccented } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { getPatternLibraryService } from "../../lib/services.ts";
import type { DiscoveryAxisVector } from "@keyboard-studio/contracts";
import { useKeyboardArtifact, type ScaffoldSpec, type Stage } from "../../hooks/useKeyboardArtifact.ts";
import { useWorkingCopyTransform } from "../../hooks/useWorkingCopyTransform.ts";
import { useInventoryDiff } from "../../hooks/useInventoryDiff.ts";
import type { PlacementSeedEntry } from "../../survey/placementSeeds.ts";
import { getSuggestionForChar } from "../../survey/placementSeeds.ts";
import { ALL_PICKABLE_KEYS } from "../../lib/keyOptions.ts";

// ---------------------------------------------------------------------------
// Helpers (module-level, shared with MechanismGallery via re-export)
// ---------------------------------------------------------------------------

// Pattern IDs as they exist in the browser pattern library (content/patterns/).
// These MUST match the `id:` fields in the YAML — a mismatch means getById()
// returns undefined, the assignment can't resolve, and the live preview never
// reflects the added key.
export const PATTERN_SEQUENCE = "multi_char_sequence"; // S-03
export const PATTERN_DEADKEY = "deadkey_single_tap"; // S-02
export const PATTERN_SWAP = "simple_swap"; // S-01
export const PATTERN_RALT = "modifier_as_layer_switch"; // S-08

export function methodLabel(ref: { patternId: string; slotValues?: Record<string, string> }): string {
  const sv = ref.slotValues ?? {};
  switch (ref.patternId) {
    case "multi_char_sequence":
      return `Sequence: ${sv["firstLetterOut"] ?? "?"}+${sv["secondLetter"] ?? "?"}`;
    case "deadkey_single_tap":
      return `Deadkey: ${sv["triggerKey"] ?? "?"} + ${sv["baseLetters"] ?? "?"}`;
    case "simple_swap":
      return `Key: ${(sv["kmnRules"] ?? "").replace(/^\+ \[/, "").replace(/\].*/, "")}`;
    case "modifier_as_layer_switch":
      return `RAlt: ${(sv["altgrKeyList"] ?? "").split(" ").pop()?.replace(/^\[/, "").replace(/\]$/, "") ?? "?"}`;
    default:
      return ref.patternId;
  }
}

// Maps each DEADKEY_OPTIONS key value to the unshifted character it produces.
// Used to derive a deadkey ID matching the sil_cameroon_qwerty convention
// (dk ID = Unicode codepoint of the trigger key's character, e.g. dk(003b) for `;`).
export const TRIGGER_KEY_CHARS: Record<string, string> = {
  "K_LBRKT":   "[", // left bracket [
  "K_RBRKT":   "]", // right bracket ]
  "K_BKQUOTE": "`", // backtick `
  "K_COLON":   ";", // semicolon ;
};

/**
 * Returns the hex deadkey ID for a given trigger key, following the convention
 * used in sil_cameroon_qwerty: `dk(003b)` for `;`, `dk(0027)` for `'`, etc.
 * Matches the character the key produces (unshifted) on US QWERTY.
 */
export function deadkeyNameFor(triggerKey: string): string {
  const char = TRIGGER_KEY_CHARS[triggerKey];
  if (char !== undefined) {
    return char.codePointAt(0)!.toString(16).padStart(4, "0");
  }
  // Fallback: unknown key — use a generic ID.
  return "dead0";
}

// ---------------------------------------------------------------------------
// DEADKEY_OPTIONS — shared between the hook and MethodChooser in MechanismGallery
// ---------------------------------------------------------------------------

export const DEADKEY_OPTIONS = [
  { value: "K_COLON",   label: "K_COLON (semicolon ;)" },
  { value: "K_LBRKT",   label: "K_LBRKT (left bracket [)" },
  { value: "K_RBRKT",   label: "K_RBRKT (right bracket ])" },
  { value: "K_BKQUOTE", label: "K_BKQUOTE (backtick `)" },
] as const;

// Module-level Set for O(1) membership checks in handleKeyTap.
export const VALID_DEADKEY_TRIGGER_KEYS: ReadonlySet<string> = new Set(
  DEADKEY_OPTIONS.map((o) => o.value),
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Method = "sequence" | "deadkey" | "swap" | "ralt";

export interface MechanismGalleryProps {
  selectedBaseKeyboard: BaseKeyboard | null;
  onComplete?: () => void;
  onBack?: () => void;
  /**
   * Optional kbgen placement map. When supplied, MechanismGallery shows a
   * suggestion row above the method chooser for any character that has a
   * qualifying placement candidate (confidence >= default threshold).
   * No kbgen data => no row; gallery behaves exactly as today.
   */
  placementMap?: PlacementMap;
}

export interface PhysicalAssignLoopState {
  // Store-derived
  locked: boolean;
  inventory: string[];
  // Intro splash
  mechIntroSeen: boolean;
  markGalleryIntroSeen: (gallery: "mechanism" | "touch") => void;
  showIntro: boolean;
  setShowIntro: (v: boolean) => void;
  // Character loop
  lettersToAdd: string[];
  currentChar: string | null;
  setCurrentChar: (c: string | null) => void;
  isDone: boolean;
  coveredChars: Set<string>;
  skippedChars: Set<string>;
  coveredCount: number;
  sessionAssignments: MechanismAssignment[];
  // Pattern loading
  patternMap: Map<string, Pattern>;
  loading: boolean;
  loadError: string | null;
  // Artifact pipeline
  artifactStage: Stage;
  artifactRetry: () => void;
  // Per-char method state
  method: Method;
  setMethod: (m: Method) => void;
  seqFirst: string;
  setSeqFirst: (v: string) => void;
  seqSecond: string;
  setSeqSecond: (v: string) => void;
  triggerKey: string;
  setTriggerKey: (v: string) => void;
  deadkeyBaseLetter: string;
  setDeadkeyBaseLetter: (v: string) => void;
  selectedSwapKey: string;
  setSelectedSwapKey: (v: string) => void;
  selectedRaltKey: string;
  setSelectedRaltKey: (v: string) => void;
  // Suggestion row
  suggestion: PlacementSeedEntry | null;
  suggestionDismissed: boolean;
  // Handlers
  resetMethodState: () => void;
  handleSuggestionAccept: () => void;
  handleSuggestionChange: () => void;
  canApply: boolean;
  handleApply: () => void;
  appliedForCurrentChar: number;
  canGoNext: boolean;
  handleNext: () => void;
  canGoBack: boolean;
  handleBack: () => void;
  handleSkip: () => void;
  handleRemoveCovered: (char: string) => void;
  handleRemoveMechanism: (assignment: MechanismAssignment) => void;
  handleKeyTap: (keyId: string) => void;
}

// ---------------------------------------------------------------------------
// usePhysicalAssignLoop
// ---------------------------------------------------------------------------

export function usePhysicalAssignLoop(
  props: MechanismGalleryProps,
): PhysicalAssignLoopState {
  const { selectedBaseKeyboard, placementMap } = props;

  const locked = useWorkingCopyStore((s) => s.desktopLocked);
  const recordAssignments = useWorkingCopyStore((s) => s.recordAssignments);
  const inventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const axes = useWorkingCopyStore(
    useShallow((s) => s.session.axes as Partial<DiscoveryAxisVector>),
  );

  // One-time intro splash — read the seen flag on mount; mark it on "Get started".
  const mechIntroSeen = useWorkingCopyStore((s) => s.galleryIntrosSeen.mechanism);
  const markGalleryIntroSeen = useWorkingCopyStore((s) => s.markGalleryIntroSeen);

  const { lettersToAdd } = useInventoryDiff();

  // Read Phase C assignments directly (not the merged session.assignments view)
  // so multiple methods per character are preserved.
  const sessionAssignments = useMemo(
    () =>
      (phaseResults.find((p) => p.phase === "C")?.assignments ?? []).filter(
        (a) => a.modality === "physical",
      ),
    [phaseResults],
  );

  // The covered set: chars in lettersToAdd that have at least one assignment.
  const coveredChars = useMemo(
    () =>
      new Set(
        sessionAssignments
          .filter((a) => a.scope === "individual")
          .map((a) => a.target)
          .filter((t) => lettersToAdd.includes(t)),
      ),
    [sessionAssignments, lettersToAdd],
  );

  // Skipped chars — tracked in local state; count toward Done gate.
  const [skippedChars, setSkippedChars] = useState<Set<string>>(new Set());

  // One-time intro splash — shown on first entry to the desktop mechanism gallery only.
  const [showIntro, setShowIntro] = useState(() => !mechIntroSeen);

  // currentChar: explicit state — does NOT auto-advance when a method is applied.
  // Only advances when the user clicks "Next character →" or "Skip".
  const [currentChar, setCurrentChar] = useState<string | null>(null);
  const lettersKey = lettersToAdd.join("\0");
  useEffect(() => {
    setCurrentChar((prev) => {
      // Keep current char if it's still in the list (e.g., inventory refresh).
      if (prev !== null && lettersToAdd.includes(prev)) return prev;
      // Pick the first uncovered+unskipped char, or the very first if all covered.
      return (
        lettersToAdd.find(
          (c) => !coveredChars.has(c) && !skippedChars.has(c),
        ) ??
        lettersToAdd[0] ??
        null
      );
    });
    // Intentionally omit coveredChars/skippedChars — only re-run when the
    // inventory list itself changes, not when methods are applied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lettersKey]);

  // Done = every char in lettersToAdd is covered or skipped.
  const isDone = useMemo(
    () =>
      lettersToAdd.length === 0 ||
      lettersToAdd.every((c) => coveredChars.has(c) || skippedChars.has(c)),
    [lettersToAdd, coveredChars, skippedChars],
  );

  // ---------------------------------------------------------------------------
  // Pattern loading — needed for patternMap (GalleryPreviewWithPatterns)
  // ---------------------------------------------------------------------------

  const [patternMap, setPatternMap] = useState<Map<string, Pattern>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedBaseKeyboard === null) {
      setPatternMap(new Map());
      setLoadError(null);
      return;
    }

    setLoading(true);
    setLoadError(null);
    const svc = getPatternLibraryService();

    const fullAxes: DiscoveryAxisVector | undefined =
      axes.scale !== undefined &&
      axes.scriptClass !== undefined &&
      axes.phoneticIntuition !== undefined &&
      axes.diacriticBehavior !== undefined &&
      axes.multiMode !== undefined &&
      axes.constraintEnforcement !== undefined &&
      axes.spareKeyAvailability !== undefined
        ? (axes as DiscoveryAxisVector)
        : undefined;

    svc
      .filterFor(selectedBaseKeyboard, fullAxes)
      .then((ranked) => {
        // Load ranked patterns PLUS all four methods the add-a-key UI offers.
        // Axis-based ranking may exclude off-strategy patterns, so load them
        // explicitly so the preview transform can always resolve an applied
        // assignment.
        const ids = new Set<string>(ranked.map((m) => m.patternId));
        ids.add(PATTERN_SEQUENCE);
        ids.add(PATTERN_DEADKEY);
        ids.add(PATTERN_SWAP);
        ids.add(PATTERN_RALT);
        return Promise.all([...ids].map((id) => svc.getById(id)));
      })
      .then((patterns) => {
        const map = new Map<string, Pattern>();
        for (const p of patterns) {
          if (p !== undefined) {
            map.set(p.id, p);
          } else {
            console.warn(
              "[MechanismGallery] getById() returned undefined for a patternId",
            );
          }
        }
        setPatternMap(map);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[MechanismGallery] filterFor error:", err);
        setLoadError(msg);
        setLoading(false);
      });
  }, [selectedBaseKeyboard, axes]);

  // ---------------------------------------------------------------------------
  // Keyboard artifact pipeline — owns the single WASM compile for Phase C.
  // ---------------------------------------------------------------------------

  const identity = useWorkingCopyStore((s) => s.identity);
  const galleryScaffoldSpec = useMemo<ScaffoldSpec | null>(
    () =>
      identity?.keyboardId != null
        ? { keyboardId: identity.keyboardId, displayName: identity.displayName ?? "" }
        : null,
    [identity?.keyboardId, identity?.displayName],
  );
  const galleryVfsTransform = useWorkingCopyTransform({ patternMap });
  const { stage: artifactStage, retry: artifactRetry } = useKeyboardArtifact(
    selectedBaseKeyboard,
    galleryScaffoldSpec,
    galleryVfsTransform,
  );

  // ---------------------------------------------------------------------------
  // Per-char method state — reset when currentChar changes
  // ---------------------------------------------------------------------------

  const [method, setMethod] = useState<Method>("sequence");
  const [seqFirst, setSeqFirst] = useState("");
  const [seqSecond, setSeqSecond] = useState("");
  const [triggerKey, setTriggerKey] = useState("K_COLON");
  const [deadkeyBaseLetter, setDeadkeyBaseLetter] = useState("");
  const [selectedSwapKey, setSelectedSwapKey] = useState("");
  const [selectedRaltKey, setSelectedRaltKey] = useState("");

  // kbgen placement suggestion for the current character (null when no map or
  // no qualifying candidate). Memoized against currentChar + placementMap so it
  // only recomputes on actual input changes, not on unrelated re-renders.
  const suggestion = useMemo(
    (): PlacementSeedEntry | null =>
      placementMap !== undefined && currentChar !== null
        ? getSuggestionForChar(currentChar, placementMap)
        : null,
    [currentChar, placementMap],
  );

  // Whether the author has dismissed the suggestion row for the current char.
  // Reset to false whenever currentChar changes (see effect below).
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // ---------------------------------------------------------------------------
  // Method-input reset — called after apply or suggestion accept
  // ---------------------------------------------------------------------------

  const resetMethodState = useCallback(() => {
    setMethod("sequence");
    setSeqFirst("");
    setSeqSecond("");
    setTriggerKey("K_COLON");
    setDeadkeyBaseLetter("");
    setSelectedSwapKey("");
    setSelectedRaltKey("");
  }, []);

  // Reset inputs whenever currentChar changes.
  useEffect(() => {
    setSuggestionDismissed(false);
    resetMethodState();
    if (currentChar !== null && isDecomposableAccented(currentChar)) {
      // §3c defaults-first: for a decomposable accented letter the natural method
      // is deadkey (S-02) — propose-then-confirm. resetMethodState sets "sequence"
      // unconditionally, so override here after the reset.
      setDeadkeyBaseLetter([...currentChar.normalize("NFD")][0] ?? "");
      setMethod("deadkey");
    }
  }, [currentChar, resetMethodState]);

  // ---------------------------------------------------------------------------
  // Suggestion row handlers
  // ---------------------------------------------------------------------------

  // Accept: immediately apply the suggested assignment (same logic as handleApply
  // for swap/ralt, but using the candidate's vkey directly to avoid the async
  // state-update window that would occur if we pre-filled pickers first).
  const handleSuggestionAccept = useCallback(() => {
    if (suggestion === null || currentChar === null) return;
    const { vkey } = suggestion.topCandidate;
    let assignment: MechanismAssignment;
    if (suggestion.strategyId === "S-01") {
      const cp = currentChar.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") ?? "0000";
      assignment = {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [{ patternId: PATTERN_SWAP, strategyId: "S-01", slotValues: { kmnRules: `+ [${vkey}] > U+${cp}` } }],
        source: "user",
      };
    } else if (suggestion.strategyId === "S-08") {
      assignment = {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [{ patternId: PATTERN_RALT, strategyId: "S-08", slotValues: { altgrKeyList: `[RALT ${vkey}]`, altgrOutputList: currentChar } }],
        source: "user",
      };
    } else {
      setSuggestionDismissed(true);
      console.warn(`[MechanismGallery] handleSuggestionAccept: unrecognised strategyId "${suggestion.strategyId}" — dismissing suggestion`);
      return;
    }
    recordAssignments([...sessionAssignments, assignment]);
    setSuggestionDismissed(true);
    resetMethodState();
  }, [suggestion, currentChar, sessionAssignments, recordAssignments, resetMethodState]);

  // Change: dismiss the suggestion row; pickers stay blank for manual selection.
  const handleSuggestionChange = useCallback(() => {
    setSuggestionDismissed(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Apply action
  // ---------------------------------------------------------------------------

  const canApply = useMemo(() => {
    if (currentChar === null) return false;
    if (method === "sequence") {
      // Both must be single graphemes (non-empty).
      return seqFirst.trim().length > 0 && seqSecond.trim().length > 0;
    }
    if (method === "swap") {
      return selectedSwapKey !== "";
    }
    if (method === "ralt") {
      return selectedRaltKey !== "";
    }
    // deadkey: triggerKey always has a value; base letter must be non-empty.
    return deadkeyBaseLetter.trim().length > 0;
  }, [currentChar, method, seqFirst, seqSecond, deadkeyBaseLetter, selectedSwapKey, selectedRaltKey]);

  const handleApply = useCallback(() => {
    if (currentChar === null || !canApply) return;

    let assignment: MechanismAssignment;

    if (method === "sequence") {
      assignment = {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SEQUENCE,
            strategyId: "S-03",
            slotValues: {
              firstLetterOut: seqFirst.trim(),
              secondLetter: seqSecond.trim(),
              collapsedChar: currentChar,
            },
          },
        ],
        source: "user",
      };
    } else if (method === "deadkey") {
      const base = deadkeyBaseLetter.trim();
      // accentChar: the character emitted when the trigger key is pressed twice.
      // Always use the trigger key's literal character (e.g. ';' for K_COLON)
      // so that pressing trigger+trigger escapes back to the bare character.
      const accentChar = TRIGGER_KEY_CHARS[triggerKey] ?? "";
      assignment = {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_DEADKEY,
            strategyId: "S-02",
            slotValues: {
              triggerKey,
              deadkeyName: deadkeyNameFor(triggerKey),
              baseLetters: base,
              accentedForms: currentChar,
              accentChar,
            },
          },
        ],
        source: "user",
      };
    } else if (method === "swap") {
      // S-01: simple_swap — kmnFragment uses {{kmnRules}}.
      // Build the single KMN rule for this character: `+ [K_X] > U+XXXX`.
      const cp = currentChar.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") ?? "0000";
      const kmnRules = `+ [${selectedSwapKey}] > U+${cp}`;
      assignment = {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_SWAP,
            strategyId: "S-01",
            slotValues: {
              kmnRules,
            },
          },
        ],
        source: "user",
      };
    } else {
      // method === "ralt"
      // S-08: modifier_as_layer_switch — kmnFragment uses {{altgrKeyList}} and {{altgrOutputList}}.
      // Build a single-entry held-layer rule for this character.
      assignment = {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_RALT,
            strategyId: "S-08",
            slotValues: {
              altgrKeyList: `[RALT ${selectedRaltKey}]`,
              altgrOutputList: currentChar,
            },
          },
        ],
        source: "user",
      };
    }

    recordAssignments([...sessionAssignments, assignment]);
    resetMethodState();
  }, [
    currentChar,
    canApply,
    method,
    seqFirst,
    seqSecond,
    triggerKey,
    deadkeyBaseLetter,
    selectedSwapKey,
    selectedRaltKey,
    recordAssignments,
    sessionAssignments,
    resetMethodState,
  ]);

  // How many methods have already been applied to the current character.
  const appliedForCurrentChar = useMemo(
    () =>
      sessionAssignments.filter(
        (a) => a.scope === "individual" && a.target === currentChar,
      ).length,
    [sessionAssignments, currentChar],
  );
  const canGoNext = appliedForCurrentChar > 0;

  const handleNext = useCallback(() => {
    if (currentChar === null) return;
    const idx = lettersToAdd.indexOf(currentChar);
    const next =
      lettersToAdd
        .slice(idx + 1)
        .find((c) => !coveredChars.has(c) && !skippedChars.has(c)) ??
      lettersToAdd
        .slice(0, idx)
        .find((c) => !coveredChars.has(c) && !skippedChars.has(c)) ??
      null;
    // When no uncovered+unskipped char remains, explicitly land on null so the
    // "All done" branch (currentChar === null && isDone) becomes visible.
    setCurrentChar(next);
  }, [currentChar, lettersToAdd, coveredChars, skippedChars]);

  const canGoBack = useMemo(() => {
    if (currentChar === null) return false;
    return lettersToAdd.indexOf(currentChar) > 0;
  }, [currentChar, lettersToAdd]);

  const handleBack = useCallback(() => {
    if (currentChar === null) return;
    const idx = lettersToAdd.indexOf(currentChar);
    if (idx <= 0) return;
    setCurrentChar(lettersToAdd[idx - 1] ?? null);
  }, [currentChar, lettersToAdd]);

  const handleSkip = useCallback(() => {
    if (currentChar === null) return;
    setSkippedChars((prev) => new Set([...prev, currentChar]));
    const idx = lettersToAdd.indexOf(currentChar);
    const next =
      lettersToAdd
        .slice(idx + 1)
        .find(
          (c) =>
            !coveredChars.has(c) &&
            !skippedChars.has(c) &&
            c !== currentChar,
        ) ??
      lettersToAdd
        .slice(0, idx)
        .find(
          (c) =>
            !coveredChars.has(c) &&
            !skippedChars.has(c) &&
            c !== currentChar,
        ) ??
      null;
    setCurrentChar(next);
  }, [currentChar, lettersToAdd, coveredChars, skippedChars]);

  const handleRemoveCovered = useCallback(
    (char: string) => {
      const next = sessionAssignments.filter(
        (a) => !(a.scope === "individual" && a.target === char),
      );
      recordAssignments(next);
    },
    [sessionAssignments, recordAssignments],
  );

  const handleRemoveMechanism = useCallback(
    (assignment: MechanismAssignment) => {
      recordAssignments(sessionAssignments.filter((a) => a !== assignment));
    },
    [sessionAssignments, recordAssignments],
  );

  const handleKeyTap = useCallback(
    (keyId: string) => {
      if (locked) return;
      if (method === "swap" && ALL_PICKABLE_KEYS.has(keyId)) {
        setSelectedSwapKey(keyId);
      } else if (method === "ralt" && ALL_PICKABLE_KEYS.has(keyId)) {
        setSelectedRaltKey(keyId);
      } else if (method === "deadkey" && VALID_DEADKEY_TRIGGER_KEYS.has(keyId)) {
        setTriggerKey(keyId);
      }
      // method === "sequence" or unrecognised key: ignore
    },
    [method, locked],
  );

  const coveredCount = lettersToAdd.filter((c) => coveredChars.has(c)).length;

  return {
    // Store-derived
    locked,
    inventory,
    // Intro splash
    mechIntroSeen,
    markGalleryIntroSeen,
    showIntro,
    setShowIntro,
    // Character loop
    lettersToAdd,
    currentChar,
    setCurrentChar,
    isDone,
    coveredChars,
    skippedChars,
    coveredCount,
    sessionAssignments,
    // Pattern loading
    patternMap,
    loading,
    loadError,
    // Artifact pipeline
    artifactStage,
    artifactRetry,
    // Per-char method state
    method,
    setMethod,
    seqFirst,
    setSeqFirst,
    seqSecond,
    setSeqSecond,
    triggerKey,
    setTriggerKey,
    deadkeyBaseLetter,
    setDeadkeyBaseLetter,
    selectedSwapKey,
    setSelectedSwapKey,
    selectedRaltKey,
    setSelectedRaltKey,
    // Suggestion row
    suggestion,
    suggestionDismissed,
    // Handlers
    resetMethodState,
    handleSuggestionAccept,
    handleSuggestionChange,
    canApply,
    handleApply,
    appliedForCurrentChar,
    canGoNext,
    handleNext,
    canGoBack,
    handleBack,
    handleSkip,
    handleRemoveCovered,
    handleRemoveMechanism,
    handleKeyTap,
  };
}
