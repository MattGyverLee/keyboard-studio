// MechanismGallery — Phase C "add a key" flow (two-pane redesign).
//
// This file is now a thin wrapper. All hook logic lives in physicalBehavior.ts;
// the chrome (header + two-pane layout) lives in AssignLoopShell.tsx.
//
// On first entry a brief intro splash orients the author to the desktop
// authoring flow; "Get started" dismisses it for the rest of the working-copy
// session (persisted via the galleryIntrosSeen store flag).
//
// LEFT pane: one-character-at-a-time assignment loop.
//   - Walks lettersToAdd in order; the first uncovered+unskipped char is current.
//   - Offers up to four methods:
//       S-03 (sequence) — always shown
//       S-02 (deadkey)  — only for decomposable accented letters
//       S-01 (swap)     — always shown; user picks a physical key
//       S-08 (ralt)     — always shown; user picks a base key for RAlt+key
//   - "Add key" records a MechanismAssignment(scope:"individual") and auto-advances.
//   - "Skip" advances without recording (skipped chars count toward Done gate).
//   - Done when every char in lettersToAdd is either covered or skipped.
//
// RIGHT pane: GalleryPreviewWithPatterns — live OSK preview, unchanged.
//
// Contract shapes: see packages/contracts/src/assignmentMap.ts
// Pattern IDs/strategyIds: multi_char_sequence (S-03),
//                           deadkey_single_tap (S-02),
//                           simple_swap (S-01),
//                           modifier_as_layer_switch (S-08)
// (must match the `id:` fields in content/patterns/ — see PATTERN_* constants)

import { type CSSProperties } from "react";
import type { BaseKeyboard, PlacementMap } from "@keyboard-studio/contracts";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { KEY_OPTIONS } from "../../lib/keyOptions.ts";
import { GalleryPreviewPane } from "./PreviewPane.tsx";
import { GalleryIntroSplash } from "./IntroSplash.tsx";
import {
  BG_PAGE, BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION, ACCENT,
} from "../../lib/galleryTheme.ts";
import { AssignLoopShell } from "./AssignLoopShell.tsx";
import {
  usePhysicalAssignLoop,
  methodLabel,
  DEADKEY_OPTIONS,
  type Method,
} from "./physicalBehavior.ts";

// ---------------------------------------------------------------------------
// Re-export PATTERN_* constants so MechanismGallery.test.tsx can import them
// from this file (the test does:
//   import { MechanismGallery, PATTERN_SEQUENCE, PATTERN_DEADKEY } from "./MechanismGallery.tsx"
// )
// ---------------------------------------------------------------------------
export {
  PATTERN_SEQUENCE,
  PATTERN_DEADKEY,
  PATTERN_SWAP,
  PATTERN_RALT,
} from "./physicalBehavior.ts";

// ---------------------------------------------------------------------------
// MethodChooser — S-03 / S-02 / S-01 / S-08 single-card selection + inline config
// ---------------------------------------------------------------------------

interface MethodChooserProps {
  currentChar: string;
  method: Method;
  onMethodChange: (m: Method) => void;
  seqFirst: string;
  seqSecond: string;
  onSeqFirstChange: (v: string) => void;
  onSeqSecondChange: (v: string) => void;
  triggerKey: string;
  onTriggerKeyChange: (v: string) => void;
  deadkeyBaseLetter: string;
  onDeadkeyBaseLetterChange: (v: string) => void;
  selectedSwapKey: string;
  onSwapKeyChange: (v: string) => void;
  selectedRaltKey: string;
  onRaltKeyChange: (v: string) => void;
}

const selectStyle: CSSProperties = {
  background: BG_PAGE,
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  color: TEXT_MAIN,
  fontSize: 12,
  padding: "4px 8px",
  fontFamily: FONT,
};

function MethodChooser({
  currentChar,
  method,
  onMethodChange,
  seqFirst,
  seqSecond,
  onSeqFirstChange,
  onSeqSecondChange,
  triggerKey,
  onTriggerKeyChange,
  deadkeyBaseLetter,
  onDeadkeyBaseLetterChange,
  selectedSwapKey,
  onSwapKeyChange,
  selectedRaltKey,
  onRaltKeyChange,
}: MethodChooserProps) {

  // Each method is one card: transparent header button + inline config when selected.
  const cardStyle = (active: boolean): CSSProperties => ({
    borderRadius: 8,
    border: `1px solid ${active ? ACCENT : BORDER}`,
    background: active ? "#0d2840" : BG_PAGE,
    overflow: "hidden",
    transition: "border-color 120ms ease, background 120ms ease",
  });

  const headerBtnStyle: CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    background: "transparent",
    border: "none",
    color: TEXT_MAIN,
    fontSize: 13,
    fontFamily: FONT,
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  };

  const configStyle: CSSProperties = {
    padding: "0 14px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };

  const inputStyle: CSSProperties = {
    width: 52,
    padding: "6px 8px",
    background: BG_PAGE,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    color: TEXT_MAIN,
    fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
    fontSize: 20,
    textAlign: "center",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
        How to type it:
      </p>

      {/* S-03 — always shown */}
      <div style={cardStyle(method === "sequence")}>
        <button
          type="button"
          aria-pressed={method === "sequence"}
          onClick={() => onMethodChange("sequence")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "sequence" ? ACCENT : TEXT_MAIN }}>
            Type a sequence
          </span>
          {method !== "sequence" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Two keys in a row produce {currentChar}
            </span>
          )}
        </button>
        {method === "sequence" && (
          <div style={configStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
                Type these two keys:
              </span>
              <input
                type="text"
                value={seqFirst}
                onChange={(e) => onSeqFirstChange(e.target.value)}
                aria-label="First key in sequence"
                maxLength={2}
                style={inputStyle}
              />
              <span style={{ color: TEXT_DIM, fontSize: 13, fontFamily: FONT }}>then</span>
              <input
                type="text"
                value={seqSecond}
                onChange={(e) => onSeqSecondChange(e.target.value)}
                aria-label="Second key in sequence"
                maxLength={2}
                style={inputStyle}
              />
              <span style={{ color: TEXT_DIM, fontSize: 13, fontFamily: FONT }}>
                &rarr;{" "}
                <span style={{ color: TEXT_MAIN, fontFamily: "monospace", fontSize: 16 }}>
                  {currentChar}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* S-02 — always shown */}
      <div style={cardStyle(method === "deadkey")}>
        <button
          type="button"
          aria-pressed={method === "deadkey"}
          onClick={() => onMethodChange("deadkey")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "deadkey" ? ACCENT : TEXT_MAIN }}>
            Tap a trigger key, then a letter
          </span>
          {method !== "deadkey" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Trigger &rarr;{" "}
              {deadkeyBaseLetter || "[base]"} &rarr;{" "}
              {currentChar}
            </span>
          )}
        </button>
        {method === "deadkey" && (
          <div style={configStyle}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: TEXT_DIM,
                fontFamily: FONT,
              }}
            >
              Trigger key:
              <select
                value={triggerKey}
                onChange={(e) => onTriggerKeyChange(e.target.value)}
                aria-label="Trigger key for deadkey"
                style={selectStyle}
              >
                {DEADKEY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: TEXT_DIM,
                fontFamily: FONT,
              }}
            >
              Base letter:
              <input
                type="text"
                value={deadkeyBaseLetter}
                onChange={(e) => onDeadkeyBaseLetterChange(e.target.value)}
                aria-label="Base letter for deadkey"
                maxLength={2}
                style={inputStyle}
              />
            </label>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
              Press {triggerKey}, then{" "}
              {deadkeyBaseLetter || "[base letter]"} &rarr;{" "}
              <span style={{ fontFamily: "monospace", color: TEXT_MAIN, fontSize: 16 }}>{currentChar}</span>
            </p>
          </div>
        )}
      </div>

      {/* S-01 — always shown */}
      <div style={cardStyle(method === "swap")}>
        <button
          type="button"
          aria-pressed={method === "swap"}
          onClick={() => onMethodChange("swap")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "swap" ? ACCENT : TEXT_MAIN }}>
            Assign to a key
          </span>
          {method !== "swap" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Dedicate one physical key to produce {currentChar}
            </span>
          )}
        </button>
        {method === "swap" && (
          <div style={configStyle}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: TEXT_DIM,
                fontFamily: FONT,
              }}
            >
              Key:
              <select
                value={selectedSwapKey}
                onChange={(e) => onSwapKeyChange(e.target.value)}
                aria-label="Physical key for simple swap"
                style={selectStyle}
              >
                {KEY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {/* S-08 — always shown */}
      <div style={cardStyle(method === "ralt")}>
        <button
          type="button"
          aria-pressed={method === "ralt"}
          onClick={() => onMethodChange("ralt")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "ralt" ? ACCENT : TEXT_MAIN }}>
            RAlt + key
          </span>
          {method !== "ralt" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Hold RAlt and press a base key to get {currentChar}
            </span>
          )}
        </button>
        {method === "ralt" && (
          <div style={configStyle}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: TEXT_DIM,
                fontFamily: FONT,
              }}
            >
              Base key:
              <select
                value={selectedRaltKey}
                onChange={(e) => onRaltKeyChange(e.target.value)}
                aria-label="Base key for RAlt layer"
                style={selectStyle}
              >
                {KEY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <p style={{ margin: 0, fontSize: 11, color: "#d29922", fontFamily: FONT }}>
              Note: RAlt may conflict with system shortcuts on macOS.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MechanismGalleryProps (re-exported for adapters that mount this component)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// MechanismGallery — main component (thin wrapper)
// ---------------------------------------------------------------------------

export function MechanismGallery({
  selectedBaseKeyboard,
  onComplete,
  onBack,
  placementMap,
}: MechanismGalleryProps) {
  const state = usePhysicalAssignLoop({
    selectedBaseKeyboard,
    ...(onComplete !== undefined ? { onComplete } : {}),
    ...(onBack !== undefined ? { onBack } : {}),
    ...(placementMap !== undefined ? { placementMap } : {}),
  });

  const {
    locked,
    inventory,
    showIntro,
    setShowIntro,
    markGalleryIntroSeen,
    lettersToAdd,
    currentChar,
    isDone,
    coveredChars,
    skippedChars: _skippedChars,
    coveredCount,
    sessionAssignments,
    loading,
    loadError,
    artifactStage,
    artifactRetry,
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
    suggestion,
    suggestionDismissed,
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
  } = state;

  // ---------------------------------------------------------------------------
  // Shared styles
  // ---------------------------------------------------------------------------

  const pageStyle = {
    background: BG_PAGE,
    height: "100%",
    boxSizing: "border-box" as const,
    fontFamily: FONT,
    color: TEXT_MAIN,
  };

  const ghostBtn: CSSProperties = {
    padding: "8px 18px",
    background: "transparent",
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    color: TEXT_DIM,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  // ---------------------------------------------------------------------------
  // Guard: no base keyboard
  // ---------------------------------------------------------------------------

  if (selectedBaseKeyboard === null) {
    return (
      <div style={pageStyle}>
        <div
          style={{
            maxWidth: 560,
            margin: "60px auto",
            textAlign: "center",
            color: TEXT_DIM,
            padding: "0 24px",
          }}
        >
          <p style={{ fontSize: 15 }}>
            No base keyboard selected. Go back to choose a starting point.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Guard: no inventory
  // ---------------------------------------------------------------------------

  if (inventory.length === 0) {
    return (
      <div style={{ ...pageStyle, padding: "24px 32px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          {onBack !== undefined && (
            <button type="button" onClick={onBack} style={ghostBtn}>
              &larr; Back
            </button>
          )}
          <div
            style={{
              maxWidth: 560,
              margin: "60px auto",
              textAlign: "center",
              color: TEXT_DIM,
            }}
          >
            <p style={{ fontSize: 15 }}>
              No inventory confirmed yet. Complete the Survey (Phase B) to
              confirm which characters your keyboard must produce.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Intro splash — first entry to the desktop mechanism gallery only
  // ---------------------------------------------------------------------------

  if (showIntro) {
    return (
      <GalleryIntroSplash
        eyebrow="Getting started · Desktop"
        title="Welcome to the Mechanism Gallery"
        body={
          <>
            This is where you build your keyboard. For each character your
            language needs that the base layout doesn&rsquo;t already have,
            you&rsquo;ll choose how to type it on a physical (desktop) keyboard.
          </>
        }
        bullets={[
          <>You&rsquo;ll go character by character through the list from your survey.</>,
          <>
            Pick a method &mdash; type a sequence, use a dead key, swap a key, or
            use AltGr &mdash; or Skip characters you don&rsquo;t need.
          </>,
          <>Phones and tablets come later, in the Touch gallery.</>,
        ]}
        startAriaLabel="Start the mechanism gallery"
        onStart={() => {
          markGalleryIntroSeen("mechanism");
          setShowIntro(false);
        }}
        {...(onBack !== undefined ? { onBack } : {})}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Left pane body — built here, passed to AssignLoopShell as renderLeft
  // ---------------------------------------------------------------------------

  const renderLeft = () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: "24px 20px",
        overflowY: "auto",
        boxSizing: "border-box",
        height: "100%",
      }}
    >
      {locked && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            padding: "10px 14px",
            background: "#1a1209",
            border: "1px solid #d29922",
            borderRadius: 6,
            color: "#d29922",
            fontSize: 13,
            fontFamily: FONT,
          }}
        >
          Desktop layout locked — editing disabled
        </div>
      )}
      <>
          {/* Small coverage line */}
          {lettersToAdd.length > 0 && (
            <p
              role="status"
              aria-live="polite"
              aria-label={`${coveredCount} of ${lettersToAdd.length} added`}
              style={{
                margin: 0,
                fontSize: 12,
                color: TEXT_DIM,
                fontFamily: FONT,
              }}
            >
              {coveredCount} of {lettersToAdd.length} added
            </p>
          )}

          {/* Back button */}
          {onBack !== undefined && !isDone && (
            <button
              type="button"
              onClick={onBack}
              style={{ ...ghostBtn, alignSelf: "flex-start", fontSize: 13 }}
            >
              &larr; Back
            </button>
          )}

          {/* Locked — always show a forward escape so the user cannot be trapped
              after navigating back from Phase E. Editing is disabled by locked but
              onComplete is always callable. */}
          {locked && onComplete !== undefined && (
            <button
              type="button"
              onClick={onComplete}
              aria-label="Continue to touch layout (desktop layout locked)"
              style={{
                padding: "9px 20px",
                background: BLUE_ACTION,
                border: "none",
                borderRadius: 6,
                color: "#e6edf3",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: FONT,
                alignSelf: "flex-start",
              }}
            >
              Continue to touch layout &rarr;
            </button>
          )}

          {/* All-done / empty states */}
          {lettersToAdd.length === 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                color: TEXT_DIM,
              }}
            >
              <p style={{ margin: 0, fontSize: 14 }}>
                No new characters to add.
              </p>
              <button
                type="button"
                onClick={onComplete}
                style={{
                  padding: "10px 24px",
                  background: BLUE_ACTION,
                  border: "none",
                  borderRadius: 6,
                  color: "#e6edf3",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: FONT,
                  alignSelf: "flex-start",
                }}
              >
                Done
              </button>
            </div>
          )}

          {lettersToAdd.length > 0 && isDone && currentChar === null && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ margin: 0, fontSize: 14, color: TEXT_DIM }}>
                All keys added.
              </p>
              <button
                type="button"
                onClick={onComplete}
                style={{
                  padding: "10px 24px",
                  background: BLUE_ACTION,
                  border: "none",
                  borderRadius: 6,
                  color: "#e6edf3",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: FONT,
                  alignSelf: "flex-start",
                }}
              >
                Done
              </button>
            </div>
          )}

          {/* Per-char UI */}
          {currentChar !== null && (
            <>
              {/* Character heading */}
              <div
                style={{
                  background: BG_CARD,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  padding: "16px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: TEXT_DIM,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Add a key
                </p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span
                    style={{ fontSize: 36, fontFamily: "monospace", lineHeight: 1 }}
                    aria-label={`${toUPlusNotation(currentChar)} ${currentChar}`}
                  >
                    {currentChar}
                  </span>
                  <span style={{ fontSize: 13, color: TEXT_DIM }}>
                    {toUPlusNotation(currentChar)}
                  </span>
                </div>
              </div>

              {/* kbgen suggestion row — shown above method chooser when a
                  qualifying placement candidate exists and hasn't been dismissed.
                  [Accept] pre-fills method + key picker; [Change] dismisses the
                  row so the author can select manually. No kbgen data => null =>
                  row is absent and gallery behaves exactly as today. */}
              {suggestion !== null && !suggestionDismissed && (
                <div
                  role="note"
                  aria-label="Placement suggestion from kbgen seeder"
                  style={{
                    background: "#0d2218",
                    border: "1px solid #238636",
                    borderRadius: 8,
                    padding: "10px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "#56d364",
                      fontFamily: FONT,
                      fontWeight: 600,
                    }}
                  >
                    {(() => {
                      const keyName = suggestion.topCandidate.vkey.replace(/^K_/, "");
                      return suggestion.strategyId === "S-01"
                        ? `Suggested: Replace ${keyName} with ${currentChar ?? ""}`
                        : `Suggested: Right Alt + ${keyName} for ${currentChar ?? ""}`;
                    })()}
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={handleSuggestionAccept}
                      aria-label={
                        suggestion.strategyId === "S-01"
                          ? `Accept suggestion: assign ${currentChar} to ${suggestion.topCandidate.vkey}`
                          : `Accept suggestion: RAlt + ${suggestion.topCandidate.vkey} for ${currentChar}`
                      }
                      style={{
                        padding: "5px 14px",
                        background: "#238636",
                        border: "none",
                        borderRadius: 5,
                        color: "#e6edf3",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: FONT,
                      }}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={handleSuggestionChange}
                      aria-label="Deny suggestion and choose method manually"
                      style={{
                        padding: "5px 14px",
                        background: "transparent",
                        border: `1px solid ${BORDER}`,
                        borderRadius: 5,
                        color: TEXT_DIM,
                        fontSize: 12,
                        cursor: "pointer",
                        fontFamily: FONT,
                      }}
                    >
                      Deny
                    </button>
                  </div>
                </div>
              )}

              {/* Method chooser */}
              <MethodChooser
                currentChar={currentChar}
                method={method}
                onMethodChange={setMethod}
                seqFirst={seqFirst}
                seqSecond={seqSecond}
                onSeqFirstChange={setSeqFirst}
                onSeqSecondChange={setSeqSecond}
                triggerKey={triggerKey}
                onTriggerKeyChange={setTriggerKey}
                deadkeyBaseLetter={deadkeyBaseLetter}
                onDeadkeyBaseLetterChange={setDeadkeyBaseLetter}
                selectedSwapKey={selectedSwapKey}
                onSwapKeyChange={setSelectedSwapKey}
                selectedRaltKey={selectedRaltKey}
                onRaltKeyChange={setSelectedRaltKey}
              />

              {/* Apply + Next + Skip actions */}
              {appliedForCurrentChar > 0 && (
                <p style={{ margin: 0, fontSize: 12, color: "#56d364", fontFamily: FONT }}>
                  {appliedForCurrentChar} method{appliedForCurrentChar !== 1 ? "s" : ""} applied
                </p>
              )}
              {appliedForCurrentChar > 0 && (
                <div
                  role="group"
                  aria-label="Applied methods — click to remove"
                  style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}
                >
                  {sessionAssignments
                    .filter((a) => a.scope === "individual" && a.target === currentChar)
                    .map((a, i) => {
                      const ref = a.mechanisms[0];
                      const label = ref !== undefined ? methodLabel(ref) : a.mechanisms.map(methodLabel).join(", ");
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleRemoveMechanism(a)}
                          disabled={locked}
                          aria-label={`Remove method ${label} for ${currentChar}`}
                          title="click to remove"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "3px 8px",
                            background: "#0d2218",
                            border: "1px solid #238636",
                            borderRadius: 12,
                            color: "#56d364",
                            fontSize: 11,
                            fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
                            cursor: locked ? "not-allowed" : "pointer",
                          }}
                        >
                          {label}
                          <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.7 }}>
                            {" ×"}
                          </span>
                        </button>
                      );
                    })}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {canGoBack && (
                  <button
                    type="button"
                    onClick={handleBack}
                    aria-label="Go back to previous character"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: TEXT_DIM,
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: FONT,
                      padding: "4px 8px",
                      textDecoration: "underline",
                    }}
                  >
                    &larr; Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!canApply || locked}
                  aria-label={`Apply method for ${currentChar}`}
                  style={{
                    padding: "9px 20px",
                    background: canApply ? BLUE_ACTION : "#21262d",
                    border: "none",
                    borderRadius: 6,
                    color: canApply ? "#e6edf3" : TEXT_DIM,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: canApply ? "pointer" : "not-allowed",
                    fontFamily: FONT,
                  }}
                >
                  Apply method
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canGoNext || locked}
                  aria-label={
                    isDone && canGoNext
                      ? "All methods applied, finish"
                      : `Next character`
                  }
                  style={{
                    padding: "9px 20px",
                    background: canGoNext ? "#238636" : "#21262d",
                    border: "none",
                    borderRadius: 6,
                    color: canGoNext ? "#e6edf3" : TEXT_DIM,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: canGoNext ? "pointer" : "not-allowed",
                    fontFamily: FONT,
                  }}
                >
                  {isDone && canGoNext ? "All done →" : "Next character →"}
                </button>
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={locked}
                  aria-label={`Skip ${currentChar}`}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: TEXT_DIM,
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: FONT,
                    padding: "4px 8px",
                    textDecoration: "underline",
                  }}
                >
                  Skip
                </button>
              </div>
            </>
          )}

          {/* Added chip row — characters already configured, removable */}
          {coveredChars.size > 0 && (
            <div>
              <p
                style={{
                  margin: "0 0 6px",
                  fontSize: 11,
                  color: TEXT_DIM,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Added
              </p>
              <div
                role="group"
                aria-label="Added characters — click to remove"
                style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
              >
                {[...coveredChars].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleRemoveCovered(c)}
                    aria-label={`Remove ${toUPlusNotation(c)} ${c}`}
                    title={`${toUPlusNotation(c)} — click to remove`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "4px 8px",
                      background: "#0d2218",
                      border: "1px solid #238636",
                      borderRadius: 16,
                      color: "#56d364",
                      fontSize: 13,
                      fontFamily: "monospace",
                      cursor: "pointer",
                      lineHeight: 1.3,
                    }}
                  >
                    {c}
                    <span
                      aria-hidden="true"
                      style={{ fontSize: 11, color: "#56d364", opacity: 0.7 }}
                    >
                      &times;
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
      </>

      {/* Load error for patterns (non-blocking; preview won't show transform) */}
      {loadError !== null && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: "10px 14px",
            background: "#2a0a0a",
            border: "1px solid #f85149",
            borderRadius: 6,
            color: "#f85149",
            fontSize: 12,
            fontFamily: FONT,
          }}
        >
          Pattern load error — preview transform may be incomplete.
          <br />
          <span style={{ fontSize: 11, color: TEXT_DIM }}>{loadError}</span>
        </div>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Two-pane layout via AssignLoopShell
  // ---------------------------------------------------------------------------

  return (
    <AssignLoopShell
      title="Mechanism Gallery"
      surfaceLabel="Desktop"
      surfaceLabelInsideHeading={false}
      renderLeft={renderLeft}
      previewPane={
        <GalleryPreviewPane
          baseKeyboard={selectedBaseKeyboard}
          stage={artifactStage}
          retry={artifactRetry}
          {...(handleKeyTap !== undefined ? { onKeyTap: handleKeyTap } : {})}
          defaultOskMode="desktop"
          heading="Live preview"
          warningLabel="Apply warnings:"
        />
      }
      previewLoading={loading}
      loadError={loadError}
    />
  );
}
