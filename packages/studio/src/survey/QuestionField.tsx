// Per-type question field renderers, dispatched by SurveyRunner.
// Each renderer receives the current value (string | string[] | undefined)
// and calls onChange when the user modifies it.

import type { FlowQuestion } from "./types.ts";
import type { LintFinding } from "@keyboard-studio/contracts";
import { LintChip } from "../lint/LintChip.tsx";
import {
  TextField,
  Textarea,
  Dropdown,
  RadioGroup,
  Notice,
  Label,
} from "../ui/index.ts";
import type { DropdownOption } from "../ui/Dropdown.tsx";
import type { RadioOption } from "../ui/RadioGroup.tsx";

// ---------------------------------------------------------------------------
// Style constants retained for elements the ui/ primitives cannot cover
// (documented one-offs below).
// ---------------------------------------------------------------------------

// one-off: HELP_STYLE — Field.tsx exposes a help slot but restructuring the
// outer container to use Field would conflict with the grouped-label <span>
// pattern; kept inline to preserve zero diff.
const HELP_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: "#8b949e",
  lineHeight: 1.5,
  marginBottom: 10,
  whiteSpace: "pre-wrap",
};

// one-off: OPTION_ROW_STYLE / OPTION_LABEL_STYLE — kept for AutocompleteField
// and MultiSelectField (see prop-gap notes on those functions).
const OPTION_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  marginBottom: 8,
  cursor: "pointer",
};

const OPTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: 13,
  color: "#e6edf3",
  lineHeight: 1.5,
  cursor: "pointer",
};

// one-off: INPUT_STYLE retained only for AutocompleteField (prop-gap below).
const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 6,
  color: "#e6edf3",
  fontSize: 14,
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  boxSizing: "border-box",
  outline: "none",
};

interface FieldProps {
  question: FlowQuestion;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
}

function stringValue(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

function arrayValue(v: string | string[] | undefined): string[] {
  return Array.isArray(v) ? v : [];
}

// ---------------------------------------------------------------------------
// Text / short_text  →  ui TextField / Textarea
// ---------------------------------------------------------------------------

function TextFieldControl({ question, value, onChange }: FieldProps) {
  const isMultiLine = question.type === "text";
  const strVal = stringValue(value);
  if (isMultiLine) {
    return (
      <Textarea
        id={question.id}
        aria-required={question.required === true}
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
      />
    );
  }
  return (
    <TextField
      id={question.id}
      aria-required={question.required === true}
      value={strVal}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ---------------------------------------------------------------------------
// Autocomplete (text + datalist)
// one-off: Autocomplete primitive takes options: string[] (value-only), but
// AutocompleteField uses FlowOption[] which carries per-option labels displayed
// in the datalist suggestion list. Switching to the primitive would silently
// drop datalist labels (visible diff). Kept inline until the primitive grows
// an {value, label}[] overload.
// ---------------------------------------------------------------------------

function AutocompleteField({ question, value, onChange }: FieldProps) {
  const listId = `datalist-${question.id}`;
  const strVal = stringValue(value);
  return (
    <>
      <input
        type="text"
        id={question.id}
        list={listId}
        aria-required={question.required === true}
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        style={INPUT_STYLE}
        autoComplete="off"
      />
      <datalist id={listId}>
        {(question.options ?? []).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </datalist>
    </>
  );
}

// ---------------------------------------------------------------------------
// Select (native <select>)  →  ui Dropdown
// ---------------------------------------------------------------------------

function SelectField({ question, value, onChange }: FieldProps) {
  const strVal = stringValue(value);
  const dropdownOptions: DropdownOption[] = (question.options ?? []).map(
    (opt) => ({ value: opt.value, label: opt.label }),
  );
  return (
    <Dropdown
      id={question.id}
      aria-required={question.required === true}
      value={strVal}
      options={dropdownOptions}
      onChange={(v) => onChange(v)}
    />
  );
}

// ---------------------------------------------------------------------------
// Radio group  →  ui RadioGroup (mode="list")
// prop-gap: RadioGroup does not expose aria-labelledby on its wrapper <div>.
// The original renders role="radiogroup" aria-labelledby="label-{id}".
// RadioGroup renders role="radiogroup" without aria-labelledby.
// Kept as RadioGroup primitive; aria-labelledby is a known prop gap.
// ---------------------------------------------------------------------------

function RadioField({ question, value, onChange }: FieldProps) {
  const strVal = stringValue(value);
  const radioOptions: RadioOption[] = (question.options ?? []).map((opt) => ({
    value: opt.value,
    label: opt.label,
    ...(opt.note !== undefined ? { note: opt.note } : {}),
  }));
  return (
    <RadioGroup
      mode="list"
      name={question.id}
      value={strVal === "" ? null : strVal}
      options={radioOptions}
      onChange={(v) => onChange(v)}
    />
  );
}

// ---------------------------------------------------------------------------
// Boolean (Yes / No radio pair)  →  ui RadioGroup (mode="bool")
// prop-gap: same aria-labelledby gap as RadioField above.
// ---------------------------------------------------------------------------

function BoolField({ question, value, onChange }: FieldProps) {
  const strVal = stringValue(value);
  return (
    <RadioGroup
      mode="bool"
      name={question.id}
      value={strVal === "" ? null : strVal}
      options={[]}
      onChange={(v) => onChange(v)}
    />
  );
}

// ---------------------------------------------------------------------------
// Multi-select (checkboxes)
// one-off: MultiSelect primitive uses inputId = "multiselect-${opt.value}"
// whereas the original uses "${question.id}-${opt.value}". The id prefix
// change is a behavioral diff (element IDs differ). Kept inline until the
// primitive exposes a groupId/name prop to control the prefix.
// Also: MultiSelect's <div role="group"> does not expose aria-labelledby
// (same prop-gap as RadioGroup).
// ---------------------------------------------------------------------------

function MultiSelectField({ question, value, onChange }: FieldProps) {
  const arrVal = arrayValue(value);

  function toggle(optValue: string) {
    const next = arrVal.includes(optValue)
      ? arrVal.filter((v) => v !== optValue)
      : [...arrVal, optValue];
    onChange(next);
  }

  const options = question.options ?? [];

  if (options.length === 0 && question.options_source !== undefined) {
    return (
      <p style={{ fontSize: 13, color: "#8b949e", fontStyle: "italic" }}>
        Dynamic options ({question.options_source}) not loaded in this build.
      </p>
    );
  }

  return (
    <div role="group" aria-labelledby={`label-${question.id}`}>
      {options.map((opt) => {
        const inputId = `${question.id}-${opt.value}`;
        const checked = arrVal.includes(opt.value);
        return (
          <label key={opt.value} htmlFor={inputId} style={OPTION_ROW_STYLE}>
            <input
              type="checkbox"
              id={inputId}
              checked={checked}
              onChange={() => toggle(opt.value)}
              style={{ marginTop: 2, flexShrink: 0, accentColor: "#6ea8fe" }}
            />
            <span style={OPTION_LABEL_STYLE}>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notice (read-only; no input)  →  ui Notice
// ---------------------------------------------------------------------------

function NoticeField({ question }: Pick<FieldProps, "question">) {
  return (
    <Notice>
      {question.body ?? question.help_text ?? question.prompt}
    </Notice>
  );
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

export interface QuestionFieldProps {
  question: FlowQuestion;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  findingsByQuestionId?: Record<string, LintFinding[]>;
}

export function QuestionField({
  question,
  value,
  onChange,
  findingsByQuestionId,
}: QuestionFieldProps) {
  // Findings are associated to questions by id via a caller-supplied map.
  // LintFinding has no questionId field by design (see contracts/lintFinding.ts);
  // the survey<->lint bridge owns the mapping.
  const relevant = findingsByQuestionId?.[question.id] ?? [];

  const labelText = question.prompt ?? question.label ?? question.id;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {question.type !== "notice" && (() => {
        const isGrouped = question.type === "radio" || question.type === "bool" || question.type === "multi_select";
        const labelContent = (
          <>
            {labelText}
            {question.required === true && (
              <span aria-label="required" style={{ color: "#e74c3c", marginLeft: 4 }}>
                *
              </span>
            )}
          </>
        );
        // one-off: grouped fields (radio/bool/multi_select) use <span> not <label>
        // because the Label primitive always renders <label>, which is not valid
        // as a direct wrapper for radiogroup/group role elements. The id attribute
        // is required so aria-labelledby="label-{id}" on the control group resolves.
        return isGrouped ? (
          <span
            id={`label-${question.id}`}
            style={{
              display: "block",
              fontSize: 13,
              color: "#e6edf3",
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            {labelContent}
          </span>
        ) : (
          <Label id={`label-${question.id}`} htmlFor={question.id} required={question.required === true}>
            {labelText}
          </Label>
        );
      })()}

      {question.help_text !== undefined && question.type !== "notice" && (
        <p style={HELP_STYLE}>{question.help_text}</p>
      )}

      {question.type === "text" || question.type === "short_text" ? (
        <TextFieldControl question={question} value={value} onChange={onChange} />
      ) : question.type === "autocomplete" ? (
        <AutocompleteField question={question} value={value} onChange={onChange} />
      ) : question.type === "select" ? (
        <SelectField question={question} value={value} onChange={onChange} />
      ) : question.type === "radio" ? (
        <RadioField question={question} value={value} onChange={onChange} />
      ) : question.type === "bool" ? (
        <BoolField question={question} value={value} onChange={onChange} />
      ) : question.type === "multi_select" ? (
        <MultiSelectField question={question} value={value} onChange={onChange} />
      ) : question.type === "notice" ? (
        <NoticeField question={question} />
      ) : null}

      {relevant.length > 0 && (
        <div
          aria-live="polite"
          style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}
        >
          {relevant.map((f, i) => (
            <LintChip key={`${f.code}-${i}`} finding={f} />
          ))}
        </div>
      )}
    </div>
  );
}
