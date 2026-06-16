# Tasks: Defaults engine (propose-then-confirm proposers)

**Input**: Design documents from `specs/002-defaults-engine/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/proposers.md](contracts/proposers.md)

**Tests**: Included. The repo convention is that every engine module and survey question module ships with a colocated `*.test.ts` (vitest), the contract drift-guards are test-enforced, and each user story in the spec defines an "Independent Test". Test tasks are therefore generated per story, scoped to the success criteria (SC-001…SC-006).

**Organization**: Tasks grouped by user story (US1–US5) for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 (maps to spec.md user stories). Setup/Foundational/Polish carry no story label.
- Team owner noted where the §12 split applies: **Engine** owns proposers/langtags/audit/SPA wiring; **Content** owns the welcome.htm narrative prompt + survey copy.

## Reuse map (avoid duplication — verified against the codebase)

Do **not** recreate these; wire to / extend them:

- `SurveyRunner.getSeedValue` (`packages/studio/src/survey/SurveyRunner.tsx`) — the proposal value channel ("default once, then user owns it"). Do not add a second seed mechanism.
- `mergePhaseResults` (`packages/contracts/src/surveySession.ts:97`) — already spreads `computedAxes`; extend the same reducer for `axisFills`.
- `LintFinding` (`packages/contracts/src/lintFinding.ts`), `LintChip` + `lintToQuestion.ts` (`packages/studio/src/lint/`) — the warning-band finding type and its renderer; reuse for FR-013 and the provenance chip.
- `scripts/fetch-kmcmplib.mjs` + `scripts/kmcmplib-version.json` + the `prebuild` chain (`package.json:13`) — the pinned-fetch pattern langtags copies.
- `loadExemplars` / `CldrLoader` (`packages/engine/src/character-discovery/cldr.ts`) — autonym CLDR fallback; inventory anchor.
- `producedGlyphs` (`packages/engine/src/inventory/producedGlyphs.ts`), `effectiveMechanisms` / `MechanismAssignment` (`packages/contracts/src/assignmentMap.ts`, `source:"discus-suggested"`) — help table + advisory signals; proposed assignments already have a `discus-suggested` discriminant.
- `resetIdentity` / `sanitizeDisplayName` (`packages/engine/src/scaffolder/`) — display-name application.
- `scriptClassOf` / `routingGroupOf` / `deriveScriptPrefill` (`packages/studio/src/lib/scriptAxes.ts`) — Phase C′ routing; **relocate to engine** in US4 (engine cannot import studio), re-export from studio.
- Existing Phase A/B/F **question modules** (`packages/studio/src/survey/questions/{a,b,f}/…` — e.g. `pa_copyright_holder`, `language_name_autonym`, `author_display_name`, `pa_primary_target`, `provenance_regions`) — wire proposals to these; do not add new question modules.
- `schemas.ts` drift-guard idiom (`Expect<AssignableTo<z.infer<typeof X>, T>>`, `packages/contracts/src/schemas.ts:233`) — new schemas follow it.

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Create the proposer subsystem skeleton: empty barrels `packages/engine/src/proposers/index.ts` and `packages/engine/src/proposers/context.ts`, plus the studio adapter dir `packages/studio/src/survey/proposals/`. Add `proposers` and `langtags` to the engine subsystem list in [CLAUDE.md](CLAUDE.md) (inventory accuracy).
- [ ] T002 [P] Pin + fetch langtags.json: add `scripts/langtags-version.json` (URL + SHA-256, mirroring `kmcmplib-version.json`), add `scripts/fetch-langtags.mjs` (clone of `scripts/fetch-kmcmplib.mjs`), and wire `"fetch-langtags"` into the `prebuild` script in `package.json` alongside `fetch-kmcmplib`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: Blocks ALL user stories. These are the proposal primitive, the context, the dispatcher, the langtags loader, and the studio seed/provenance wiring that every story consumes.

- [ ] T003 [P] [contracts] Define `DefaultProposal`, `ProvenanceLabel` (closed source enum per research R5), and `NoDefaultDecision` in `packages/contracts/src/defaultProposal.ts`; re-export from `packages/contracts/src/index.ts`.
- [ ] T004 [contracts] Add zod mirrors `DefaultProposalSchema`, `ProvenanceLabelSchema`, `NoDefaultDecisionSchema` to `packages/contracts/src/schemas.ts` with drift guards following the `Expect<AssignableTo<…>>` idiom (T003 must exist first; same-commit drift-guard rule).
- [ ] T005 [P] [contracts] Unit test the new types + schemas in `packages/contracts/src/defaultProposal.test.ts` (every `DefaultProposal` requires a `ProvenanceLabel`; `confidence` ∈ [0,1]; schema accepts/rejects fixtures).
- [ ] T006 [engine] Implement the langtags loader `resolveLangtags(bcp47): LangtagsEntry | undefined` in `packages/engine/src/langtags/index.ts`, consuming the fetched pinned data from T002; export `LangtagsEntry`.
- [ ] T007 [P] [engine] Unit test `resolveLangtags` in `packages/engine/src/langtags/index.test.ts` (resolves a known `localname`; returns `undefined` for an unattested tag).
- [ ] T008 [engine] Define `ProposerContext` and its assembler in `packages/engine/src/proposers/context.ts` — reads `ir`, `identity`/`bcp47`, `producedGlyphs(ir)`, `assignments`, merged `axes`, `confirmedInventory`, optional `authIdentity`, and `resolveLangtags` result (per data-model.md).
- [ ] T009 [engine] Implement the `propose(phase, ctx): ProposerResult` dispatcher and the `ProposerResult` shape in `packages/engine/src/proposers/index.ts` (fan-out registry; returns empty until per-phase proposers register in US phases).
- [ ] T010 [studio] Implement the proposal adapter in `packages/studio/src/survey/proposals/adapter.ts`: maps a `ProposerResult` to `getSeedValue(questionId)` (value channel) and `getProvenance(questionId)` (sibling provenance/hinted-prompt lookup); consumes the working-copy store for context. Reuses `SurveyRunner.getSeedValue` — adds no second seed mechanism.
- [ ] T011 [studio] Add the `ProvenanceChip` component (`packages/studio/src/survey/proposals/ProvenanceChip.tsx`) reusing the `LintChip` visual vocabulary at `info`/`hint` band, and render it beside the field in `packages/studio/src/survey/QuestionField.tsx`; render a `NoDefaultDecision.hintedPrompt` as placeholder text, never an empty box.

**Checkpoint**: Proposal primitive + context + dispatcher + studio wiring ready — per-phase proposers can now register.

---

## Phase 3: User Story 1 — Identity phase is never a blank form (P1) 🎯 MVP

**Goal**: Phase A copyright, autonym, and display name arrive as provenance-labeled, editable proposals — no empty field in the common case.

**Independent Test**: Run Phase A for a langtags-resolvable BCP47 tag on the GitHub path; confirm copyright (you/org), autonym, and display name are pre-populated with visible provenance and need only confirmation.

- [ ] T012 [P] [US1] Implement `proposeAutonym(ctx)` in `packages/engine/src/proposers/identity/autonym.ts`: langtags `localname` → CLDR (`loadExemplars`/locale display name) → `NoDefaultDecision` hinted prompt; labels the producing source (FR-003). Conflicting sources → higher-coverage proposed, alternative in `alternatives` (edge case).
- [ ] T013 [P] [US1] Implement `proposeCopyright(ctx)` in `packages/engine/src/proposers/identity/copyright.ts`: structured you/org choice; *you* seeds `authIdentity` → `KeyboardProvenance` representative → hinted prompt; never asserts submitter as holder (FR-002); ZIP path (no `authIdentity`) edge case.
- [ ] T014 [P] [US1] Implement `proposeDisplayName(ctx)` in `packages/engine/src/proposers/identity/displayName.ts`: surface the scaffolder's provisional value (English-name-seeded) as an editable confirmation, passing through `sanitizeDisplayName` (FR-004).
- [ ] T015 [US1] Register the three Phase A proposers in the `propose()` dispatcher (`packages/engine/src/proposers/index.ts`) under phase `"A"` (depends on T012–T014).
- [ ] T016 [US1] Wire Phase A proposals to the **existing** question modules (`pa_copyright_holder`, `language_name_autonym`, `author_display_name`) through the adapter where Phase A renders (`SurveyView`/Phase A in `packages/studio/src/`); add no new question modules.
- [ ] T017 [P] [US1] Tests: `autonym.test.ts`, `copyright.test.ts`, `displayName.test.ts` in `packages/engine/src/proposers/identity/` covering the source-order fallbacks and every edge case (no autonym, ZIP no-auth, conflicting sources). Assert no proposal lacks a `ProvenanceLabel` (SC-003) and Phase A yields no blank in the common case (SC-002).

**Checkpoint**: MVP — Phase A is propose-then-confirm end to end.

---

## Phase 4: User Story 2 — Help documentation writes its own first draft (P1)

**Goal**: Phase F `welcome.htm` opens with a deterministic skeleton (title, autonym, character→keystroke table) plus an editable narrative — no blank canvas.

**Independent Test**: Complete A–E for a multi-special-character keyboard, open Phase F; confirm the body has a char→keystroke table matching the assignment map and an editable narrative.

- [ ] T018 [P] [US2] Implement `proposeHelpSkeleton(ctx)` in `packages/engine/src/proposers/help-skeleton/index.ts`: deterministic title + language/autonym line + character→keystroke table from `confirmedInventory` × `effectiveMechanisms()` (FR-009; keystroke rows never model-generated).
- [ ] T019 [US2] Register Phase `"F"` in the `propose()` dispatcher (depends on T018).
- [ ] T020 [US2] Render the skeleton as an editable draft in `packages/studio/src/survey/PhaseF.tsx` (skeleton always present; bind edits to the existing Phase F answer flow).
- [ ] T021 [US2] **[Content]** Optional narrative embellishment via `@keyboard-studio/llm`: a narrative-only prompt around the fixed skeleton, with a graceful no-backend skip (skeleton stands alone — today's default path). Keystroke instructions excluded from the prompt.
- [ ] T022 [US2] Regenerate the secondary help format deterministically from the confirmed content at finalize so body+style stay in parity (FR-009 / acceptance #2).
- [ ] T023 [P] [US2] Test `help-skeleton/index.test.ts`: the keystroke table matches the assignment map exactly (SC-004); body non-empty for ≥1 special character; no-backend path still produces the skeleton.

**Checkpoint**: US1 + US2 both independently functional.

---

## Phase 5: User Story 3 — Advisory survey questions arrive pre-answered (P2)

**Goal**: Coexisting-keyboards and primary-use-case questions arrive pre-proposed from region/axis signals, non-gating.

**Independent Test**: Run Phase B for a region-bearing tag; both advisory questions are pre-proposed and remain skippable.

- [ ] T024 [P] [US3] Implement `proposeCoexisting(ctx)` in `packages/engine/src/proposers/advisory/coexisting.ts`: derive likely coexisting keyboards from the BCP47 region + provenance regions cross-checked with Q1; default the "only keyboard?" sub-question from the region signal; **no** OS/browser layout-detection claim (FR-005); region-absent edge case → hinted, non-blank.
- [ ] T025 [P] [US3] Implement `proposeUseCase(ctx)` in `packages/engine/src/proposers/advisory/useCase.ts`: pre-select the most likely use case from A1 scale + region/speaker-count + Q1 (FR-006); proposal is a seed only.
- [ ] T026 [US3] Register the Phase `"B"` advisory proposers and wire them to the existing advisory question modules (e.g. `pa_primary_target`, coexisting-keyboards question); enforce non-gating in the phase-exit audit (never blocks exit).
- [ ] T027 [P] [US3] Tests `coexisting.test.ts` / `useCase.test.ts` in `packages/engine/src/proposers/advisory/`: region-derived defaults, region-absent degradation, and that neither proposal blocks a phase exit.

**Checkpoint**: US1–US3 independently functional.

---

## Phase 6: User Story 4 — Technical-phase defaults pre-selected (P2)

**Goal**: Phase C′ reorder is pre-selected/ranked from script family; Phase E touch-layer ids auto-derived.

**Independent Test**: Phase C′ for an Indic abugida pre-selects the canonical reorder with provenance; Phase E auto-names modifier-derived layers, prompting only for an author-added plane.

- [ ] T028 [US4] **Relocate (don't duplicate)** `scriptClassOf` / `routingGroupOf` / `deriveScriptPrefill` from `packages/studio/src/lib/scriptAxes.ts` into a shared engine module (`packages/engine/src/proposers/reorder/scriptRouting.ts` or similar) and re-export from `studio/src/lib/scriptAxes.ts` so engine and studio share one source (engine cannot import studio). Keep `Prefill.tsx` working via the re-export.
- [ ] T029 [P] [US4] Implement `proposeReorder(ctx)` in `packages/engine/src/proposers/reorder/index.ts`: use the relocated routing to pre-select + rank the script family's canonical reorder with `derived-from-axis` provenance (FR-007); no forced pre-selection when a family has no convergent reorder (edge case); never silently override abugida/abjad convention.
- [ ] T030 [P] [US4] Implement `proposeTouchLayers(ctx)` in `packages/engine/src/proposers/touch-layers/index.ts`: auto-derive standard layer ids from the modifier→layer mapping; only an author-added non-modifier plane gets a hinted-default name (FR-008).
- [ ] T031 [US4] Register Phase `"C-prime"` and `"E"` in the dispatcher and wire to the reorder gallery (ranked pre-select + swap) and the touch-layout scaffold (auto-naming) in the studio (depends on T029, T030).
- [ ] T032 [P] [US4] Tests `reorder/index.test.ts` (canonical pre-select + ranking + no-convergent edge case) and `touch-layers/index.test.ts` (modifier ids auto-derived; non-modifier plane hinted); plus a regression test that studio's `scriptAxes` re-export is unchanged after T028.

**Checkpoint**: US1–US4 independently functional.

---

## Phase 7: User Story 5 — Every proposal is auditable, and blanks are caught (P3)

**Goal**: `axisFills` records the origin of each filled discovery axis; the phase-exit defaults-audit flags a derivable-but-blank decision point as a yellow-band defect.

**Independent Test**: Inspect proposals for provenance; complete a survey and recover each axis fill's origin from `SurveySession.axisFills`; force a derivable field blank and confirm it is flagged at phase exit.

- [ ] T033 [P] [US5] Define `AxisFill` in `packages/contracts/src/axisFills.ts` (axis key, value, `origin`, optional `provenance`); re-export from `index.ts`; add `AxisFillSchema` + drift guard to `schemas.ts`; test in `axisFills.test.ts`.
- [ ] T034 [US5] Add optional `axisFills?: AxisFill[]` to `SurveyPhaseResult` (`packages/contracts/src/surveyPhaseResult.ts`) and extend `mergePhaseResults` (`surveySession.ts`) to merge it onto `SurveySession.axisFills` — mirror the existing `computedAxes` spread reducer; update its schema mirror (depends on T033). Additive only — no rename/removal.
- [ ] T035 [US5] Have the proposers emit `AxisFill` entries (origin + provenance) for the axes they fill, surfaced through `ProposerResult.axisFills` and recorded into the phase result (FR-011 / SC-005).
- [ ] T036 [P] [US5] Implement `auditPhaseDefaults(phase, ctx, answers): LintFinding[]` in `packages/engine/src/proposers/audit.ts`: recompute `propose()`, emit a `warning`-severity `LintFinding` for any non-null proposal whose answer is blank; a blank `NoDefaultDecision` is **not** flagged (FR-013). Runs at phase exit only — no debounce timer.
- [ ] T037 [US5] Run the audit at phase transition in the studio and surface findings via the existing `lintToQuestion` → `LintChip` path (yellow band); block silent acceptance of a flagged phase exit (depends on T036).
- [ ] T038 [P] [US5] Tests: `audit.test.ts` (derivable-blank → warning; `NoDefaultDecision` blank → no finding), `surveySession.test.ts` extension (axisFills merge last-wins), and an end-to-end recoverability assertion that every filled axis's origin is present after a completed survey (SC-005, SC-006).

**Checkpoint**: All user stories independently functional; the §3a guarantee is enforceable.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T039 [P] Update [docs/architecture.md](../../docs/architecture.md) with the proposer layer (engine subsystem + studio adapter + audit) and confirm the engine-subsystem inventory edit in [CLAUDE.md](CLAUDE.md) from T001 is accurate.
- [ ] T040 Run `pnpm depcruise` and confirm the team-split / dependency-root fitness functions pass (engine does not import studio after the T028 relocation; contracts stays the root).
- [ ] T041 Run the [quickstart.md](quickstart.md) scenarios US1–US5 and record pass/fail against SC-001…SC-006; run `pnpm typecheck` + `pnpm -r test`.

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)** → no deps.
- **Foundational (P2)** → depends on Setup; **blocks all user stories**. Within it: T003 → T004 → T005; T006 → T007; T008/T009 after T003; T010/T011 after T009.
- **US1 (P3)** → after Foundational. **MVP.**
- **US2 (P4)**, **US3 (P5)**, **US4 (P6)** → each after Foundational; independent of US1 and of each other (different proposer files + different phases). US4 has an internal first step (T028 relocation) before T029/T031.
- **US5 (P7)** → after Foundational for the audit (T036/T037); its `axisFills` recording (T035) is most meaningful once proposers from US1–US4 exist, but the type/merge/audit are independently testable.
- **Polish (P8)** → after the desired stories.

### Within each user story
- Proposer implementation [P] (different files) → dispatcher registration (shared `index.ts`, not [P]) → studio wiring → story tests.

### Parallel opportunities
- T002 ∥ T001 tail; T005 ∥ T007; the three identity proposers T012/T013/T014 ∥; T024 ∥ T025; T029 ∥ T030; all `*.test.ts` tasks within a story ∥.
- After Foundational, US2 / US3 / US4 can be staffed in parallel by different developers (disjoint files); US1 is the MVP and should land first to validate the pattern.

---

## Implementation Strategy

**MVP** = Setup + Foundational + **US1** (Phase A identity). Stop and validate: Phase A confirms-not-types in the common case (SC-002), every pre-fill is provenance-labeled (SC-003). Then deliver US2 (help draft), US3 (advisory), US4 (technical defaults) incrementally, and US5 last to make the guarantee auditable and enforceable across all of them.

## Notes
- [P] = different files, no incomplete-task dependency.
- All contract additions are **additive/optional** — no `Pattern`/`PatternQuestion` change (the typed `defaultSource` discriminator is out of scope). Each new type lands with its zod mirror in the same commit.
- No second debounce timer and no new lint severity — the audit reuses `LintFinding`/`LintChip` at phase exit.
- Commit per task or logical group, prefix `feat(engine|studio|contracts): …` per the house vocabulary.
