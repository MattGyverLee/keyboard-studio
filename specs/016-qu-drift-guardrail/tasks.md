# Tasks: Drift guardrail — CI bijection between the rendered graph and manifest + questionRegistry runtime reach

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Branch**: `speckit/question-unification-phase1-specs`

> Phase-1 invariants apply to every task: **no new write routing, no contracts bump, no flag flip, behavior byte-identical.** This is a test-only spec. Each task is small and testable; the verification tasks come last (per §2.5 test strategy).

## Group A — Prerequisites & decisions

- [ ] **T001** Confirm spec `015-qu-map-projection` is landed and stable: the `StepGraph`→`FlowGraph`/`GraphNode` adapter over `buildManifestStepGraph()` and the `buildModularFlowGraph` drill-downs keyed by `questionRegistry` exist and `DashboardView` consumes them. **Upstream-015 blocker (not yet satisfied):** 015 is not landed — no adapter exists and `DashboardView` builds the flow section from `FLOW_SOURCES` only, never calling `buildManifestStepGraph`, so this assumption is currently false. The guardrail cannot be WRITTEN until 015 lands the adapter + projection, 015 DEC-001 (adapter shape) is finalized, and the D2a shared rendered-set helper exists (see T003). (Dependency — the rendered graph must exist first.)
- [x] **T002** **RESOLVED (D1, 2026-06-29, Matthew Lee / km-lead panel):** the guardrail lives in **its OWN co-located file in the dashboard tree** (`dashboard/driftGuardrail.test.ts`, beside `completeness.test.ts`) and **imports `buildManifestStepGraph` directly** via the 015 adapter. A separate file (not an addition to `buildStepGraph.test.ts`) keeps the distinction from the C8/C9 tautology (`:323-356`) structural rather than reader-discipline. Depcruise-safe — confirmed empirically: baseline 451 modules / 1357 deps, unchanged by a probe test importing `buildManifestStepGraph`, because `.dependency-cruiser.cjs:123-126` (`\.test\.[tj]sx?$`) excludes test files from analysis. FR-010 reading ratified: `dashboard/` is "the established guard tree" (`manifest.test.ts` in `steps/`, `completeness.test.ts` in `dashboard/` — not a single folder). **Post-015 re-run gate:** with the new test file present, `pnpm install && pnpm depcruise` must stay green.
- [x] **T003** **RESOLVED (D2 = D2a, 2026-06-29, Matthew Lee / km-lead panel):** obtain "the node set the dashboard actually renders" by **re-running the EXACT builders `DashboardView` composes in-test** — the 015 adapter over `buildManifestStepGraph()` ∪ `buildModularFlowGraph` over `FLOW_SOURCES` — collecting node ids and feeding the pure helper (T008). **Do NOT re-derive the builders.** D2b (snapshot `DashboardView`) is rejected (couples to view internals, no fidelity gain). **D2a precondition (upstream-015 dependency, handoff to the 015 owner — 015 DEC-001 open):** the rendered-set composition (015 adapter output ∪ `buildModularFlowGraph(FLOW_SOURCES)` drill-down ids) MUST be factored into ONE shared exported function consumed by BOTH `DashboardView` and the guardrail; otherwise 016 re-derives it and the guardrail becomes a second, drifting composition. Any such helper lives in `dashboard/`, imports only `steps/` + `survey/` leaves (no `stores/`/`editors/`), and is itself analyzed by depcruise. **Post-015 re-run gate:** `pnpm install && pnpm depcruise` must be green on that non-test shared helper.

## Group B — Build the two node sets (helpers)

- [ ] **T004** Obtain the **rendered node-id set** per D2a (T003): consume the **shared exported rendered-set helper** (the D2a precondition, landed by 015) that returns the 015 spine adapter output over `buildManifestStepGraph()` PLUS the `buildModularFlowGraph` drill-down node ids keyed by `questionRegistry`. Import the EXACT builders `DashboardView` composes — do NOT re-derive them. (FR-001, FR-002)
- [ ] **T005** Implement editor-step reachability: `manifest` ids minus `findUnreachable(manifest)` (spine-or-transitive-`joinTarget`, `completeness.ts:475-499`). (FR-007)
- [ ] **T006** Implement survey-question reachability: walk the `buildGraphFromQuestions` edge set (`buildStepGraph.ts:84-112`) from each flow entry using `resolveNext` over `next` / `FlowGotoRule[]` (`survey/SurveyRunner.tsx`); collect reachable `questionRegistry` ids. Do NOT reuse `findUnreachable` here (it is blind to `FlowGotoRule`). (FR-007)
- [ ] **T007** Union the editor-step reach (T005) and survey-question reach (T006) into the **runtime-reach set**. (FR-003)
- [ ] **T008** Factor the bijection check into a **pure function** `(rendered: Set<string>, runtimeReach: Set<string>) => violations` (orphan rendered nodes + uncovered runtime steps), so the negative tests can drive it with injected sets without touching real `manifest`/`registry`. (FR-006, plan §4)

## Group C — Positive guardrail (US1)

- [ ] **T009** Add the positive bijection assertion: `rendered === runtimeReach` as sets, failing with a message naming the orphan/uncovered id. Exclude the reserve/library set (registered-but-unreachable registry ids rendered by `computeReserveNodes`) from both sides. (FR-001, US1 AC-1)
- [ ] **T010** Confirm the guardrail is **distinct from** the C8/C9 block (`buildStepGraph.test.ts:323-356`) and does not modify or re-assert it. (FR-009, FR-012)

## Group D — Per-graph reachability assertions (US3)

- [ ] **T011** Assert both reachability computations run and contribute to the union (editor-steps via `findUnreachable`; survey questions via `resolveNext`). (FR-007, SC-004)
- [ ] **T012** Assert `pb_build_list` (build-list branch reached via the mandatory IntroChooser gate, `PhaseB.tsx` ~`744`) is verified in the **question** graph via `resolveNext`, not the manifest graph. (FR-008, SC-005)

## Group E — Negative tests (US2)

- [ ] **T013** Negative test N1: inject a synthetic **uncovered manifest step** (reachable per `findUnreachable`, no registry/YAML coverage, no rendered drill-down) into a guardrail-local clone; assert the bijection helper (T008) reports it RED. (FR-004, SC-002)
- [ ] **T014** Negative test N2: inject a synthetic **orphan `questionRegistry` id** (reachable, no rendered node) into a guardrail-local clone; assert the bijection helper reports it RED. (FR-005, SC-003)
- [ ] **T015** Assert the injections are **local** (real `manifest`/`registry` untouched) and that removing them returns the helper to GREEN against real data. (FR-006)

## Group F — Verification (last, per §2.5)

- [ ] **T016** Run studio/contracts `vitest`: the new guardrail is GREEN on unmodified `main`; the negative tests assert RED on injection. (SC-001, SC-007)
- [ ] **T017** Run `pnpm typecheck` — green. (SC-007)
- [ ] **T018** Run `pnpm depcruise` — green; the test introduces no new forbidden dependency boundary (dashboard stays store-free). Per D1, the direct `buildManifestStepGraph` import from the new test file is excluded from analysis (`.dependency-cruiser.cjs:123-126`), confirmed empirically (451 modules unchanged). Per D2a, the non-test shared rendered-set helper (a 015 deliverable, `dashboard/`, importing only `steps/` + `survey/` leaves) must also pass depcruise. **Post-015 re-run gate** (T002/T003). (SC-007)
- [ ] **T019** Confirm Phase-1 invariants: no contracts change, no flag flip, no write-routing change; flag-off / runtime / render output byte-identical to pre-016 (only diff is the added test + any D2 test-only helper). (FR-011, SC-008)
- [ ] **T020** Confirm the guardrail catches the §1 drift the C8/C9 tautology cannot — i.e. the negative tests go RED in a scenario where `buildStepGraph.test.ts:323-356` would stay green. (FR-009, SC-006)
