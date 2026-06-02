# keyboard-studio

Browser-based authoring studio for [Keyman](https://keyman.com) keyboards — a survey + show-by-example gallery that lets **language experts** create production-ready Keyman keyboards without writing `.kmn` by hand.

## What it is

Language experts know their language's phonology, orthography, and character inventory — but shipping a keyboard to [`keymanapp/keyboards`](https://github.com/keymanapp/keyboards) today means learning `.kmn` syntax, keeping a half-dozen package files consistent, and satisfying ~200 PR-review criteria. Keyboard Studio removes those mechanical barriers:

- **Plain-language survey** — the user answers questions about their characters and how they behave; they never see `.kmn` syntax.
- **Strategy selection** — the survey computes seven discovery axes and runs a decision tree to choose the right output method (simple swap, deadkey composition, mnemonic spelling, diacritic cycling, context-sensitive clusters, IME callout, …) from a catalog of twelve strategies.
- **Show-by-example gallery** — the recommended strategy's interaction patterns appear as live mini-keyboards the user taps and confirms; each is a validated KMN skeleton with named slots.
- **In-browser compile + validate** — `kmcmplib` (WebAssembly) recompiles every edit in 100–300 ms; a three-layer language-aware lint engine blocks invalid output before it reaches the compiler.
- **Delivery** — a finished keyboard is downloaded as a `.zip` or submitted directly via a GitHub OAuth fork-and-draft-PR.

## Status

**Pre-implementation (as of 2026-06-02).** This repository currently holds the design — there is no application code, build, or test suite yet. The v1.0 spec is signed off; the Day-1 contract-lock session (issues #5, #6, #8) has not yet started.

## Repository layout

| Path | What it is |
|------|------------|
| [`spec.md`](spec.md) | **The source of truth.** The signed-off v1.0 spec (19 sections): system overview, the `Pattern` schema, the strategy-selection engine (§7), data flow, the validator/lint architecture, team boundaries, and resolved decisions. |
| [`docs/spec-signoff.md`](docs/spec-signoff.md) | The review-cycle log and the baked-in decisions (D1–D5). |
| [`Agents/`](Agents/) | Dispatcher stubs for the **LEX crew** — the subagent team (lead, domain expert, programmer, QC, verification, …) used to author and review the design. |
| [`strategy tree/`](strategy%20tree/) | The original standalone `.kmn` strategy reference — now **merged into [`spec.md` §7](spec.md#7-strategy-selection)** and retained only as a stub. |
| [`CLAUDE.md`](CLAUDE.md) | Orientation for working in this repo with Claude Code. |

## Scope (v1)

In scope: physical + touch keyboard layouts, package generation (`.kps`/`.kvks`/`.keyman-touch-layout`), the QWERTY/QWERTZ, AZERTY, and Non-Roman script groups. Out of scope for v1: CJK and Ethiopic reorder patterns, LDML output, predictive-text wordlists, and editing existing keyboards. See [`spec.md` §16](spec.md#16-out-of-scope) for the full list.
