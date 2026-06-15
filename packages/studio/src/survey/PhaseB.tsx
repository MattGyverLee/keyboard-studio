// Phase B survey wrapper — Character inventory discovery (spec §8 step 4).
//
// Four discovery methods are offered:
//   manual      — step-by-step questions via SurveyRunner (fully functional)
//   text-sample — user types each character separated by spaces (TextSampleView)
//   linguist    — LLM-synthesized inventory (coming soon, #141)
//   picker      — CLDR-seeded visual grid (coming soon, #142)
//
// On completion, extractInventory() scans the Phase B answers for the question
// ids that carry character data, splits them into NFC graphemes, and populates
// SurveyPhaseResult.confirmedInventory (additive contract field). The gallery
// reads this via session.confirmedInventory (mergePhaseResults union).

import { useMemo, useState } from "react";
import type { SurveyAnswer, SurveyPhaseResult, LintFinding } from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { loadModularFlow } from "./loadModularFlow.ts";
import type { SurveyContext, FlowDef } from "./types.ts";

// Vite ?raw import — typed via the `*.yaml?raw` declaration in src/vite-env.d.ts.
import phaseBModularRaw from "../../../../content/flows/phase_b_characters.modular.yaml?raw";

// Question id that begins the manual step-by-step path.
// makeManualOnlyFlow routes pb_discovery_intro straight here.
const PHASE_B_MANUAL_ENTRY = "pb_routing_branch";

// ---------------------------------------------------------------------------
// Character extraction — populates confirmedInventory on the phase result
// ---------------------------------------------------------------------------

// Question ids whose answers contain character data (spec §8 step 4).
// Text answers are split on whitespace; multi_select values are individual entries.
const CHAR_TEXT_IDS = new Set<string>([
  "pb_special_letters_list",    // "ŋ Ŋ ɛ Ɛ ɔ Ɔ" etc.
  "pb_latin_digraphs_list",     // "sh ts ny ng"
  "pb_indic_nukta_detail",      // consonant letters taking dot-below
  "pb_indic_vowels_onset_list", // independent vowel letters
  "pb_syllabic_finals_detail",  // final-consonant marks
  "pb_other_free_entry",        // free-entry characters
  "pb_rtl_special_letters",     // RTL language-specific letters
]);

// pb_picker_confirm is multi_select — each value is a single grapheme or token.
const CHAR_MULTI_SELECT_ID = "pb_picker_confirm";

/**
 * Extract NFC graphemes from the character-bearing Phase B answers.
 * Text answers are whitespace-split; picker multi_select entries are taken as-is.
 * Empties and whitespace-only tokens are dropped. Deduplicated, first-appearance order.
 */
function extractInventory(answers: SurveyAnswer[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  function push(raw: string): void {
    const g = raw.normalize("NFC").trim();
    if (g.length > 0 && !seen.has(g)) {
      seen.add(g);
      result.push(g);
    }
  }

  for (const answer of answers) {
    if (CHAR_TEXT_IDS.has(answer.questionId) && answer.answerType === "text") {
      for (const token of (answer.value as string).split(/\s+/)) {
        push(token);
      }
    } else if (
      answer.questionId === CHAR_MULTI_SELECT_ID &&
      answer.answerType === "char-list"
    ) {
      for (const entry of answer.value as string[]) {
        push(entry);
      }
    }
  }

  return result;
}

/**
 * Parse a space-delimited character string into a deduplicated NFC array.
 * Exported for unit testing.
 *
 * "a b c ŋ ŋ" → ["a", "b", "c", "ŋ"]
 */
export function parseSpacedChars(input: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of input.split(/\s+/)) {
    const g = token.normalize("NFC");
    if (g.length > 0 && !seen.has(g)) {
      seen.add(g);
      result.push(g);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// DiscoveryMethodStub — shown for unimplemented discovery methods
// ---------------------------------------------------------------------------

function DiscoveryMethodStub({ feature, issueRef }: { feature: string; issueRef: string }) {
  return (
    <div style={{ padding: 16, border: "1px solid #30363d", borderRadius: 6, color: "#8b949e" }}>
      <strong style={{ color: "#e6edf3" }}>{feature}</strong>
      <p>This discovery method is coming soon ({issueRef}).</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhaseB state — intercept non-manual discovery choices
// ---------------------------------------------------------------------------

type DiscoveryMethod = "manual" | "text-sample" | "linguist" | "picker" | null;

// Return a modified FlowDef that starts at pb_routing_branch, skipping the
// discovery-intro question, so the runner goes straight into manual questions.
function makeManualOnlyFlow(flow: FlowDef): FlowDef {
  return {
    ...flow,
    questions: flow.questions.map((q) =>
      q.id === "pb_discovery_intro"
        ? { ...q, required: false, engine_resolved: true, next: PHASE_B_MANUAL_ENTRY }
        : q,
    ),
  };
}

// ---------------------------------------------------------------------------
// TextSampleView — space-delimited character entry
// ---------------------------------------------------------------------------

interface TextSampleViewProps {
  context: SurveyContext;
  onComplete: (result: SurveyPhaseResult) => void;
  onBack: () => void;
}

function TextSampleView({ context, onComplete, onBack }: TextSampleViewProps) {
  const [stage, setStage] = useState<"input" | "review">("input");
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const languageName =
    typeof context["language_name"] === "string" ? context["language_name"] : null;

  function handleReview(): void {
    const chars = parseSpacedChars(raw);
    setParsed(chars);
    setSelected(new Set(chars));
    setStage("review");
  }

  function toggleChar(char: string): void {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(char)) {
        n.delete(char);
      } else {
        n.add(char);
      }
      return n;
    });
  }

  function handleConfirm(): void {
    onComplete({
      phase: "B",
      // answers: [] is intentional — mergePhaseResults() reads confirmedInventory
      // directly (surveySession.ts), not answers, for the inventory union.
      answers: [],
      confirmedInventory: parsed
        .filter((c) => selected.has(c)),
    });
  }

  if (stage === "review") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          color: "#e6edf3",
        }}
      >
        <h2
          style={{
            margin: "0 0 4px 0",
            fontSize: "1.1rem",
            color: "#6ea8fe",
            fontWeight: 600,
          }}
        >
          Phase B — Character discovery
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: "#e6edf3", fontWeight: 600 }}>
          Review your characters
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "#8b949e", lineHeight: 1.5 }}>
          {parsed.length} character{parsed.length !== 1 ? "s" : ""} found. Tick the ones to
          include, untick any that crept in by mistake.
          {languageName !== null ? ` When happy, click Continue to use these as your ${languageName} inventory.` : " When happy, click Continue."}
        </p>

        <div
          role="group"
          aria-label="Parsed characters — toggle to include or exclude"
          style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
        >
          {parsed.map((char) => {
            const cp =
              "U+" +
              (char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") ?? "????");
            const isSelected = selected.has(char);
            return (
              <button
                key={char}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggleChar(char)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  border: isSelected ? "1px solid #1f6feb" : "1px solid #30363d",
                  borderRadius: 6,
                  padding: "6px 10px",
                  cursor: "pointer",
                  background: isSelected ? "rgba(31,111,235,0.15)" : "transparent",
                  fontFamily: "inherit",
                  minWidth: 44,
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: 20,
                    fontFamily: "inherit",
                    color: "#e6edf3",
                    lineHeight: 1.3,
                  }}
                >
                  {char}
                </span>
                <span style={{ fontSize: 10, color: "#8b949e", lineHeight: 1.2, marginTop: 2 }}>
                  {cp}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setStage("input")}
            style={{
              padding: "8px 18px",
              background: "transparent",
              border: "1px solid #30363d",
              borderRadius: 6,
              color: "#8b949e",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Back
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={handleConfirm}
            style={{
              padding: "8px 18px",
              background: selected.size === 0 ? "#21262d" : "#1f6feb",
              border: "1px solid #30363d",
              borderRadius: 6,
              color: selected.size === 0 ? "#8b949e" : "#e6edf3",
              fontSize: 13,
              cursor: selected.size === 0 ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Use these {selected.size} character{selected.size !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    );
  }

  // INPUT STAGE
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#e6edf3",
      }}
    >
      <h2
        style={{
          margin: "0 0 4px 0",
          fontSize: "1.1rem",
          color: "#6ea8fe",
          fontWeight: 600,
        }}
      >
        Phase B — Character discovery
      </h2>
      <p style={{ margin: 0, fontSize: 14, color: "#e6edf3", fontWeight: 600 }}>
        Type each character in your language's alphabet, separated by spaces
      </p>
      <p style={{ margin: 0, fontSize: 13, color: "#8b949e", lineHeight: 1.5 }}>
        Include every letter your keyboard needs to produce — uppercase and lowercase if
        relevant, diacritics, and any special letters. Separate each one with a space.
        {languageName !== null ? ` Example for ${languageName}: ` : " For example: "}
        <span style={{ fontFamily: "monospace", color: "#e6edf3" }}>a b c d e ŋ ɛ ɔ</span>
      </p>

      <textarea
        aria-label="Characters separated by spaces"
        placeholder="a b c d e ŋ ɛ ɔ"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        style={{
          width: "100%",
          minHeight: 100,
          background: "#0d1117",
          border: "1px solid #30363d",
          borderRadius: 6,
          color: "#e6edf3",
          fontSize: 16,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "10px 12px",
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: "8px 18px",
            background: "transparent",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: "#8b949e",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Back
        </button>
        <button
          type="button"
          disabled={raw.trim() === ""}
          onClick={handleReview}
          style={{
            padding: "8px 18px",
            background: raw.trim() === "" ? "#21262d" : "#1f6feb",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: raw.trim() === "" ? "#8b949e" : "#e6edf3",
            fontSize: 13,
            cursor: raw.trim() === "" ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          Review characters
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhaseB component
// ---------------------------------------------------------------------------

export interface PhaseBProps {
  context?: SurveyContext;
  onComplete: (result: SurveyPhaseResult) => void;
  onBack?: () => void;
  findingsByQuestionId?: Record<string, LintFinding[]>;
}

export function PhaseB({ context = {}, onComplete, onBack, findingsByQuestionId }: PhaseBProps) {
  const flow = useMemo(() => loadModularFlow(phaseBModularRaw as string), []);
  const [discoveryMethod, setDiscoveryMethod] = useState<DiscoveryMethod>(null);
  // manualFlow is memoized here (before any early returns) to satisfy React's
  // rules of hooks — useMemo must not be called after a conditional return.
  const manualFlow = useMemo(() => makeManualOnlyFlow(flow), [flow]);

  if (discoveryMethod === null) {
    return (
      <IntroChooser
        context={context}
        onChoose={setDiscoveryMethod}
        {...(onBack !== undefined ? { onBack } : {})}
      />
    );
  }

  if (discoveryMethod === "text-sample") {
    return (
      <TextSampleView
        context={context}
        onComplete={onComplete}
        onBack={() => setDiscoveryMethod(null)}
      />
    );
  }

  if (discoveryMethod !== "manual") {
    const stubInfo: Record<
      Exclude<DiscoveryMethod, "manual" | "text-sample" | null>,
      { feature: string; issueRef: string }
    > = {
      linguist: { feature: "Linguist-synthesized inventory", issueRef: "#141" },
      picker: { feature: "Visual character grid picker", issueRef: "#142" },
    };
    const stub = stubInfo[discoveryMethod];
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          color: "#e6edf3",
        }}
      >
        <h2
          style={{
            margin: "0 0 4px 0",
            fontSize: "1.1rem",
            color: "#6ea8fe",
            fontWeight: 600,
          }}
        >
          Phase B — Character discovery
        </h2>
        <DiscoveryMethodStub feature={stub.feature} issueRef={stub.issueRef} />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setDiscoveryMethod(null)}
            style={{
              padding: "8px 18px",
              background: "transparent",
              border: "1px solid #30363d",
              borderRadius: 6,
              color: "#8b949e",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setDiscoveryMethod("manual")}
            style={{
              padding: "8px 18px",
              background: "#1f6feb",
              border: "1px solid #30363d",
              borderRadius: 6,
              color: "#e6edf3",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Use step-by-step instead
          </button>
        </div>
      </div>
    );
  }

  // Wrap onComplete to inject confirmedInventory before forwarding the result.
  function handleComplete(result: SurveyPhaseResult): void {
    onComplete({
      ...result,
      confirmedInventory: extractInventory(result.answers),
    });
  }

  // Manual path — use a patched flow that skips the intro question
  return (
    <div
      style={{
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <h2
        style={{
          margin: "0 0 20px 0",
          fontSize: "1.1rem",
          color: "#6ea8fe",
          fontWeight: 600,
        }}
      >
        Phase B — Character inventory
      </h2>
      <SurveyRunner
        key={manualFlow.flow_id}
        flow={manualFlow}
        context={context}
        onComplete={handleComplete}
        onBack={() => setDiscoveryMethod(null)}
        {...(findingsByQuestionId !== undefined ? { findingsByQuestionId } : {})}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// IntroChooser — the discovery method selection card
// ---------------------------------------------------------------------------

interface IntroChooserProps {
  context: SurveyContext;
  onChoose: (method: DiscoveryMethod) => void;
  onBack?: () => void;
}

const METHODS: Array<{ value: Exclude<DiscoveryMethod, null>; label: string }> = [
  { value: "manual", label: "Step by step — I will answer the questions below" },
  { value: "text-sample", label: "Enter my characters — I'll type each one separated by spaces" },
  { value: "linguist", label: "Show me a suggested list based on my language" },
  { value: "picker", label: "Browse a character grid and tick what I need" },
];

function IntroChooser({ context, onChoose, onBack }: IntroChooserProps) {
  const [selected, setSelected] = useState<Exclude<DiscoveryMethod, null>>("manual");

  const languageName = context["language_name"] ?? context["detected_group"] ?? "your language";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#e6edf3",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe", fontWeight: 600 }}>
        Phase B — Character discovery
      </h2>
      <p style={{ margin: 0, fontSize: 13, color: "#8b949e" }}>
        How would you like to tell us which characters {languageName} uses?
      </p>
      <p style={{ margin: 0, fontSize: 12, color: "#8b949e", lineHeight: 1.5 }}>
        There are several ways to build your character list. All of them feed the same
        final list — you can use more than one method. Choose your preferred starting point.
      </p>

      <div role="radiogroup" aria-label="Discovery method">
        {METHODS.map(({ value, label }) => {
          const inputId = `discovery-method-${value}`;
          return (
            <label
              key={value}
              htmlFor={inputId}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                marginBottom: 10,
                cursor: "pointer",
                fontSize: 13,
                color: "#e6edf3",
              }}
            >
              <input
                type="radio"
                id={inputId}
                name="discovery_method"
                value={value}
                checked={selected === value}
                onChange={() => setSelected(value)}
                style={{ marginTop: 2, accentColor: "#6ea8fe" }}
              />
              <span style={{ lineHeight: 1.5 }}>
                {label}
                {value !== "manual" && value !== "text-sample" && (
                  <span
                    style={{
                      marginLeft: 8,
                      padding: "1px 6px",
                      background: "#161b22",
                      border: "1px solid #30363d",
                      borderRadius: 4,
                      fontSize: 11,
                      color: "#8b949e",
                    }}
                  >
                    coming soon
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {onBack !== undefined && (
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: "8px 18px",
              background: "transparent",
              border: "1px solid #30363d",
              borderRadius: 6,
              color: "#8b949e",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={() => onChoose(selected)}
          style={{
            padding: "8px 18px",
            background: "#1f6feb",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: "#e6edf3",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
