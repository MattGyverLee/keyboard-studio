// Sprint-1 Phase A identity renderer — subset of #48.
// Renders the 3 identity questions from phase_a_identity.yaml, calls
// applyIdentityStubMutation() on each answer, shows .kmn diff live.
// Replaced entirely when #238 (scaffold-over-IR) + #48 (full survey) land.

import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { VirtualFS } from "@keyboard-studio/contracts";
import { applyIdentityStubMutation } from "@keyboard-studio/engine";

// ---------------------------------------------------------------------------
// Question definitions — prompts/help lifted verbatim from phase_a_identity.yaml.
// mutatorField: which applyIdentityStubMutation param this answer drives,
//               or null if this question has no .kmn counterpart.
// ---------------------------------------------------------------------------

interface SurveyQuestion {
  id: string;
  prompt: string;
  helpText: string;
  mutatorField: "name" | "copyright" | null;
}

const IDENTITY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "author_display_name",
    prompt: "Who should be listed as the author of this keyboard?",
    helpText:
      "This name will appear in the keyboard package and in the public keyboard repository. " +
      "You can use a person's name, an organization name, or a committee name.",
    mutatorField: "name",
  },
  {
    id: "author_contact_email",
    prompt: "What email address can people use to contact the keyboard author?",
    helpText:
      "This address goes into the keyboard package so that users or maintainers " +
      "can reach the right person if they have questions. Use an address that will remain active.",
    mutatorField: null,
  },
  {
    id: "pa_copyright_holder",
    prompt: "Who holds the copyright for this keyboard?",
    helpText:
      "Name of the person or organization that holds the copyright for this keyboard. " +
      "This may be you, your employer, or a language organization. " +
      "Example: 'Bafut Language Committee'",
    mutatorField: "copyright",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStubVfs(keyboardId: string): VirtualFS {
  const kmnContent = [
    `store(&NAME) 'New Keyboard'`,
    `store(&COPYRIGHT) 'Copyright © 2025 Author'`,
    `store(&KEYBOARDVERSION) '1.0'`,
    `store(&TARGETS) 'any'`,
    `begin Unicode > use(main)`,
    `group(main) using keys`,
  ].join("\n");
  return createVirtualFS([
    { path: `source/${keyboardId}.kmn`, content: kmnContent, isBinary: false },
  ]);
}

function getKmnText(vfs: VirtualFS, keyboardId: string): string {
  const entry = vfs.get(`source/${keyboardId}.kmn`);
  if (entry === undefined || typeof entry.content !== "string") return "";
  return entry.content;
}

// ---------------------------------------------------------------------------
// Layout constants (same values as PreviewShell for visual consistency)
// ---------------------------------------------------------------------------

const DIVIDER_WIDTH = 6;
const LEFT_MIN_PCT = 25;
const LEFT_MAX_PCT = 65;
const LEFT_INIT_PCT = 45;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PhaseASurveyProps {
  baseKeyboard: BaseKeyboard | null;
}

export function PhaseASurvey({ baseKeyboard }: PhaseASurveyProps) {
  const [leftPct, setLeftPct] = useState(LEFT_INIT_PCT);
  const [handleHovered, setHandleHovered] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [vfs, setVfs] = useState<VirtualFS | null>(null);
  const [done, setDone] = useState(false);

  const dragRef = useRef<{ startX: number; startPct: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Initialise a fresh stub VFS whenever the base keyboard changes.
  useEffect(() => {
    if (baseKeyboard === null) {
      setVfs(null);
    } else {
      setVfs(makeStubVfs(baseKeyboard.id));
      setQuestionIndex(0);
      setInputValue("");
      setDone(false);
    }
  }, [baseKeyboard]);

  // Resize drag handlers — same pattern as PreviewShell.
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startPct: leftPct };
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [leftPct]
  );

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (dragRef.current === null || containerRef.current === null) return;
    const containerW = containerRef.current.getBoundingClientRect().width;
    if (containerW === 0) return;
    const deltaPct = ((e.clientX - dragRef.current.startX) / containerW) * 100;
    const next = Math.min(
      LEFT_MAX_PCT,
      Math.max(LEFT_MIN_PCT, dragRef.current.startPct + deltaPct)
    );
    setLeftPct(next);
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  useEffect(() => {
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  const rightPct = 100 - leftPct;
  // questionIndex is always in [0, IDENTITY_QUESTIONS.length) — non-null is safe.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const question = IDENTITY_QUESTIONS[questionIndex]!;
  const isLastQuestion = questionIndex === IDENTITY_QUESTIONS.length - 1;

  function handleNext() {
    if (vfs === null || baseKeyboard === null || inputValue.trim() === "") return;

    const trimmed = inputValue.trim();
    if (question.mutatorField === "name") {
      applyIdentityStubMutation(vfs, baseKeyboard.id, { name: trimmed });
      setVfs({ ...vfs });
    } else if (question.mutatorField === "copyright") {
      applyIdentityStubMutation(vfs, baseKeyboard.id, { copyright: trimmed });
      setVfs({ ...vfs });
    }

    if (isLastQuestion) {
      setDone(true);
    } else {
      setQuestionIndex((i) => i + 1);
      setInputValue("");
    }
  }

  const kmnText =
    vfs !== null && baseKeyboard !== null
      ? getKmnText(vfs, baseKeyboard.id)
      : "";

  // -- No base keyboard selected --------------------------------------------
  if (baseKeyboard === null) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
          color: "#9aa7b8",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          fontSize: 15,
        }}
      >
        <span>No base keyboard selected.</span>
        <a href="#pick-base" style={{ color: "#6ea8fe", fontSize: 13 }}>
          Go to Pick Base to choose one
        </a>
      </div>
    );
  }

  // -- Main two-pane layout -------------------------------------------------
  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: "row",
        height: "100%",
        width: "100%",
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Left pane: question card */}
      <section
        aria-label="Survey questions"
        style={{
          flexBasis: `calc(${leftPct}% - ${DIVIDER_WIDTH / 2}px)`,
          flexShrink: 0,
          flexGrow: 0,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          minHeight: 0,
          overflow: "auto",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe" }}>
          Phase A — Identity
        </h2>

        {/* Progress indicator */}
        <div
          style={{ fontSize: 12, color: "#9aa7b8" }}
          aria-label={`Question ${questionIndex + 1} of ${IDENTITY_QUESTIONS.length}`}
        >
          {done
            ? "Done"
            : `Question ${questionIndex + 1} of ${IDENTITY_QUESTIONS.length}`}
        </div>

        {done ? (
          <div
            style={{
              padding: "16px 20px",
              background: "#0f2a1a",
              border: "1px solid #238636",
              borderRadius: 8,
              color: "#7ee787",
              fontSize: 14,
            }}
          >
            Identity saved to keyboard file.{" "}
            <a href="#survey" style={{ color: "#6ea8fe" }}>
              Start over
            </a>
          </div>
        ) : (
          <div
            style={{
              padding: "20px",
              background: "#161b22",
              border: "1px solid #283040",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <label
              htmlFor={`survey-input-${question.id}`}
              style={{ fontSize: 14, fontWeight: 600 }}
            >
              {question.prompt}
            </label>

            <p style={{ margin: 0, color: "#9aa7b8", fontSize: 12, lineHeight: 1.6 }}>
              {question.helpText}
            </p>

            <input
              id={`survey-input-${question.id}`}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNext();
              }}
              placeholder="Type your answer…"
              style={{
                padding: "8px 12px",
                background: "#0d1117",
                border: "1px solid #3d4f6e",
                borderRadius: 6,
                color: "#e6edf3",
                fontSize: 13,
                fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
                outline: "none",
              }}
            />

            <button
              type="button"
              disabled={inputValue.trim() === ""}
              onClick={handleNext}
              style={{
                alignSelf: "flex-end",
                padding: "7px 20px",
                background: inputValue.trim() !== "" ? "#1f6feb" : "#161b22",
                color: inputValue.trim() !== "" ? "#e6edf3" : "#484f58",
                border: "1px solid #283040",
                borderRadius: 6,
                fontSize: 13,
                cursor: inputValue.trim() !== "" ? "pointer" : "not-allowed",
                fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
                transition: "background 0.15s",
              }}
            >
              {isLastQuestion ? "Done" : "Next"}
            </button>
          </div>
        )}
      </section>

      {/* Drag handle */}
      <div
        role="separator"
        aria-label="Resize panes"
        aria-orientation="vertical"
        onPointerDown={onPointerDown}
        onMouseEnter={() => setHandleHovered(true)}
        onMouseLeave={() => setHandleHovered(false)}
        style={{
          width: DIVIDER_WIDTH,
          flexShrink: 0,
          background: handleHovered ? "#3d5070" : "#283040",
          cursor: "col-resize",
          userSelect: "none",
          transition: "background 120ms ease",
        }}
      />

      {/* Right pane: live .kmn preview */}
      <section
        aria-label="Keyboard source preview"
        aria-live="polite"
        style={{
          flexBasis: `calc(${rightPct}% - ${DIVIDER_WIDTH / 2}px)`,
          flexGrow: 1,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: 0,
          overflow: "auto",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe" }}>
          Keyboard source preview
        </h2>
        <p style={{ margin: 0, color: "#9aa7b8", fontSize: 12 }}>
          source/{baseKeyboard.id}.kmn
        </p>
        <pre
          style={{
            flex: 1,
            margin: 0,
            padding: "14px 16px",
            background: "#161b22",
            border: "1px solid #283040",
            borderRadius: 8,
            color: "#e6edf3",
            fontSize: 12,
            fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
            overflowX: "auto",
            whiteSpace: "pre",
            lineHeight: 1.7,
          }}
        >
          {kmnText}
        </pre>
      </section>
    </div>
  );
}
