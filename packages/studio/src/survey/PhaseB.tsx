// Phase B survey wrapper — Character inventory discovery (spec §8 step 4).
//
// Four discovery methods are offered:
//   manual      — step-by-step questions via SurveyRunner (fully functional)
//   text-sample — user types each character separated by spaces (TextSampleView)
//   linguist    — LLM-synthesized inventory (mock-backed; real LLM deferred)
//   picker      — CLDR-seeded visual grid (coming soon)
//
// On completion, extractInventory() scans the Phase B answers for the question
// ids that carry character data, splits them into NFC graphemes, and populates
// SurveyPhaseResult.confirmedInventory (additive contract field). The gallery
// reads this via session.confirmedInventory (mergePhaseResults union).

import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import type { SurveyAnswer, SurveyPhaseResult, LintFinding, PlacementMap, LinguistInventory, InventoryFlag } from "@keyboard-studio/contracts";
import { linguistInventoryChars } from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { loadModularFlow } from "./loadModularFlow.ts";
import type { SurveyContext, FlowDef } from "./types.ts";
import { buildPlacementSeeds } from "./placementSeeds.ts";
import { getCharacterDiscoveryService } from "../lib/services.ts";

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
// DiscoveryMethodStub — shown for unimplemented discovery methods (picker only)
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
// LinguistProposalView — LLM-synthesized inventory proposal with edit/confirm
// ---------------------------------------------------------------------------

interface LinguistProposalViewProps {
  context: SurveyContext;
  onComplete: (result: SurveyPhaseResult) => void;
  onBack: () => void;
  onSwitchToManual: () => void;
}

/** Format a codepoint as "U+XXXX" for screen-reader-friendly display. */
function toUPlus(ch: string): string {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return "";
  return "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Chip button: displays a single character with its U+ notation.
 * When selected=true the chip is highlighted blue; click toggles selection.
 */
function CharChip({
  ch,
  selected,
  flag,
  onToggle,
}: {
  ch: string;
  selected: boolean;
  flag?: InventoryFlag;
  onToggle: () => void;
}) {
  const flagColor =
    flag?.issue === "not-attested"
      ? "#f0883e" // orange — agent included, CLDR doesn't attest
      : flag?.issue === "cldr-omitted"
        ? "#3fb950" // green — CLDR has it but agent omitted
        : undefined;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`${selected ? "Deselect" : "Select"} ${toUPlus(ch)}${flag !== undefined ? ` (${flag.issue})` : ""}`}
      aria-pressed={selected}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "6px 10px",
        border: `1px solid ${selected ? "#6ea8fe" : "#30363d"}`,
        borderRadius: 8,
        background: selected ? "#0d2140" : "#161b22",
        cursor: "pointer",
        gap: 2,
        minWidth: 44,
        opacity: selected ? 1 : 0.45,
        position: "relative",
      }}
    >
      <span
        style={{
          fontSize: 22,
          fontFamily: "system-ui, sans-serif",
          lineHeight: 1,
          color: selected ? "#6ea8fe" : "#8b949e",
        }}
      >
        {ch}
      </span>
      <span
        style={{
          fontSize: 9,
          color: "#8b949e",
          fontFamily: "monospace",
        }}
      >
        {toUPlus(ch)}
      </span>
      {flag !== undefined && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: flagColor,
          }}
        />
      )}
    </button>
  );
}

/** A labelled section in the proposal grid. */
function ProposalSection({
  title,
  chars,
  selectedSet,
  flagMap,
  onToggle,
}: {
  title: string;
  chars: string[];
  selectedSet: Set<string>;
  flagMap: Map<string, InventoryFlag>;
  onToggle: (ch: string) => void;
}) {
  if (chars.length === 0) return null;
  return (
    <div>
      <p
        style={{
          margin: "0 0 8px 0",
          fontSize: 12,
          fontWeight: 600,
          color: "#8b949e",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {title}
      </p>
      <div
        role="group"
        aria-label={title}
        style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
      >
        {chars.map((ch) => {
          const flagEntry = flagMap.get(ch);
          return (
            <CharChip
              key={ch}
              ch={ch}
              selected={selectedSet.has(ch)}
              {...(flagEntry !== undefined ? { flag: flagEntry } : {})}
              onToggle={() => onToggle(ch)}
            />
          );
        })}
      </div>
    </div>
  );
}

function LinguistProposalView({ context, onComplete, onBack, onSwitchToManual }: LinguistProposalViewProps) {
  const languageName = context.language_name ?? context.detected_group ?? "your language";
  const bcp47 = context.bcp47 ?? "";

  type LoadState =
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "loaded"; inv: LinguistInventory };

  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  // selectedSet tracks which characters are currently checked
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  // addInput for the "+ Add" field (reuse chip-add pattern from TextSampleView)
  const [addInput, setAddInput] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  // flagMap: char -> InventoryFlag for provenance labels
  const flagMap = useMemo<Map<string, InventoryFlag>>(() => {
    if (loadState.kind !== "loaded") return new Map();
    const m = new Map<string, InventoryFlag>();
    for (const f of loadState.inv.flags ?? []) {
      m.set(f.char, f);
    }
    return m;
  }, [loadState]);

  useEffect(() => {
    if (bcp47.length === 0) {
      setLoadState({ kind: "error", message: "No language tag — cannot synthesize an inventory." });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const svc = await getCharacterDiscoveryService();
        const inv = await svc.synthesizeInventory(languageName, bcp47, undefined);
        if (cancelled) return;
        const flat = linguistInventoryChars(inv);
        setLoadState({ kind: "loaded", inv });
        setSelectedSet(new Set(flat));
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setLoadState({ kind: "error", message: msg });
      }
    })();
    return () => { cancelled = true; };
  }, [bcp47, languageName]);

  function toggleChar(ch: string) {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) {
        next.delete(ch);
      } else {
        next.add(ch);
      }
      return next;
    });
  }

  function addChar() {
    const trimmed = addInput.trim().normalize("NFC");
    if (!trimmed) return;
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    setSelectedSet((prev) => {
      const next = new Set(prev);
      for (const t of tokens) {
        const g = t.normalize("NFC");
        if (g.length > 0) next.add(g);
      }
      return next;
    });
    setAddInput("");
    addInputRef.current?.focus();
  }

  function handleConfirm() {
    // Flatten selected + NFC-normalize + dedup (Set already deduped, ensure NFC order)
    const confirmedInventory = [...selectedSet]
      .map((c) => c.normalize("NFC"))
      .filter((c, i, arr) => arr.indexOf(c) === i); // stable dedup after NFC
    onComplete({
      phase: "B",
      answers: [],
      confirmedInventory,
    });
  }

  const sharedContainerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: 640,
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    color: "#e6edf3",
  };

  if (loadState.kind === "loading") {
    return (
      <div style={sharedContainerStyle}>
        <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe", fontWeight: 600 }}>
          Phase B — Suggested character list
        </h2>
        <p style={{ margin: 0, color: "#8b949e", fontSize: 13 }}>
          Synthesizing inventory for {languageName} ({bcp47})…
        </p>
        <div
          role="status"
          aria-live="polite"
          aria-label="Loading character inventory"
          style={{ color: "#8b949e", fontSize: 13 }}
        >
          Loading…
        </div>
      </div>
    );
  }

  if (loadState.kind === "error") {
    return (
      <div style={sharedContainerStyle}>
        <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe", fontWeight: 600 }}>
          Phase B — Suggested character list
        </h2>
        <p style={{ margin: 0, color: "#f85149", fontSize: 13 }}>
          Could not generate a suggestion: {loadState.message}
        </p>
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
            onClick={onSwitchToManual}
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

  // Loaded — render grouped proposal
  const inv = loadState.inv;
  const selectedCount = selectedSet.size;
  const confirmDisabled = selectedCount === 0;

  return (
    <div style={sharedContainerStyle}>
      <button
        type="button"
        onClick={onBack}
        style={{
          alignSelf: "flex-start",
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

      <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe", fontWeight: 600 }}>
        Suggested inventory for {languageName}
      </h2>
      <p style={{ margin: 0, fontSize: 13, color: "#8b949e", lineHeight: 1.5 }}>
        This list was synthesized from linguistic data for{" "}
        <strong style={{ color: "#e6edf3" }}>{bcp47}</strong>. Review each
        character and deselect any that do not apply. Add missing characters
        using the field below.
      </p>

      {/* Provenance legend */}
      {(inv.flags ?? []).length > 0 && (
        <div
          role="note"
          aria-label="Provenance legend"
          style={{ fontSize: 12, color: "#8b949e", display: "flex", gap: 16, flexWrap: "wrap" }}
        >
          <span>
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#f0883e",
                marginRight: 4,
              }}
            />
            not-attested (agent included; CLDR does not attest)
          </span>
          <span>
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#3fb950",
                marginRight: 4,
              }}
            />
            cldr-omitted (CLDR attests; agent did not include)
          </span>
        </div>
      )}

      {/* Live region for screen readers */}
      <div aria-live="polite" aria-atomic="false" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>
        {selectedCount} character{selectedCount === 1 ? "" : "s"} selected
      </div>

      {/* Grouped character sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <ProposalSection
          title="Core alphabet — lowercase"
          chars={inv.alphabetCore.lowercase}
          selectedSet={selectedSet}
          flagMap={flagMap}
          onToggle={toggleChar}
        />
        <ProposalSection
          title="Core alphabet — uppercase"
          chars={inv.alphabetCore.uppercase}
          selectedSet={selectedSet}
          flagMap={flagMap}
          onToggle={toggleChar}
        />
        {inv.alphabetAuxiliary !== undefined && (
          <>
            <ProposalSection
              title={`Auxiliary alphabet — lowercase${inv.alphabetAuxiliary.note !== undefined ? ` (${inv.alphabetAuxiliary.note})` : ""}`}
              chars={inv.alphabetAuxiliary.lowercase}
              selectedSet={selectedSet}
              flagMap={flagMap}
              onToggle={toggleChar}
            />
            <ProposalSection
              title="Auxiliary alphabet — uppercase"
              chars={inv.alphabetAuxiliary.uppercase}
              selectedSet={selectedSet}
              flagMap={flagMap}
              onToggle={toggleChar}
            />
          </>
        )}
        <ProposalSection
          title="Mandatory diacritics and ligatures"
          chars={inv.mandatoryDiacriticsAndLigatures}
          selectedSet={selectedSet}
          flagMap={flagMap}
          onToggle={toggleChar}
        />
        <ProposalSection
          title="Language-specific punctuation"
          chars={inv.languageSpecificPunctuation}
          selectedSet={selectedSet}
          flagMap={flagMap}
          onToggle={toggleChar}
        />
        <ProposalSection
          title="Numerals"
          chars={inv.numerals}
          selectedSet={selectedSet}
          flagMap={flagMap}
          onToggle={toggleChar}
        />
        {inv.nuktaAndBorrowedSoundMarkers !== undefined && (
          <ProposalSection
            title="Nukta and borrowed-sound markers"
            chars={inv.nuktaAndBorrowedSoundMarkers}
            selectedSet={selectedSet}
            flagMap={flagMap}
            onToggle={toggleChar}
          />
        )}
        {inv.independentVowels !== undefined && (
          <ProposalSection
            title="Independent vowels"
            chars={inv.independentVowels}
            selectedSet={selectedSet}
            flagMap={flagMap}
            onToggle={toggleChar}
          />
        )}
        {inv.syllabicFinalMarkers !== undefined && (
          <ProposalSection
            title="Syllabic final markers"
            chars={inv.syllabicFinalMarkers}
            selectedSet={selectedSet}
            flagMap={flagMap}
            onToggle={toggleChar}
          />
        )}
      </div>

      {/* Add-character row */}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          ref={addInputRef}
          type="text"
          value={addInput}
          onChange={(e) => setAddInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addChar();
            }
          }}
          placeholder="Add missing characters (space-separated)…"
          aria-label="Add missing characters"
          style={{
            flex: 1,
            background: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: "#e6edf3",
            fontSize: 15,
            fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            padding: "8px 12px",
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          disabled={addInput.trim() === ""}
          onClick={addChar}
          style={{
            padding: "8px 18px",
            background: addInput.trim() === "" ? "#21262d" : "#1f6feb",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: addInput.trim() === "" ? "#8b949e" : "#e6edf3",
            fontSize: 13,
            cursor: addInput.trim() === "" ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          + Add
        </button>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <button
          type="button"
          onClick={onSwitchToManual}
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
          Use step-by-step instead
        </button>
        <button
          type="button"
          disabled={confirmDisabled}
          onClick={handleConfirm}
          style={{
            padding: "8px 18px",
            background: confirmDisabled ? "#21262d" : "#1f6feb",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: confirmDisabled ? "#8b949e" : "#e6edf3",
            fontSize: 13,
            cursor: confirmDisabled ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          Confirm ({selectedCount} character{selectedCount === 1 ? "" : "s"})
        </button>
      </div>
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
// getFirstGrapheme — module-level helper, not exported
// ---------------------------------------------------------------------------

function getFirstGrapheme(s: string): string {
  if (!s) return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter();
    const [first] = seg.segment(s);
    return first?.segment ?? "";
  }
  return [...s][0] ?? "";
}

// ---------------------------------------------------------------------------
// TextSampleView — one-at-a-time character entry
// ---------------------------------------------------------------------------

interface TextSampleViewProps {
  context: SurveyContext;
  onComplete: (result: SurveyPhaseResult) => void;
  onBack: () => void;
}

function TextSampleView({ onComplete, onBack }: TextSampleViewProps) {
  const [inputVal, setInputVal] = useState("");
  const [chars, setChars] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function add(): void {
    const trimmed = inputVal.trim().normalize("NFC");
    if (!trimmed) return;
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const newChars = tokens.map(getFirstGrapheme).filter(Boolean);
    if (newChars.length === 0) return;
    setChars((prev) => {
      let result = [...prev];
      for (const c of newChars) {
        if (!result.includes(c)) result = [...result, c];
      }
      return result;
    });
    setInputVal("");
    inputRef.current?.focus();
  }

  const addDisabled = inputVal.trim() === "";
  const doneDisabled = chars.length === 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        maxWidth: 600,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#e6edf3",
      }}
    >
      {/* Back */}
      <button
        type="button"
        onClick={onBack}
        style={{
          alignSelf: "flex-start",
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
        ← Back
      </button>

      {/* Heading */}
      <h2
        style={{
          margin: 0,
          fontSize: "1.1rem",
          color: "#6ea8fe",
          fontWeight: 600,
        }}
      >
        Add a character
      </h2>

      {/* Input row */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Type characters (space-separated)…"
          aria-label="Character to add"
          style={{
            flex: 1,
            background: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: "#e6edf3",
            fontSize: 16,
            fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            padding: "8px 12px",
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          disabled={addDisabled}
          onClick={add}
          style={{
            padding: "8px 18px",
            background: addDisabled ? "#21262d" : "#1f6feb",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: addDisabled ? "#8b949e" : "#e6edf3",
            fontSize: 13,
            cursor: addDisabled ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          + Add
        </button>
      </div>

      {/* Chip grid section */}
      <div>
        <p
          style={{
            margin: "0 0 8px 0",
            fontSize: 13,
            fontWeight: 600,
            color: "#e6edf3",
          }}
        >
          Your alphabet ({chars.length})
        </p>
        {chars.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#8b949e" }}>
            No characters yet — add your first one above.
          </p>
        ) : (
          <div
            role="group"
            aria-label="Accumulated characters — click to remove"
            style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}
          >
            {chars.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChars((prev) => prev.filter((x) => x !== c))}
                aria-label={`Remove ${c}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "6px 10px",
                  border: "1px solid #30363d",
                  borderRadius: 8,
                  background: "#161b22",
                  cursor: "pointer",
                  gap: 2,
                  minWidth: 44,
                }}
              >
                <span
                  style={{
                    fontSize: 22,
                    fontFamily: "system-ui, sans-serif",
                    lineHeight: 1,
                    color: "#58a6ff",
                  }}
                >
                  {c}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    color: "#8b949e",
                    fontFamily: "monospace",
                  }}
                >
                  {"U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}
                </span>
                <span style={{ fontSize: 10, color: "#f85149" }}>×</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer: Done button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          disabled={doneDisabled}
          onClick={() => {
            onComplete({
              phase: "B",
              answers: [],
              confirmedInventory: chars,
            });
          }}
          style={{
            padding: "8px 18px",
            background: doneDisabled ? "#21262d" : "#1f6feb",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: doneDisabled ? "#8b949e" : "#e6edf3",
            fontSize: 13,
            cursor: doneDisabled ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          Done ({chars.length} character{chars.length === 1 ? "" : "s"})
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
  /**
   * Optional placement map from the kbgen seeder (spec §7.6 / §8 Phase B).
   * When present, PlacementMap codepoints above the confidence threshold are
   * used to pre-fill pb_special_letters_list with the characters the seeder
   * knows the language needs.
   *
   * The placement data (vkey, modifiers) is NOT wired to any Phase B question —
   * Phase B has no question asking which key a character should go on.  The
   * seeder's key-assignment proposals belong to a future Phase C placement
   * confirmation step (out of scope for v1).
   *
   * Providing this prop does NOT affect the §7.2 StrategyRecommendation path
   * (D3 scope guard): the seeded value populates the question input as a plain
   * pre-fill; the user confirms or overrides it before it enters SurveyPhaseResult.
   */
  placementMap?: PlacementMap;
}

export function PhaseB({ context = {}, onComplete, onBack, findingsByQuestionId, placementMap }: PhaseBProps) {
  const flow = useMemo(() => loadModularFlow(phaseBModularRaw as string), []);
  const [discoveryMethod, setDiscoveryMethod] = useState<DiscoveryMethod>(null);
  // manualFlow is memoized here (before any early returns) to satisfy React's
  // rules of hooks — useMemo must not be called after a conditional return.
  const manualFlow = useMemo(() => makeManualOnlyFlow(flow), [flow]);

  // Build the placement seed lookup from the PlacementMap (if provided).
  // Recompute only when placementMap changes (reference equality).
  const placementSeeds = useMemo(
    () => (placementMap !== undefined ? buildPlacementSeeds(placementMap) : new Map<string, string>()),
    [placementMap],
  );

  // getSeedValue: called by SurveyRunner before pushing each question.
  // Returns the seeded default for pb_special_letters_list when the placement
  // map provided characters above the threshold; undefined otherwise.
  const getSeedValue = useCallback(
    (questionId: string): string | string[] | undefined => placementSeeds.get(questionId),
    [placementSeeds],
  );


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

  if (discoveryMethod === "linguist") {
    return (
      <LinguistProposalView
        context={context}
        onComplete={onComplete}
        onBack={() => setDiscoveryMethod(null)}
        onSwitchToManual={() => setDiscoveryMethod("manual")}
      />
    );
  }

  if (discoveryMethod === "picker") {
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
        <DiscoveryMethodStub feature="Visual character grid picker" issueRef="visual picker" />
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
  // Not wrapped in useCallback intentionally — mirrors the IdentityLite.tsx neighbor pattern;
  // SurveyRunner captures onComplete via an internal ref (SurveyRunner.tsx:260), so a fresh
  // reference per render is harmless.
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
        getSeedValue={getSeedValue}
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
  { value: "text-sample", label: "Enter my characters — I will type them in one at a time" },
  { value: "linguist", label: "Show me a suggested list based on my language" },
  { value: "picker", label: "Browse a character grid and tick what I need" },
];

function IntroChooser({ context, onChoose, onBack }: IntroChooserProps) {
  // Default to "linguist" when a BCP47 tag is available (we can synthesize an
  // inventory), otherwise fall back to "manual" (step-by-step).
  const [selected, setSelected] = useState<Exclude<DiscoveryMethod, null>>(
    context.bcp47 !== undefined && context.bcp47.length > 0 ? "linguist" : "manual",
  );

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
                {value === "picker" && (
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
