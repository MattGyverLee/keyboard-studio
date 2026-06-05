# Flow YAML — Schema Reference

Flow YAML files define the question sequences that guide a language expert through
the keyboard-studio intake process. There are two related file shapes: **templates**
(question definitions) and **completed instances** (recorded answers).

---

## Template format

A template file defines the questions presented to the user. Each file has a top-level
`flow_id`, optional metadata, and a `questions` list.

```yaml
flow_id: phase_a_identity        # unique identifier for this flow
phase: "A"                       # spec §8 phase letter

# Key outputs (informational comment — not parsed)
# routing_group: derived from layout_family answer
# script_family: derived from script_family answer (non-Roman only)

questions:
  - id: language_name_autonym    # stable snake_case identifier
    prompt: "What is the name of your language in your own language?"
    help_text: >
      Write the name your community uses. This appears on the keyboard package
      exactly as you type it.
    type: text                   # see Types section below
    required: true
    next: language_name_english  # unconditional — always go to this question next
```

### Question fields

| Field | Required | Description |
|---|---|---|
| `id` | yes | Stable snake_case key. Used as `questionId` in completed instances. |
| `prompt` | yes | The question shown to the user. Plain language; no technical jargon. |
| `help_text` | yes | One or two friendly sentences expanding on the prompt. |
| `type` | yes | Input type — see Types below. |
| `options` | when type is `select` or `radio` | List of `{value, label}` pairs. |
| `options_source` | when type is `autocomplete` | Data-source token (e.g. `@langtags_iso639`). |
| `required` | yes | `true` or `false`. |
| `next` | yes | Routing rule — see Branching below. |

### Types

| Type | Description |
|---|---|
| `text` | Free-form single-line text input. |
| `select` | Drop-down with a fixed list of options. |
| `autocomplete` | Searchable list; `options_source` names the data provider. |
| `radio` | Mutually-exclusive option buttons (short lists). |
| `bool` | Yes / No toggle. |

Options are objects with `value` (the stored token) and `label` (the display string).

```yaml
options:
  - value: Latn
    label: "Latin (A, B, C ...)"
  - value: Arab
    label: "Arabic"
```

### Branching (`next`)

**Unconditional** — always proceed to the named question:

```yaml
next: some_question_id
```

**Terminal** — the flow ends here:

```yaml
next: null
```

**Conditional** — a list of rules evaluated top-to-bottom; first match wins.
A `default` catch-all is required and must appear last:

```yaml
next:
  - condition: "value == 'non-roman'"
    goto: script_family
  - condition: "value == 'azerty'"
    goto: layout_family_confirm
  - default: author_display_name
```

`condition` expressions use the current question's answer value. The engine
evaluates them in order; the first matching rule's `goto` target is used.

### Template variables

Some prompts contain `{{variable}}` placeholders that the engine fills at
render time. These are NOT user answers — they come from engine-computed context:

| Variable | Source |
|---|---|
| `{{detected_group}}` | Auto-detected routing group from Phase A heuristics (spec §9). |
| `{{language_name}}` | The `language_name_autonym` answer from earlier in the same flow. |

Do not put template variables in `id` fields or `value` fields — only in `prompt`
and `help_text` strings.

---

## Completed-instance format

A completed instance records the answers a user gave for a specific keyboard project.

```yaml
flow_id: phase_a_identity   # must match the template's flow_id
phase: "A"

answers:
  - questionId: language_name_autonym   # matches question id in template
    value: "Fà'"
  - questionId: language_name_english
    value: "Bafut"
  # ... one entry per question that was shown to the user

# Computed from answers (informational — not part of SurveyAnswer[]):
computed_axes:
  scriptClass: alphabetic
routing_group: qwerty-qwertz   # RoutingGroup value derived from layout_family answer
```

The `answers` array is compatible with `SurveyAnswer[]` from `packages/contracts`:
each entry has exactly `questionId` (string) and `value` (string). No extra fields.

Questions that were not shown (because a branch skipped them) are omitted from
the array entirely.

The `computed_axes` and `routing_group` fields below the answers array are
informational — they document what the engine computed from the answers but are
not part of the `SurveyAnswer` contract.

---

## Provenance section

Templates may include an optional `provenance_questions` block after the main
`questions` list. These questions map to `KeyboardProvenance` fields in
`packages/contracts/src/provenance.ts` and are always `required: false`.
The studio presents them as a clearly-marked optional section.

Provenance data is serialized into the GitHub PR body and package metadata at
output time (spec §12). It is never written into the `.kmn` source file.

---

## Files in this directory

| File | Shape | Description |
|---|---|---|
| `phase_a_identity.yaml` | Template | Phase A identity and routing questions (spec §8 step 3). |
| `_examples/phase_a_bafut.yaml` | Completed instance | Hypothetical Bafut keyboard — shows expected answer shape. |

---

## Relationship between template and example

`_examples/phase_a_bafut.yaml` is a filled-in instance of `phase_a_identity.yaml`.
The `questionId` values in the example's `answers` array map 1:1 to the `id`
fields in the template. The example also shows the `routing_group` and
`script_family` values that the engine derives from the answers.
