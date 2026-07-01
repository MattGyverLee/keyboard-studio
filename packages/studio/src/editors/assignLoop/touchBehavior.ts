// touchBehavior — the `physical-suggested → hand-set` promotion on manual edit
// (spec-014 US2 / FR-014 / R4), T025.
//
// When the author manually edits a touch key that re-propagation currently
// owns (`physical-suggested`, or its `base-derived` sibling), that key is
// PROMOTED to `hand-set` so subsequent re-propagation never clobbers the
// author's edit (the no-clobber rule, repropagation.contract.md R4).
//
// State transition (data-model.md):
//   physical-suggested ─(author manually edits the key)──> hand-set
//   base-derived       ─(author manually edits the key)──> hand-set
//   hand-set           ─(idempotent)──────────────────────> hand-set
//
// Pure helpers; the TouchGallery edit call site wires `promoteKeyToHandSet`
// thinly (logic lives here, not in the component).
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/data-model.md § state transitions
//   specs/014-mutate-seam-touch-propagation/contracts/repropagation.contract.md (R4)

import { useState, useEffect, useMemo, useCallback } from "react";
import type { TouchAssignment, BaseKeyboard, LintFinding } from "@keyboard-studio/contracts";
import { createVirtualFS, isDecomposableAccented } from "@keyboard-studio/contracts";
import { buildTouchLayoutJson } from "../../lib/buildTouchLayoutJson.ts";
import { resolveBaseTouchJson } from "../../lib/resolveBaseTouchJson.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { isMutateSeamEnabled } from "../../flags/mutateFlag.ts";
import { useTouchLint } from "../../hooks/useTouchLint.ts";
import { useKeyboardArtifact } from "../../hooks/useKeyboardArtifact.ts";
import type { Stage, ScaffoldSpec, VfsTransform } from "../../hooks/useKeyboardArtifact.ts";
import { scaffoldTouchLayout } from "@keyboard-studio/engine";
import { VALID_HOST_KEYS } from "../../lib/keyOptions.ts";
import type { KeyboardIR, TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Touch method type (exported for TouchGallery.tsx render)
// ---------------------------------------------------------------------------

// Selectable methods in the chooser. `touch_inherited` is intentionally NOT a
// chooser option — inherited characters are recorded via the auto-detected
// "already" suggestion (handleSuggestionAccept), and Skip moves on without an
// assignment. The pattern-apply engine still understands the touch_inherited
// patternId those suggestions produce.
export type TouchMethod = "touch_key_replace" | "longpress_alternates" | "flick_gestures" | "multitap";

// ---------------------------------------------------------------------------
// Pure IR helpers (pre-existing)
// ---------------------------------------------------------------------------

/**
 * Return a structural clone of `layout` with the key whose id is `keyId`
 * promoted to `hand-set`. If the key is already `hand-set` the result is
 * value-equal (idempotent). If no key matches `keyId`, the layout is returned
 * unchanged (a structural clone). Pure — `layout` is not mutated.
 */
export function promoteKeyToHandSet(
  layout: TouchLayoutIR,
  keyId: string,
): TouchLayoutIR {
  const promote = (key: TouchKeyIR): TouchKeyIR =>
    key.id === keyId ? { ...structuredClone(key), provenance: "hand-set" } : structuredClone(key);

  return {
    platforms: layout.platforms.map((platform) => ({
      ...platform,
      layers: platform.layers.map((layer) => ({
        ...layer,
        rows: layer.rows.map((row) => ({ keys: row.keys.map(promote) })),
      })),
    })),
    nodeIds: structuredClone(layout.nodeIds),
  };
}

/**
 * Return a structural clone of `ir` with the touch key `keyId` promoted to
 * `hand-set` (FR-014). A no-op (structural copy) when the IR ships no touch
 * layout. Pure — `ir` is not mutated.
 *
 * This is the helper the TouchGallery manual-edit call site invokes (under the
 * mutate flag) so an author's edit to a re-propagation-owned key survives the
 * next physical change.
 */
export function promoteOnManualEdit(ir: KeyboardIR, keyId: string): KeyboardIR {
  if (ir.touchLayout === undefined) return structuredClone(ir);
  return {
    ...structuredClone(ir),
    touchLayout: promoteKeyToHandSet(ir.touchLayout, keyId),
  };
}

// ---------------------------------------------------------------------------
// Suggestion type (exported for TouchGallery.tsx render)
// ---------------------------------------------------------------------------

export type Suggestion =
  | { kind: "longpress"; hostKey: string }
  | { kind: "replace"; hostKey: string }
  | { kind: "already" }
  | { kind: "none" };

// ---------------------------------------------------------------------------
// Props type (defined here to avoid circular import with TouchGallery.tsx)
// ---------------------------------------------------------------------------

export interface TouchGalleryProps {
  onComplete: (assignments: TouchAssignment[]) => void;
  /**
   * Called when the user clicks Back on the very first character (or from the
   * empty-inventory guard). Should navigate back to Phase C ("mechanisms").
   * Phase C will be in its locked/read-only state — no unlock is performed.
   */
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// useTouchAssignLoop return shape
// ---------------------------------------------------------------------------

export interface UseTouchAssignLoopResult {
  baseKeyboard: BaseKeyboard | null;
  inventory: string[];
  showIntro: boolean;
  setShowIntro: (v: boolean) => void;
  markGalleryIntroSeen: (gallery: "mechanism" | "touch") => void;
  charTouch: Map<string, TouchAssignment>;
  skippedChars: Set<string>;
  charHistory: string[];
  currentChar: string | null;
  isDone: boolean;
  suggestion: Suggestion;
  method: TouchMethod;
  setMethod: (m: TouchMethod) => void;
  hostKey: string;
  setHostKey: (v: string) => void;
  flickDirection: string;
  setFlickDirection: (v: string) => void;
  suggestionDismissed: boolean;
  appliedForCurrentChar: boolean;
  canApply: boolean;
  handleSuggestionAccept: () => void;
  handleUseSuggestion: () => void;
  handleSuggestionChange: () => void;
  handleApply: () => void;
  handleNext: () => void;
  handleSkip: () => void;
  handleBack: () => void;
  handleRemoveConfigured: (char: string) => void;
  handleKeyTap: (keyId: string) => void;
  handleContinue: () => void;
  stage: Stage;
  retry: () => void;
  touchFindings: LintFinding[];
  touchLintRunning: boolean;
  totalChars: number;
  currentCharIndex: number;
  showChooser: boolean;
}

// ---------------------------------------------------------------------------
// useTouchAssignLoop — all hook logic extracted from TouchGallery.tsx
// ---------------------------------------------------------------------------

export function useTouchAssignLoop({ onComplete, onBack }: TouchGalleryProps): UseTouchAssignLoopResult {
  const baseVfs = useWorkingCopyStore((s) => s.baseVfs);
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const identity = useWorkingCopyStore((s) => s.identity);
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);

  // Character inventory — same source MechanismGallery uses.
  const inventory = useWorkingCopyStore((s) => s.session.confirmedInventory);

  // Draft persistence — read on mount; write on every charTouch/skippedChars change.
  const touchDraft = useWorkingCopyStore((s) => s.touchDraft);
  const setTouchDraft = useWorkingCopyStore((s) => s.setTouchDraft);

  // One-time intro splash — read the seen flag on mount; mark it on "Get started".
  const touchIntroSeen = useWorkingCopyStore((s) => s.galleryIntrosSeen.touch);
  const markGalleryIntroSeen = useWorkingCopyStore((s) => s.markGalleryIntroSeen);

  // Derive keyboardId from identity (Track 1) or baseKeyboard (Track 2).
  const keyboardId = identity?.keyboardId ?? baseKeyboard?.id ?? null;

  // ---------------------------------------------------------------------------
  // Live OSK preview — right pane wiring
  // ---------------------------------------------------------------------------

  const scaffoldSpec = useMemo<ScaffoldSpec | null>(
    () =>
      identity?.keyboardId != null
        ? { keyboardId: identity.keyboardId, displayName: identity.displayName ?? "" }
        : null,
    [identity?.keyboardId, identity?.displayName],
  );

  // ---------------------------------------------------------------------------
  // Per-character touch assignment state (declared early — memos below depend on it)
  // ---------------------------------------------------------------------------

  // Local map of explicitly-configured characters: char -> TouchAssignment.
  // Rehydrated from the store draft on mount so back-navigation from Phase C
  // preserves work already done in Phase E.
  const [charTouch, setCharTouch] = useState<Map<string, TouchAssignment>>(() =>
    touchDraft !== null
      ? new Map(touchDraft.charTouchEntries)
      : new Map(),
  );

  // Stable primitive key serializing the current charTouch map so useMemo fires
  // exactly when the author's edits change (mirrors assignmentsKey in
  // useWorkingCopyTransform.ts lines ~100-111 — same pattern, different source).
  const touchKey = useMemo(
    () =>
      [...charTouch.values()]
        .map(
          (a) =>
            `${a.target}:${a.mechanisms
              .map((m) => `${m.patternId}/${JSON.stringify(m.slotValues ?? {})}`)
              .join(",")}`,
        )
        .join("|"),
    [charTouch],
  );

  // Build applied touch layout JSON only when the author has made real (non-inherited)
  // touch edits. When there are no such edits, return null so the VFS is left
  // untouched and KMW renders its own polished native default (or the keyboard's
  // shipped .keyman-touch-layout file is used verbatim).
  //
  // "Real edit" = at least one assignment whose patternId !== "touch_inherited".
  // This filter matches handleContinue exactly (the single source of truth).
  const touchLayoutJson = useMemo(() => {
    const appliedEdits = [...charTouch.values()].filter(
      (a) => a.mechanisms[0]?.patternId !== "touch_inherited",
    );
    if (appliedEdits.length === 0) return null;
    if (baseIr === null) return null;
    // Case B: base ships a touch layout → apply faithfully onto raw JSON copy.
    // Case A: no shipped touch layout (or baseVfs not yet loaded) → IR-based path.
    return buildTouchLayoutJson(baseIr, appliedEdits, resolveBaseTouchJson(baseVfs)).json;
    // touchKey drives re-evaluation when charTouch changes (Map identity is
    // not stable; the key is). baseIr is a stable snapshot post-lockDesktop.
    // baseVfs is stable after instantiation but included for correctness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseIr, touchKey, baseVfs]);

  // VFS transform: inject the generated touch layout only when the author has
  // made real (non-inherited) touch edits. When touchLayoutJson is null — either
  // because no real edits exist or because the emit pipeline failed — leave the
  // VFS untouched so KMW renders its own polished native default (or the
  // keyboard's shipped .keyman-touch-layout file is used verbatim).
  const vfsTransform = useMemo<VfsTransform>(
    () => (vfs, kbId) => {
      if (touchLayoutJson !== null) {
        vfs.set(`source/${kbId}.keyman-touch-layout`, touchLayoutJson);
      }
      return { warnings: [] };
    },
    [touchLayoutJson],
  );

  const { stage, retry } = useKeyboardArtifact(baseKeyboard, scaffoldSpec, vfsTransform);

  // Skipped characters. Rehydrated from store draft on mount.
  const [skippedChars, setSkippedChars] = useState<Set<string>>(() =>
    touchDraft !== null
      ? new Set(touchDraft.skippedChars)
      : new Set(),
  );

  // Visited-character history stack (most-recently-visited at the end).
  // Populated by forward navigation; popped by the Back handler.
  // Using a history stack rather than index-1 arithmetic because the per-char
  // loop uses wrap-around logic (advanceToNext can skip already-configured chars),
  // so the actual sequence visited is not simply inventory[i-1].
  const [charHistory, setCharHistory] = useState<string[]>([]);

  // Intro splash — shown once when the author first enters the touch gallery so
  // the move from the desktop (physical) gallery to touch is explicit. The
  // store flag persists "seen" across unmount/remount, so the intro shows once
  // and not again on back-and-forth navigation to Phase C.
  const [showIntro, setShowIntro] = useState(() => !touchIntroSeen);

  // Write charTouch + skippedChars back to the store draft whenever they change
  // so that back-navigation (unmount) preserves in-progress work.
  useEffect(() => {
    setTouchDraft({
      charTouchEntries: [...charTouch.entries()],
      skippedChars: [...skippedChars],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charTouch, skippedChars]);

  // Current character index.
  const [currentChar, setCurrentChar] = useState<string | null>(null);

  // Sync currentChar when inventory loads or changes.
  const inventoryKey = inventory.join("\0");
  useEffect(() => {
    setCurrentChar((prev) => {
      if (inventory.length === 0) return null;
      // Keep current char if it's still in the list.
      if (prev !== null && inventory.includes(prev)) return prev;
      // Pick the first unconfigured+unskipped char.
      return (
        inventory.find((c) => !charTouch.has(c) && !skippedChars.has(c)) ??
        inventory[0] ??
        null
      );
    });
    // Only re-run when the inventory list itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryKey]);

  // Done = every char is configured or skipped.
  const isDone = useMemo(
    () =>
      inventory.length > 0 &&
      inventory.every((c) => charTouch.has(c) || skippedChars.has(c)),
    [inventory, charTouch, skippedChars],
  );

  // ---------------------------------------------------------------------------
  // Phase C desktop assignments + detected-chars from scaffoldTouchLayout
  // ---------------------------------------------------------------------------

  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);

  const desktopAssignments = useMemo(
    () =>
      (phaseResults.find((p) => p.phase === "C")?.assignments ?? []).filter(
        (a) => a.modality === "physical" && a.scope === "individual",
      ),
    [phaseResults],
  );

  const detectedChars = useMemo<Set<string>>(() => {
    if (baseIr === null) return new Set<string>();
    try {
      const layout = scaffoldTouchLayout(baseIr);
      const set = new Set<string>();
      const push = (t?: string) => {
        if (t && t.length > 0 && !t.startsWith("*")) set.add(t);
      };
      for (const p of layout.platforms) {
        for (const layer of p.layers) {
          for (const row of layer.rows) {
            for (const k of row.keys) {
              push(k.text);
              push(k.output);
              (k.sk ?? []).forEach((s) => { push(s.text); push(s.output); });
              (k.multitap ?? []).forEach((s) => { push(s.text); push(s.output); });
              if (k.flick) {
                Object.values(k.flick).forEach((s) => {
                  if (s) { push(s.text); push(s.output); }
                });
              }
            }
          }
        }
      }
      return set;
    } catch {
      return new Set<string>();
    }
  }, [baseIr]);

  // ---------------------------------------------------------------------------
  // Per-character suggestion computation
  // ---------------------------------------------------------------------------

  const suggestion = useMemo<Suggestion>(() => {
    if (currentChar === null) return { kind: "none" };

    // Find Phase C desktop assignment for this character.
    const da = desktopAssignments.find((a) => a.target === currentChar);
    if (da) {
      const m = da.mechanisms[0];
      if (!m) return { kind: "none" };
      const pid = m.patternId;
      const sid = m.strategyId ?? "";
      const sv = m.slotValues ?? {};

      // simple_swap / S-01 → replace suggestion
      if (pid === "simple_swap" || sid === "S-01") {
        const match = (sv["kmnRules"] ?? "").match(/\+\s*\[([A-Z0-9_]+)\]/);
        const hk = match?.[1] ?? "";
        return { kind: "replace", hostKey: hk };
      }

      // deadkey_single_tap / S-02 → longpress from baseLetters
      if (pid === "deadkey_single_tap" || sid === "S-02") {
        const baseLetters = sv["baseLetters"] ?? "";
        const firstLetter = baseLetters[0];
        let hk = "";
        if (firstLetter && /^[a-zA-Z]$/.test(firstLetter)) {
          hk = `K_${firstLetter.toUpperCase()}`;
        }
        return { kind: "longpress", hostKey: hk };
      }

      // modifier_as_layer_switch / S-08 → longpress from altgrKeyList
      if (pid === "modifier_as_layer_switch" || sid === "S-08") {
        const match = (sv["altgrKeyList"] ?? "").match(/\[RALT\s+([A-Z0-9_]+)\]/);
        const hk = match?.[1] ?? "";
        return { kind: "longpress", hostKey: hk };
      }

      // multi_char_sequence / S-03 → longpress best-effort
      if (pid === "multi_char_sequence" || sid === "S-03") {
        const firstOut = sv["firstLetterOut"] ?? "";
        const firstChar = firstOut[0];
        let hk = "";
        if (firstChar && /^[a-zA-Z]$/.test(firstChar)) {
          hk = `K_${firstChar.toUpperCase()}`;
        }
        return { kind: "longpress", hostKey: hk };
      }

      // Assignment exists but unrecognized pattern
      return { kind: "none" };
    }

    // No desktop assignment
    if (detectedChars.has(currentChar)) {
      return { kind: "already" };
    }

    if (isDecomposableAccented(currentChar)) {
      const nfd = currentChar.normalize("NFD");
      const baseLetter = [...nfd][0] ?? "";
      let hk = "";
      if (baseLetter && /^[a-zA-Z]$/.test(baseLetter)) {
        hk = `K_${baseLetter.toUpperCase()}`;
      }
      return { kind: "longpress", hostKey: hk };
    }

    return { kind: "none" };
  }, [currentChar, desktopAssignments, detectedChars]);

  // ---------------------------------------------------------------------------
  // Per-character method state — reset when currentChar changes
  // ---------------------------------------------------------------------------

  const [method, setMethod] = useState<TouchMethod>("longpress_alternates");
  const [hostKey, setHostKey] = useState("");
  const [flickDirection, setFlickDirection] = useState("");

  // Whether the suggestion card has been dismissed for the current character.
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // Whether the method has been applied (enables "Next character ->").
  const [appliedForCurrentChar, setAppliedForCurrentChar] = useState(false);

  // Reset method state and suggestion dismissal when currentChar changes.
  useEffect(() => {
    setSuggestionDismissed(false);
    setMethod("longpress_alternates");
    setHostKey("");
    setFlickDirection("");
    setAppliedForCurrentChar(false);
  }, [currentChar]);

  // Also mark as applied if the char already has an entry in charTouch
  // (handles re-visiting a character).
  useEffect(() => {
    if (currentChar !== null && charTouch.has(currentChar)) {
      setAppliedForCurrentChar(true);
    }
  }, [currentChar, charTouch]);

  // ---------------------------------------------------------------------------
  // canApply
  // ---------------------------------------------------------------------------

  const canApply = useMemo(() => {
    if (currentChar === null) return false;
    if (method === "flick_gestures") return hostKey !== "" && flickDirection !== "";
    // longpress_alternates, multitap, and touch_key_replace require a host key.
    return hostKey !== "";
  }, [currentChar, method, hostKey, flickDirection]);

  // ---------------------------------------------------------------------------
  // Build assignment from current method state
  // ---------------------------------------------------------------------------

  function buildTouchAssignment(char: string): TouchAssignment {
    if (method === "longpress_alternates") {
      return {
        scope: "individual",
        target: char,
        modality: "touch",
        mechanisms: [{ patternId: "longpress_alternates", slotValues: { hostKey, char } }],
        source: "user",
      };
    }
    if (method === "flick_gestures") {
      return {
        scope: "individual",
        target: char,
        modality: "touch",
        mechanisms: [{ patternId: "flick_gestures", slotValues: { hostKey, direction: flickDirection, char } }],
        source: "user",
      };
    }
    if (method === "touch_key_replace") {
      return {
        scope: "individual",
        target: char,
        modality: "touch",
        mechanisms: [{ patternId: "touch_key_replace", slotValues: { hostKey, char } }],
        source: "user",
      };
    }
    // multitap
    return {
      scope: "individual",
      target: char,
      modality: "touch",
      mechanisms: [{ patternId: "multitap", slotValues: { hostKey, char } }],
      source: "user",
    };
  }

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------

  function advanceToNext(afterChar: string, nextCharTouch: Map<string, TouchAssignment>, nextSkipped: Set<string>) {
    const idx = inventory.indexOf(afterChar);
    const after = inventory
      .slice(idx + 1)
      .find((c) => !nextCharTouch.has(c) && !nextSkipped.has(c));
    if (after !== undefined) {
      setCharHistory((h) => [...h, afterChar]);
      setCurrentChar(after);
      return;
    }
    const wrap = inventory
      .slice(0, idx)
      .find((c) => !nextCharTouch.has(c) && !nextSkipped.has(c));
    if (wrap !== undefined) {
      setCharHistory((h) => [...h, afterChar]);
      setCurrentChar(wrap);
      return;
    }
    // All done — push afterChar so Back from the all-done panel returns here,
    // then clear currentChar so the all-done panel (with its Done button) shows.
    setCharHistory((h) => [...h, afterChar]);
    setCurrentChar(null);
  }

  // ---------------------------------------------------------------------------
  // Suggestion card handlers
  // ---------------------------------------------------------------------------

  const handleSuggestionAccept = useCallback(() => {
    if (currentChar === null) return;
    const assignment: TouchAssignment = {
      scope: "individual",
      target: currentChar,
      modality: "touch",
      mechanisms: [{ patternId: "touch_inherited" }],
      source: "user",
    };
    const next = new Map(charTouch);
    next.set(currentChar, assignment);
    setCharTouch(next);
    setSuggestionDismissed(true);
    setAppliedForCurrentChar(true);
    advanceToNext(currentChar, next, skippedChars);
  // inventory is included so the handler re-captures the latest advanceToNext
  // (which closes over inventory) if the confirmed inventory ever changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChar, charTouch, skippedChars, inventory]);

  // Accept the suggestion: build the suggested assignment and apply it
  // immediately, then advance to the next character. If no host key could be
  // derived, fall back to opening the chooser pre-filled at the suggested
  // method so the user can pick a key.
  const handleUseSuggestion = useCallback(() => {
    if (currentChar === null) return;
    if (suggestion.kind !== "longpress" && suggestion.kind !== "replace") {
      setSuggestionDismissed(true);
      return;
    }
    const nextMethod: TouchMethod =
      suggestion.kind === "longpress" ? "longpress_alternates" : "touch_key_replace";
    const hk = suggestion.hostKey;
    if (hk === "") {
      setMethod(nextMethod);
      setHostKey("");
      setFlickDirection("");
      setSuggestionDismissed(true);
      return;
    }
    const assignment: TouchAssignment = {
      scope: "individual",
      target: currentChar,
      modality: "touch",
      mechanisms: [{ patternId: nextMethod, slotValues: { hostKey: hk, char: currentChar } }],
      source: "user",
    };
    const next = new Map(charTouch);
    next.set(currentChar, assignment);
    setCharTouch(next);
    setSuggestionDismissed(true);
    setAppliedForCurrentChar(true);
    advanceToNext(currentChar, next, skippedChars);
  // inventory is included so the handler re-captures the latest advanceToNext
  // (which closes over inventory) if the confirmed inventory ever changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion, currentChar, charTouch, skippedChars, inventory]);

  const handleSuggestionChange = useCallback(() => {
    setSuggestionDismissed(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Apply / Next / Skip handlers
  // ---------------------------------------------------------------------------

  const handleApply = useCallback(() => {
    if (currentChar === null || !canApply) return;
    const assignment = buildTouchAssignment(currentChar);
    const next = new Map(charTouch);
    next.set(currentChar, assignment);
    setCharTouch(next);
    setAppliedForCurrentChar(true);
    // spec-014 FR-014/R4: a manual edit to the host touch key PROMOTES it to
    // `hand-set` in the working IR so subsequent re-propagation never clobbers
    // the author's edit. Flag-gated — off ⇒ byte-identical to P4b (no IR write).
    // Logic lives in touchBehavior.ts; this call site stays thin.
    if (isMutateSeamEnabled() && hostKey !== "") {
      const store = useWorkingCopyStore.getState();
      const ir = store.ir;
      // INCREMENTAL patch (promote host key to hand-set) — use the
      // overlay-preserving setter so carve deletions are not wiped. setIR would
      // clear deletedNodeIds/deletedItemIds/undoStack. See workingCopyStore.
      if (ir !== null) store.setWorkingIR(promoteOnManualEdit(ir, hostKey));
    }
    // Reset method inputs but stay on currentChar — user must click Next to advance.
    setMethod("longpress_alternates");
    setHostKey("");
    setFlickDirection("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChar, canApply, method, hostKey, flickDirection, charTouch]);

  const handleNext = useCallback(() => {
    if (currentChar === null) return;
    advanceToNext(currentChar, charTouch, skippedChars);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChar, charTouch, skippedChars, inventory]);

  const handleSkip = useCallback(() => {
    if (currentChar === null) return;
    const skippedFrom = currentChar;
    const next = new Set([...skippedChars, currentChar]);
    setSkippedChars(next);
    const idx = inventory.indexOf(currentChar);
    const after = inventory
      .slice(idx + 1)
      .find((c) => !charTouch.has(c) && !next.has(c) && c !== currentChar);
    if (after !== undefined) {
      setCharHistory((h) => [...h, skippedFrom]);
      setCurrentChar(after);
      return;
    }
    const wrap = inventory
      .slice(0, idx)
      .find((c) => !charTouch.has(c) && !next.has(c) && c !== currentChar);
    if (wrap !== undefined) {
      setCharHistory((h) => [...h, skippedFrom]);
      setCurrentChar(wrap);
      return;
    }
    setCharHistory((h) => [...h, skippedFrom]);
    setCurrentChar(null);
  }, [currentChar, inventory, charTouch, skippedChars]);

  // Back handler — pops the history stack to return to the previous character.
  // When history is empty (first character or empty-inventory guard) calls onBack
  // to return to Phase C (locked/read-only; no unlock is performed).
  const handleBack = useCallback(() => {
    if (charHistory.length === 0) {
      onBack();
      return;
    }
    const prev = charHistory[charHistory.length - 1] ?? null;
    setCharHistory((h) => h.slice(0, -1));
    setCurrentChar(prev);
  }, [charHistory, onBack]);

  const handleRemoveConfigured = useCallback((char: string) => {
    setCharTouch((prev) => {
      const next = new Map(prev);
      next.delete(char);
      return next;
    });
  }, []);

  // Tap-to-select routing: when a valid host-key-capable method is active and
  // the user taps a key in the OSK preview, route that key id to the host key
  // selector. Ignored for touch_inherited (no host key concept).
  const handleKeyTap = useCallback(
    (keyId: string) => {
      if (!VALID_HOST_KEYS.has(keyId)) return;
      if (
        method === "longpress_alternates" ||
        method === "flick_gestures" ||
        method === "multitap" ||
        method === "touch_key_replace"
      ) {
        setHostKey(keyId);
      }
    },
    [method],
  );

  // ---------------------------------------------------------------------------
  // onComplete — emit only explicitly-configured characters
  // ---------------------------------------------------------------------------

  const handleContinue = useCallback(() => {
    // Emit only chars where a real (non-inherited) or inherited assignment was
    // explicitly accepted — everything in charTouch was put there by the user.
    const assignments: TouchAssignment[] = [...charTouch.values()].filter(
      (a) => a.mechanisms[0]?.patternId !== "touch_inherited",
    );
    onComplete(assignments);
  }, [charTouch, onComplete]);

  // Projected VFS for lint — clones baseVfs and overwrites the touch layout path
  // with the same touchLayoutJson the preview uses (lint, preview, output agree).
  // When touchLayoutJson is null (baseIr not yet set) lint sees the raw baseVfs.
  // keyboardId in deps so the path key stays correct if the id changes.
  const editedVfsForLint = useMemo(() => {
    if (baseVfs === null) return null;
    if (touchLayoutJson === null || keyboardId === null) return baseVfs;
    const cloned = createVirtualFS(baseVfs.entries());
    cloned.set(`source/${keyboardId}.keyman-touch-layout`, touchLayoutJson);
    return cloned;
  }, [baseVfs, touchLayoutJson, keyboardId]);

  // Touch lint — runs on the projected (edited) VFS so checks 18.1–18.5 reflect
  // Phase E edits. The existing 300ms debounce inside useTouchLint is unchanged.
  const { touchFindings, touchLintRunning } = useTouchLint(editedVfsForLint, keyboardId);

  // ---------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------

  const totalChars = inventory.length;
  const currentCharIndex = currentChar !== null ? inventory.indexOf(currentChar) : -1;

  // When there is no suggestion to offer for the current character, skip the
  // suggestion card entirely and show the method chooser directly. Otherwise the
  // chooser appears once the suggestion is accepted or dismissed.
  const showChooser = suggestionDismissed || suggestion.kind === "none";

  return {
    baseKeyboard,
    inventory,
    showIntro,
    setShowIntro,
    markGalleryIntroSeen,
    charTouch,
    skippedChars,
    charHistory,
    currentChar,
    isDone,
    suggestion,
    method,
    setMethod,
    hostKey,
    setHostKey,
    flickDirection,
    setFlickDirection,
    suggestionDismissed,
    appliedForCurrentChar,
    canApply,
    handleSuggestionAccept,
    handleUseSuggestion,
    handleSuggestionChange,
    handleApply,
    handleNext,
    handleSkip,
    handleBack,
    handleRemoveConfigured,
    handleKeyTap,
    handleContinue,
    stage,
    retry,
    touchFindings,
    touchLintRunning,
    totalChars,
    currentCharIndex,
    showChooser,
  };
}
