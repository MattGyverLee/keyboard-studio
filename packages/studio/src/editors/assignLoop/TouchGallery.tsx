// TouchGallery — Phase E "touch mechanisms" flow (character-by-character redesign).
//
// This file is now a thin wrapper. All hook logic lives in touchBehavior.ts
// (useTouchAssignLoop); the chrome (header + two-pane layout) lives in the
// shared AssignLoopShell.tsx, which MechanismGallery consumes too.
//
// Mirrors MechanismGallery's character-by-character loop — adapted for touch
// modality assignments instead of physical key assignments.
//
// On first entry a brief intro splash explains the move from the desktop
// (physical) gallery to touch; "Get started" dismisses it for the rest of the
// working-copy session.
//
// LEFT pane: one-character-at-a-time iteration over session.confirmedInventory.
//   - When a suggestion applies (long-press / replace / "already in layout"),
//     shows a suggestion card: Accept applies it and advances; Deny shows the
//     method chooser. When there is no suggestion, the method chooser is shown
//     directly (no intermediate card).
//   - Method chooser offers 4 expandable cards (longpress, flick, multitap,
//     replace). "Apply method" + "Next character →" + "Skip" follow
//     MechanismGallery's pattern. There is no manual "already in layout" card:
//     the auto-detected "already" suggestion records inherited characters, and
//     Skip moves on without an assignment.
//   - Done when every character has been either configured or skipped.
//   - Desktop edits are NOT transferred to mobile — the touch layout is
//     seeded from a fixed minimal QWERTY layout, not derived from IR rules.
//
// RIGHT pane: live phone-mode OSK preview.
//   - useKeyboardArtifact + OSKFrame wiring. Runs exclusively in touch mode.
//   - VFS transform injects a minimal hardcoded phone layout when the keyboard
//     has no existing .keyman-touch-layout; existing touch files are left as-is.
//   - "Touch preview" label matches MechanismGallery's "Live preview" label style.
//
// Touch lint (Layer C checks 18.1–18.5) stays below the character cards,
// same position as before.
//
// Single 300 ms debounce contract upheld — no second timer introduced.

import { type CSSProperties } from "react";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { LintSummary } from "../../lint/index.ts";
import { GalleryPreviewPane } from "./PreviewPane.tsx";
import { GalleryIntroSplash } from "./IntroSplash.tsx";
import { KEY_OPTIONS } from "../../lib/keyOptions.ts";
import {
  BG_PAGE, BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION,
} from "../../lib/galleryTheme.ts";
import { AssignLoopShell } from "./AssignLoopShell.tsx";
import {
  useTouchAssignLoop,
  type TouchMethod,
} from "./touchBehavior.ts";

// Re-export TouchGalleryProps so existing importers (tests, adapters) keep working.
export type { TouchGalleryProps } from "./touchBehavior.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip K_ prefix from a key id for user-facing display. */
function hostKeyShortLabel(keyId: string): string {
  return keyId.startsWith("K_") ? keyId.slice(2) : keyId;
}

/** Direction code to arrow character. */
function dirArrow(dir: string): string {
  if (dir === "n") return "↑"; // up
  if (dir === "s") return "↓"; // down
  if (dir === "e") return "→"; // right
  if (dir === "w") return "←"; // left
  return dir;
}

/** Produce a human-readable label for a configured TouchAssignment chip. */
import type { TouchAssignment } from "@keyboard-studio/contracts";
function touchMethodLabel(a: TouchAssignment): string {
  const m = a.mechanisms[0];
  if (!m) return a.target;
  const patternId = m.patternId;
  const sv = m.slotValues ?? {};
  const hkShort = sv["hostKey"] ? hostKeyShortLabel(sv["hostKey"]) : "";
  if (patternId === "touch_inherited") return `${a.target} · inherited`;
  if (patternId === "longpress_alternates") return `${a.target} · long-press ${hkShort}`;
  if (patternId === "flick_gestures") {
    const dir = sv["direction"] ?? "";
    return `${a.target} · flick ${hkShort} ${dirArrow(dir)}`.trimEnd();
  }
  if (patternId === "multitap") return `${a.target} · multitap ${hkShort}`;
  if (patternId === "touch_key_replace") return `${a.target} · replace ${hkShort}`;
  return a.target;
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

// ---------------------------------------------------------------------------
// Touch method type
// ---------------------------------------------------------------------------

// Re-export from touchBehavior for consumers in this module scope.
export type { TouchMethod };

// ---------------------------------------------------------------------------
// TouchMethodChooser — 4 expandable cards
// ---------------------------------------------------------------------------

interface TouchMethodChooserProps {
  currentChar: string;
  method: TouchMethod;
  onMethodChange: (m: TouchMethod) => void;
  hostKey: string;
  onHostKeyChange: (v: string) => void;
  flickDirection: string;
  onFlickDirectionChange: (v: string) => void;
}

const FLICK_DIRECTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "",  label: "-- choose direction --" },
  { value: "n", label: "Up (north)" },
  { value: "s", label: "Down (south)" },
  { value: "e", label: "Right (east)" },
  { value: "w", label: "Left (west)" },
];

function TouchMethodChooser({
  currentChar,
  method,
  onMethodChange,
  hostKey,
  onHostKeyChange,
  flickDirection,
  onFlickDirectionChange,
}: TouchMethodChooserProps) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
        How to reach it on touch:
      </p>

      {/* 1. Long-press on a key */}
      <div style={cardStyle(method === "longpress_alternates")}>
        <button
          type="button"
          aria-pressed={method === "longpress_alternates"}
          onClick={() => onMethodChange("longpress_alternates")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "longpress_alternates" ? ACCENT : TEXT_MAIN }}>
            Long-press on a key
          </span>
          {method !== "longpress_alternates" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Hold a key to reveal {currentChar} as a long-press option.
            </span>
          )}
        </button>
        {method === "longpress_alternates" && (
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
              Host key:
              <select
                value={hostKey}
                onChange={(e) => onHostKeyChange(e.target.value)}
                aria-label="Host key for long-press"
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

      {/* 2. Swipe a key (flick) */}
      <div style={cardStyle(method === "flick_gestures")}>
        <button
          type="button"
          aria-pressed={method === "flick_gestures"}
          onClick={() => onMethodChange("flick_gestures")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "flick_gestures" ? ACCENT : TEXT_MAIN }}>
            Swipe a key (flick)
          </span>
          {method !== "flick_gestures" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Swipe a key in a direction to produce {currentChar}.
            </span>
          )}
        </button>
        {method === "flick_gestures" && (
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
              Host key:
              <select
                value={hostKey}
                onChange={(e) => onHostKeyChange(e.target.value)}
                aria-label="Host key for flick"
                style={selectStyle}
              >
                {KEY_OPTIONS.map((o) => (
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
              Direction:
              <select
                value={flickDirection}
                onChange={(e) => onFlickDirectionChange(e.target.value)}
                aria-label="Flick direction"
                style={selectStyle}
              >
                {FLICK_DIRECTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {/* 3. Tap multiple times (multitap) */}
      <div style={cardStyle(method === "multitap")}>
        <button
          type="button"
          aria-pressed={method === "multitap"}
          onClick={() => onMethodChange("multitap")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "multitap" ? ACCENT : TEXT_MAIN }}>
            Tap multiple times (multitap)
          </span>
          {method !== "multitap" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Tap a key rapidly more than once to reach {currentChar}.
            </span>
          )}
        </button>
        {method === "multitap" && (
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
              Host key:
              <select
                value={hostKey}
                onChange={(e) => onHostKeyChange(e.target.value)}
                aria-label="Host key for multitap"
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

      {/* 4. Replace a key */}
      <div style={cardStyle(method === "touch_key_replace")}>
        <button
          type="button"
          aria-pressed={method === "touch_key_replace"}
          onClick={() => onMethodChange("touch_key_replace")}
          style={headerBtnStyle}
        >
          <span style={{ fontWeight: 600, color: method === "touch_key_replace" ? ACCENT : TEXT_MAIN }}>
            Replace a key
          </span>
          {method !== "touch_key_replace" && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              Make a key type {currentChar} directly on the touch keyboard.
            </span>
          )}
        </button>
        {method === "touch_key_replace" && (
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
              Host key:
              <select
                value={hostKey}
                onChange={(e) => onHostKeyChange(e.target.value)}
                aria-label="Host key to replace"
                style={selectStyle}
              >
                {KEY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <p style={{ margin: 0, fontSize: 11, color: TEXT_DIM, fontFamily: FONT }}>
              Make a key type {currentChar} directly on the touch keyboard.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// TouchPreviewPane is now GalleryPreviewPane (shared component) — see GalleryPreviewPane.tsx.

// ---------------------------------------------------------------------------
// TouchGallery — main component (thin wrapper)
// ---------------------------------------------------------------------------

export function TouchGallery({ onComplete, onBack }: { onComplete: (assignments: TouchAssignment[]) => void; onBack: () => void }) {
  const state = useTouchAssignLoop({ onComplete, onBack });

  const {
    baseKeyboard,
    inventory,
    showIntro,
    setShowIntro,
    markGalleryIntroSeen,
    charTouch,
    currentChar,
    isDone,
    suggestion,
    method,
    setMethod,
    hostKey,
    setHostKey,
    flickDirection,
    setFlickDirection,
    suggestionDismissed: _suggestionDismissed,
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
    charHistory,
  } = state;

  // ---------------------------------------------------------------------------
  // Shared styles
  // ---------------------------------------------------------------------------

  const pageStyle: CSSProperties = {
    background: BG_PAGE,
    height: "100%",
    boxSizing: "border-box",
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
  // Guard: no inventory
  // ---------------------------------------------------------------------------

  if (inventory.length === 0) {
    return (
      <div style={{ ...pageStyle, padding: "24px 32px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to mechanisms"
            style={ghostBtn}
          >
            &larr; Back
          </button>
          <div
            style={{
              margin: "60px auto",
              textAlign: "center",
              color: TEXT_DIM,
            }}
          >
            <p style={{ fontSize: 15 }}>
              No characters in inventory yet. Complete the Survey (Phase B) to
              confirm which characters your keyboard must produce.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Intro splash — first entry to the touch gallery only
  // ---------------------------------------------------------------------------

  if (showIntro) {
    return (
      <GalleryIntroSplash
        eyebrow="Next step · Touch"
        title="Welcome to the Touch Gallery"
        body={
          <>
            Your desktop layout is locked in. Now you&rsquo;ll set how each
            character is reached on phones and tablets, where there is no
            physical keyboard.
          </>
        }
        bullets={[
          <>You&rsquo;ll go character by character, just like the desktop gallery.</>,
          <>
            Pick a touch method &mdash; long-press, flick, multitap, or replace
            &mdash; or Skip characters that already work.
          </>,
          <>These choices apply to touch only and never change your desktop layout.</>,
        ]}
        startAriaLabel="Start the touch gallery"
        onStart={() => {
          markGalleryIntroSeen("touch");
          setShowIntro(false);
        }}
        onBack={onBack}
        backAriaLabel="Back to mechanisms (Phase C)"
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Left pane content (verbatim from original TouchGallery.tsx)
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
      {/* Coverage line */}
      <p
        role="status"
        aria-live="polite"
        aria-label={`${charTouch.size} of ${totalChars} characters configured`}
        style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}
      >
        {charTouch.size} of {totalChars} configured
      </p>

      {/* All-done state */}
      {isDone && currentChar === null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, color: TEXT_DIM }}>
            All characters configured for touch.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={handleBack}
              aria-label="Back to previous character"
              style={ghostBtn}
            >
              &larr; Back
            </button>
            <button
              type="button"
              onClick={handleContinue}
              aria-label="Continue to next phase"
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
        </div>
      )}

      {/* Per-char UI */}
      {currentChar !== null && (
        <>
          {/* Character heading card (identical to MechanismGallery's) */}
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
              Touch mapping
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

          {/* Back button — present in both sub-states for consistent placement */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              type="button"
              onClick={handleBack}
              aria-label={
                charHistory.length === 0
                  ? "Back to mechanisms (Phase C)"
                  : "Back to previous character"
              }
              style={ghostBtn}
            >
              &larr; Back
            </button>
          </div>

          {/* Suggestion card (shown until accepted/dismissed; skipped entirely
              when there is no suggestion to offer) */}
          {!showChooser && (
            <div
              role="note"
              aria-label="Touch access method suggestion"
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
              {suggestion.kind === "longpress" && (
                <>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "#56d364",
                      fontFamily: FONT,
                      fontWeight: 600,
                    }}
                  >
                    Suggested: long-press{" "}
                    {suggestion.hostKey ? hostKeyShortLabel(suggestion.hostKey) : "a key"}{" "}
                    to reach {currentChar}
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleUseSuggestion}
                      aria-label={`Use suggested long-press method for ${toUPlusNotation(currentChar)} ${currentChar}`}
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
                      aria-label="Choose a different touch method"
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
                </>
              )}
              {suggestion.kind === "replace" && (
                <>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "#56d364",
                      fontFamily: FONT,
                      fontWeight: 600,
                    }}
                  >
                    Suggested: replace{" "}
                    {suggestion.hostKey ? hostKeyShortLabel(suggestion.hostKey) : "a key"}{" "}
                    with {currentChar}
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleUseSuggestion}
                      aria-label={`Use suggested replace method for ${toUPlusNotation(currentChar)} ${currentChar}`}
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
                      aria-label="Choose a different touch method"
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
                </>
              )}
              {suggestion.kind === "already" && (
                <>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "#56d364",
                      fontFamily: FONT,
                      fontWeight: 600,
                    }}
                  >
                    {currentChar} is already on the touch keyboard. Keep it as is?
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleSuggestionAccept}
                      aria-label={`Keep ${toUPlusNotation(currentChar)} ${currentChar} as already in touch layout`}
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
                      aria-label="Make changes to touch method"
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
                </>
              )}
            </div>
          )}

          {/* Method chooser (shown after the suggestion is accepted/dismissed,
              or immediately when there is no suggestion) */}
          {showChooser && (
            <TouchMethodChooser
              currentChar={currentChar}
              method={method}
              onMethodChange={setMethod}
              hostKey={hostKey}
              onHostKeyChange={setHostKey}
              flickDirection={flickDirection}
              onFlickDirectionChange={setFlickDirection}
            />
          )}

          {/* Apply + Next + Skip button row */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {showChooser && (
              <button
                type="button"
                onClick={handleApply}
                disabled={!canApply}
                aria-label={`Apply touch method for ${toUPlusNotation(currentChar)} ${currentChar}`}
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
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={!appliedForCurrentChar}
              aria-label={
                isDone && appliedForCurrentChar
                  ? "All characters configured, finish"
                  : "Next character"
              }
              style={{
                padding: "9px 20px",
                background: appliedForCurrentChar ? "#238636" : "#21262d",
                border: "none",
                borderRadius: 6,
                color: appliedForCurrentChar ? "#e6edf3" : TEXT_DIM,
                fontSize: 13,
                fontWeight: 600,
                cursor: appliedForCurrentChar ? "pointer" : "not-allowed",
                fontFamily: FONT,
              }}
            >
              {isDone && appliedForCurrentChar ? "All done →" : "Next character →"}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              aria-label={`Skip ${toUPlusNotation(currentChar)} ${currentChar}`}
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

      {/* Configured chip row */}
      {charTouch.size > 0 && (
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
            Configured
          </p>
          <div
            role="group"
            aria-label="Configured characters — click to remove"
            style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
          >
            {[...charTouch.entries()].map(([c, assignment]) => (
              <button
                key={c}
                type="button"
                onClick={() => handleRemoveConfigured(c)}
                aria-label={`Remove ${toUPlusNotation(c)} ${c}`}
                title={`${toUPlusNotation(c)} — click to remove`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  background: "#0d2218",
                  border: "1px solid #238636",
                  borderRadius: 16,
                  color: "#56d364",
                  fontSize: 12,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  lineHeight: 1.3,
                  whiteSpace: "nowrap",
                }}
              >
                {touchMethodLabel(assignment)}
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

      {/* Lint summary — Layer C touch checks (18.1–18.5) */}
      <div>
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 11,
            color: TEXT_DIM,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontFamily: FONT,
          }}
        >
          Touch layout checks
          {touchLintRunning ? " (running...)" : ""}
        </p>
        <LintSummary findings={touchFindings} />
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Two-pane layout via AssignLoopShell
  // ---------------------------------------------------------------------------

  return (
    <AssignLoopShell
      surfaceLabelInsideHeading
      title="Mechanism Gallery"
      surfaceLabel="Touch"
      headerDescription="For each character, choose how it appears on the touch keyboard. Your desktop layout is locked — these apply to phone and tablet only."
      {...(totalChars > 0
        ? {
            charCounter: `Character ${isDone ? totalChars : Math.max(currentCharIndex + 1, 1)} of ${totalChars}`,
          }
        : {})}
      renderLeft={renderLeft}
      previewPane={
        <GalleryPreviewPane
          baseKeyboard={baseKeyboard}
          stage={stage}
          retry={retry}
          {...(handleKeyTap !== undefined ? { onKeyTap: handleKeyTap } : {})}
          defaultOskMode="touch"
          heading="Touch preview"
          warningLabel="Preview warnings:"
        />
      }
      previewLoading={false}
      loadError={null}
    />
  );
}
