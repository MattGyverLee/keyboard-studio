# Phase 5 Follow-ups — Handoff Brief

Phase 5 (spec-014) landed the `mutate()` single-IR-write-path seam: a pure, path-scoped, declared-`writes`-contained patch applier (`packages/studio/src/steps/mutateApply.ts`) that is now the canonical IR producer for the carve, add-gallery, question-answer, and touch re-propagation surfaces, all gated by the single build/deploy-time flag `VITE_KM_MUTATE_SEAM` (`packages/studio/src/flags/mutateFlag.ts`), **OFF by default** — when off the codebase runs the byte-identical P4b declared-only paths. The seam is merged (HEAD `493812a`, #825) but unproven in production because no environment ships the flag on. The three workstreams below all sit on top of that seam: **US5** graduates the spine-prefix validator to run against the real `mutate()`-produced working copy, **R6** surfaces touch keys orphaned by a later physical change, and the **flag rollout** is the plan to test/enable/prove the seam and then retire the now-redundant legacy dual paths.

Repo HEAD for this brief: `main` @ `493812a` (includes #822/#823/#825). Spec is **ungated** as of #822 — all three are front-end implementation work.

---

## Workstream 1 — US5: true per-spine-prefix validator projection

### Goal / outcome
- **Before**: `checkSpinePrefixShippability` runs the **real Layer-A validator once over the whole working copy** and strands *every* lock-reaching prefix on any blocking finding. The validator's input (`kmnSource`) is derived from `baseVfs`, **not** from each prefix's `mutate()`-produced IR. The per-prefix granularity promised by FR-017 / US5 AC-1 is a documented proxy, not real.
- **After**: each spine prefix's `mutate()`-produced working copy is projected to KMN and validated *as that prefix*, so a blocking finding strands **only the prefixes at/after the point the defect was introduced** — not the whole spine — all still inside the single `useValidator` debounce cycle (V3).

### Current state (file:line)
- `packages/studio/src/dashboard/completeness.ts:363` `checkSpinePrefixShippability(manifest, wc, findings)`. The real-validator signal is computed **once, whole-WC**: line 374 `const wcHasBlockingFinding = findings.some(isBlockingFinding);` and the explicit deferral comment at **371–373**: *"the validator output is whole-WC, not per-prefix — single-prefix/current-WC granularity, US5 lead default."* Every lock-reaching prefix shares that one boolean (line 393: `if (reachedLock && wcHasBlockingFinding) inconsistent = true;`).
- Blocking rule: `isBlockingFinding` at `completeness.ts:323` (`origin !== "upstream"` AND `severity === "error" | "fatal"`).
- The findings come from the single debounce cycle: `packages/studio/src/hooks/useValidator.ts:18` `useValidator(kmnSource)` → one `useDebounce(kmnSource, DEBOUNCE_MS)` (line 22) → `validateWithOracle` (line 38). There is exactly **one** call site: `StudioShell.tsx:549` `const { findings } = useValidator(kmnSource);`, where `kmnSource` is derived from `baseVfs` (`StudioShell.tsx:542–548`) — i.e. the *base*, not any mutate-produced prefix WC.
- The store bridge that lets the sibling `StudioShell` reach those findings without a second hook: published at `StudioShell.tsx:558–560` (`setValidatorFindings(findings)`), stored in the `validatorFindings` slice (`workingCopyStore.ts:246`, setter `setValidatorFindings` at `:745` with reference-equality guard), and consumed at the single `runCompleteness` call site `StudioShell.tsx:1120–1129`.
- Engine validator entry points: `validateWithOracle` (`packages/engine/src/validator/oracle.ts:233`, async, TS + WASM concurrently in one cycle) and `runAllChecks` (`packages/engine/src/validator/index.ts:39`, sync). IR→KMN emit is `emit(ir)` at `packages/engine/src/codec/emit.ts:513`.
- V3 is pinned structurally by `packages/studio/tests/dashboard/articleIVProbe.test.ts`: `completeness.ts` must not import `validateWithOracle`/`runAllChecks` and must contain **no** `setTimeout`/`useDebounce`/`async`/`Promise`/`await` in executable code; exactly one `useValidator` call site and one `runCompleteness` call site.

### Approach
The hard constraint: **one debounce, one validation path** (V3). We cannot fan out N async `validateWithOracle` calls (one per prefix) behind N timers. Two viable designs — flag the choice with Matt (Open decision A):

1. **Per-prefix projection inside the single cycle (recommended).** Extend `useValidator` (or a thin sibling that reuses *the same* `useDebounce(...)` output — no new timer) so that on each settled cycle it:
   - reconstructs each lock-reaching spine prefix's `mutate()`-produced IR by replaying the in-scope `MutateRequest`s up to that prefix against the working IR (the same `applyStepCompletion` / `applyMutatePatch` path the reducer uses), then `emit(prefixIr)` (`emit.ts:513`) to KMN;
   - runs the validator **concurrently within the one debounced tick** (`Promise.all` over `validateWithOracle(prefixKmn)`), exactly mirroring how `validateWithOracle` already runs TS+WASM concurrently in a single cycle — this adds parallel *work inside* the existing path, not a second debounce timer/path. Confirm with Matt whether this satisfies the V3 probe's intent or trips its `Promise`/`async` regex in `useValidator.ts` (the probe currently only forbids that machinery in `completeness.ts`, not `useValidator.ts` — see articleIVProbe `codeOnly` scope).
   - publishes a `Map<prefixIndex, LintFinding[]>` (or `LintFinding[]` tagged with the prefix index) into a **new store slice** (e.g. `validatorFindingsByPrefix`) alongside the existing `validatorFindings`, via the same reference-equality-guarded setter pattern as `setValidatorFindings` (`workingCopyStore.ts:745`).
   - `checkSpinePrefixShippability` then consumes the per-prefix findings: replace the single `wcHasBlockingFinding` boolean (line 374) with a per-`i` lookup, keeping the structural lock-consistency proxy (a)/(b) intact and the `reachedLock` gate. The function stays **pure and validator-free** so the articleIVProbe still passes.

2. **Cheaper incremental fallback.** If full per-prefix projection is too costly, keep one whole-WC validation but **attribute** each blocking finding to the earliest prefix whose `writes` could have produced the offending IR location (map `finding → IRPath → producing step → spine index`), stranding only prefixes at/after that index. No extra emit/validate work; weaker fidelity. Likely the right MVP if Matt wants minimal risk.

Either way: the projection MUST be byte-faithful to the reducer's seam (reuse `applyStepCompletion`/`applyMutatePatch`, never re-derive ad hoc), and **flag-off MUST stay the pure structural proxy** — `validatorFindings` defaults to `[]` (and any new slice to empty), preserving the documented P4b/flag-off byte-identity (`completeness.ts:357–358`).

### Files to touch
- `packages/studio/src/dashboard/completeness.ts` — `checkSpinePrefixShippability` (per-prefix consumption), `runCompleteness` signature, `CompletenessReport`.
- `packages/studio/src/hooks/useValidator.ts` — per-prefix projection inside the one cycle (design 1) **or** unchanged (design 2 attributes downstream).
- `packages/studio/src/StudioShell.tsx` — `kmnSource`/projection wiring (542–560), `runCompleteness` call (1120–1129).
- `packages/studio/src/stores/workingCopyStore.ts` — new per-prefix findings slice + setter (mirror `validatorFindings`/`setValidatorFindings`).
- `packages/studio/src/dashboard/DashboardView.tsx:247–260` — show *which* prefixes failed and why (heading currently says "structural proxy"; update copy).
- Possibly a small `steps/`-layer helper to project a prefix IR (reuse `emit` from engine).

### Edge cases & risks
- **V3 / Article IV (FR-018)** is the dominant risk: any new timer or parallel *path* fails `articleIVProbe.test.ts`. Concurrent work *inside* the single cycle is the seam; get Matt's read on whether design 1 trips the probe before building.
- A prefix before any lock step is shippable by the base-template guarantee (`completeness.ts:344–345`); don't strand it on a current-WC finding.
- **V2 (FR-018)**: shippability must stay distinct from C5 inputs-satisfiability (`checkInputsSatisfiable`, `completeness.ts:419`).
- `validateWithOracle` surfaces `KM_WARN_ORACLE_UNAVAILABLE` and the synthetic `VALIDATOR_ERROR_FINDING` (`useValidator.ts:48`) on WASM-down — per-prefix fan-out must not turn one oracle-down into N spurious strandings.
- Projection cost: N prefixes × (emit + WASM validate) per keystroke-debounce could be heavy; memoize per (prefix, IR-hash).

### Test strategy & acceptance criteria
- **SC-009 / V1**: real per-prefix validator passes base-template-derived prefixes and **flags a deliberately broken prefix** (extend `completeness.test.ts`). 
- **SC-009 / V3**: `articleIVProbe.test.ts` still green; extend it to assert the new projection path adds no second `useDebounce`/timer.
- **V2**: a fixture where a prefix satisfies all inputs yet carries a blocking finding (and vice versa) resolves differently in C4 vs C5.
- Done when: a broken-at-prefix-k fixture strands prefixes ≥ k only, base-template prefixes pass, flag-off is byte-identical (empty slice ⇒ structural proxy), and all probes pass.

### Open decisions (confirm with Matt)
- **A.** Design 1 (true per-prefix projection inside the cycle) vs design 2 (whole-WC + finding→prefix attribution). Load-bearing; determines scope.
- **B.** Does concurrent per-prefix `validateWithOracle` inside the single debounced tick honor V3's intent, or must we serialize / cap N?
- **C.** Is per-prefix granularity required for the rollout, or is the current whole-WC graduation acceptable for v1 with per-prefix as a fast-follow?

---

## Workstream 2 — R6: surfacing orphaned `hand-set` touch keys

### Goal / outcome
- **Before**: when a later physical change removes the base key a `hand-set` touch key depended on, re-propagation **correctly does not delete it** (no-clobber wins) — but the now-orphaned key is **invisible to the author**: nothing flags it.
- **After**: the dashboard/completeness surface lists each orphaned `hand-set` key (id + location) as an advisory issue the author can act on, **without any auto-deletion** (no-clobber still wins).

### Current state (file:line)
- The no-clobber merge keeps overwritable keys whose suggestion vanished as-is and never deletes `hand-set` keys: `packages/studio/src/steps/repropagate.ts:86` `mergeNoClobber`, with the R6 behavior at **:78–80** (orphaned derived key not auto-deleted) and **:113–116** (overwritable-but-no-suggestion → keep). The R6 contract intent is stated at **:19** (*"orphaned hand-set keys are NOT auto-deleted (dashboard concern)"*).
- `isOverwritable` (`repropagate.ts:65`): only `base-derived`/`physical-suggested` are overwritable; `hand-set` and absent/undefined provenance are protected (FR-009).
- Provenance model: `TouchKeyProvenance` and `TouchKeyIR.provenance?` at `packages/contracts/src/keyboard-ir.ts:78` and `:84` (`provenance` is optional/additive; absent ⇒ treated as `hand-set`).
- Touch keys live at `touchLayout.platforms[].layers[].rows[].keys[]` (`keyboard-ir.ts:289`, `TouchLayoutIR`), and `touchLayout.nodeIds` maps platform+layer+key id → `IRNodeRef` (`:298–302`) — the bridge from a touch key to the physical/base node it derives from.
- How issues surface today: `CompletenessReport` (`completeness.ts:505`) carries `unshippablePrefixes`, `orphanInputs`, `cycles`, etc.; `DashboardView.tsx` renders each as a section (e.g. orphan inputs at `:262–276`, unshippable prefixes at `:247–260`). **This is the existing pattern an R6 finding should follow** — a new report field + a `DashboardView` section.
- **R6 is currently behavior-only**: nothing detects or surfaces orphans; the contract (`contracts/repropagation.contract.md:18`) and spec (`spec.md:134`) explicitly defer surfacing to the dashboard.

### Approach
1. **Detect orphans (pure, steps/-layer).** Add a pure function (e.g. `findOrphanedHandSetKeys(ir: KeyboardIR): OrphanedTouchKey[]`) that, for each `hand-set` (or untagged) key in `ir.touchLayout`, resolves its backing physical/base node via `touchLayout.nodeIds` (`keyboard-ir.ts:298`) and checks whether that node still exists in the post-re-propagation IR (`groups`/`stores`/the base key set). A key whose backing node is gone is orphaned. Return `{ keyId, platformId, layerId, nodeRef }` per orphan. Keep it pure and dependency-injected like `repropagate.ts` (steps/ may not import stores/).
   - Decide the precise "base removed" signal with Matt (Open decision D): the cleanest is to compare against the same physical decision that drove re-propagation (the staleness closure / removed base key set), since `mergeNoClobber` already runs at that moment.
2. **Surface it (dashboard/completeness pattern).** Add an `orphanedHandSetKeys` field to `CompletenessReport` (`completeness.ts:505`) and populate it in `runCompleteness` (`:589`). Keep `completeness.ts` pure — pass the working IR (or the precomputed orphan list) in as a parameter, like `wc`/`findings`, never importing it. Render a new advisory section in `DashboardView.tsx` mirroring the orphan-inputs block (`:262–276`): list each orphaned key with its location and a note that it was kept (not deleted) because the author hand-set it.
3. **No auto-deletion.** R6 is advisory only. Do not modify `mergeNoClobber`'s keep behavior. Optionally offer a manual "remove" affordance later (out of scope unless Matt asks).

### Files to touch
- `packages/studio/src/steps/repropagate.ts` (or a new `steps/orphanDetect.ts`) — pure orphan detector; reuse `isOverwritable`/provenance semantics.
- `packages/studio/src/dashboard/completeness.ts` — `CompletenessReport` field + `runCompleteness` wiring (pure, IR passed in).
- `packages/studio/src/dashboard/DashboardView.tsx` — new advisory section.
- `packages/studio/src/StudioShell.tsx` — pass the working IR / orphan list into `runCompleteness` (1120–1129).
- Possibly `packages/contracts/src/keyboard-ir.ts` only if a typed orphan shape belongs in contracts (likely keep studio-local).

### Edge cases & risks
- **R2/R6 (FR-009)**: absent/undefined provenance is `hand-set` and protected — orphan detection must include untagged keys, exactly as `isOverwritable` treats them.
- A `physical-suggested` key whose base vanished is **not** an R6 orphan — it's overwritable and re-propagation already handles it (`repropagate.ts:113–116`); don't double-report.
- Flag interaction: re-propagation only runs flag-on (`reducer.ts:228–239`); with the flag off there are no fresh orphans from re-propagation. Decide whether orphan *detection* should run regardless of flag (it's read-only) — likely yes, but confirm.
- `nodeIds` is an entry-array, not a map (`keyboard-ir.ts:302`); resolve carefully.

### Test strategy & acceptance criteria
- Provenance-tagged fixtures (the same Q7 fixtures used for SC-005/SC-006) where a physical change removes a base key under a `hand-set` touch key: assert the key is **kept byte-identical** (R2/SC-005 already holds) **and** appears in `report.orphanedHandSetKeys`.
- Negative: a `physical-suggested` orphan is not reported; an untagged key whose base vanished **is** reported.
- Done when: orphans surface in the dashboard, nothing is auto-deleted, SC-005/SC-006 stay green, and `completeness.ts` stays pure (no stores import; depcruise clean).

### Open decisions (confirm with Matt)
- **D.** The exact "base removed" signal: resolve via `touchLayout.nodeIds` → node existence in the new IR, vs diff against the removed-base-key set from the staleness closure. Load-bearing for detector design.
- **E.** Should orphan detection run flag-off too (read-only) or only flag-on?
- **F.** Advisory-only for v1, or also offer a one-click manual remove? (Default: advisory only.)

---

## Workstream 3 — Validate & roll out the `VITE_KM_MUTATE_SEAM` path

### Goal / outcome
- **Before**: the seam is fully built and gated OFF everywhere; every in-scope surface runs **two** code paths (legacy text/ad-hoc emit + the flag-on seam branch), and no environment has proven the seam on.
- **After**: the seam is proven equivalent-where-it-should-match and correct-where-it-should-differ, the flag is enabled, and the now-redundant legacy dual paths are deleted — one write path remains.

### Current state (file:line)
- Flag: `isMutateSeamEnabled()` reads `import.meta.env.VITE_KM_MUTATE_SEAM === "1"` (`flags/mutateFlag.ts:30–37`), OFF unless exactly `"1"`. F1/F2/F3 semantics documented there and in `contracts/flag-and-validator.contract.md:9–11`.
- The **five gated mutate() execution sites** (pinned by `tests/survey/mutateGatingAudit.test.ts:14–18`):
  1. reducer apply — `steps/reducer.ts:205–217` (`if (!isMutateSeamEnabled()) return;`).
  2. reducer touch re-propagation — `steps/reducer.ts:228–239`.
  3. carve projection — `lib/projectWorkingCopyVfs.ts:242–254` (flag-on branch calls `applyCarveMutate`; **else** runs legacy `applyCarveToVfs` filter).
  4. add-gallery projection — `lib/projectWorkingCopyVfs.ts:283–297` (flag-on derives IR via `applyAddGalleryMutate` but **intentionally does not re-emit** — text artifact stays byte-identical; this is a pure correctness-seam call today).
  5. touch promotion on manual edit — `editors/assignLoop/TouchGallery.tsx` (`promoteOnManualEdit`).
- **Parallel legacy emit** lives in `lib/projectWorkingCopyVfs.ts`: the carve `else` branch (`:250–254`) and the always-on text `applyAssignmentsToVfs` (`:262–268`) that the flag-on add branch shadows with a non-emitting IR derivation.
- **Carve store mutators / overlay** that the legacy carve path consumes: `deletedNodeIds`/`deletedItemIds`/`undoStack` + mutators `deleteNode`/`deleteItem`/`restoreNode`/`restoreItem`/`undoDelete`/`keepAll`/`restoreAll` (`workingCopyStore.ts:511–565`), and the dual setters `setIR` (overlay-clearing, `:499`) vs `setWorkingIR` (overlay-preserving seam write, `:505`).
- **Existing safety nets**: `tests/survey/flagOff.test.ts` (T029 flag-off = zero mutate calls / byte-identical; T030 flag-on = seam is the write path); `tests/survey/mutateGatingAudit.test.ts` (every site gated); `lib/projectWorkingCopyVfs.flagParity.test.ts` + `lib/serializeWorkingCopy.flagParity.test.ts` (emit byte-parity flag-on vs flag-off, real emit pipeline).
- **Build/run**: root `pnpm build` = `pnpm -r build` (CI `build`); studio build = `tsc -b && vite build` (`packages/studio/package.json`); dev = `pnpm dev`; tests `pnpm -r test` (vitest). **e2e**: Playwright at `packages/studio/playwright.config.ts` (`testDir: e2e`, `baseURL :5273`, `webServer: pnpm dev`); specs `e2e/copy-edit.spec.ts` + `e2e/import-improve.spec.ts` are currently `.skip`-ped and **excluded from the vitest + tsc CI lanes** — they run only in a manual/CD step via the global `npx playwright test` CLI (`@playwright/test` is deliberately not a devDependency). CI workflow: `.github/workflows/ci.yml`.

### Approach — staged rollout + validation, then legacy retirement

**(a) Automated proof.** 
- Extend the existing flag-parity suites (`projectWorkingCopyVfs.flagParity.test.ts`, `serializeWorkingCopy.flagParity.test.ts`) to cover the surfaces not yet byte-compared: full-spine carve+add+touch-repropagation+hand-set protection in **both** flag states. Where output MUST match (carve/add emit), assert byte-identical golden output. Where it SHOULD differ once on (touch re-propagation now writes the touch layout through the seam; US5 per-prefix stranding), assert the flag-on-only divergence explicitly.
- Add golden-output fixtures for a representative keyboard's full projected VFS (the .kmn + .keyman-touch-layout) flag-off vs flag-on.
- Un-skip / extend the Playwright e2e specs (`e2e/copy-edit.spec.ts`, `e2e/import-improve.spec.ts`) to run **flag-on** (set `VITE_KM_MUTATE_SEAM=1` in the e2e `webServer` env) and assert the OSK preview + downloaded artifacts are correct.

**(b) Manual QA matrix (flag-on).** Run `VITE_KM_MUTATE_SEAM=1 pnpm dev` and exercise, comparing against a flag-off run:
- Preview OSK renders correctly after carve deletions (whole node + store-slot) and after add-gallery mechanism assignment.
- Shipped `.kmn` + `.keyman-touch-layout` (download/zip) are correct: carve deletions applied, mechanisms injected, touch re-propagation produced the expected keys.
- **Touch re-propagation**: complete mechanisms → physical change → only `base-derived`/`physical-suggested` keys re-suggest; **100% of `hand-set` keys byte-identical** (SC-005), and a promoted (`physical-suggested`→`hand-set`) key untouched (SC-006).
- **Hand-set protection + R6** (once WS2 lands): orphaned hand-set key surfaces, not deleted.

**(c) Enable the flag.** Set `VITE_KM_MUTATE_SEAM=1` in the deploy/build env (it's read at build/deploy time, F3 — not a live toggle). Roll out behind the existing default-off so rollback is "unset the env var" (SC-008, F2). Bake one release cycle.

**(d) Legacy-path retirement (once proven).** Only after (a)–(c) are green for a full cycle:
- `lib/projectWorkingCopyVfs.ts`: delete the carve `else` legacy branch (`:250–254`) and make the seam path unconditional; collapse the add-gallery flag guard (`:283–297`) so the seam derivation is the single producer; remove the now-dead `applyStoreSlotRemovals`+`applyCarveToVfs` internal-filter path where the seam supersedes it.
- `flags/mutateFlag.ts`: retire `isMutateSeamEnabled()` and every `isMutateSeamEnabled()` guard at the five sites (`reducer.ts:206`, `:229`; `projectWorkingCopyVfs.ts:242`,`:283`; `TouchGallery.tsx`).
- `workingCopyStore.ts`: if `setIR` (overlay-clearing) is now used only by the legacy carve replace, consolidate onto `setWorkingIR` semantics; retire any carve mutators / flag-off branches that only existed to feed the legacy emit. Do this surgically — `deletedNodeIds`/overlay are still the live carve UI state (`editorMutate.ts:1–25` is explicit the overlay stays); only the *legacy projection consumer* is retired, not the overlay itself.
- **Tests that pin safety during retirement** (must stay green; some will be rewritten as single-path once the flag is gone): `flagOff.test.ts`, `mutateGatingAudit.test.ts`, `projectWorkingCopyVfs.flagParity.test.ts`, `serializeWorkingCopy.flagParity.test.ts`, `articleIVProbe.test.ts`. The flag-parity + gating-audit tests are flag-conditional by construction; converting them to single-path assertions is the final retirement step and should be a separate, reviewable commit.

### Files to touch
- `packages/studio/src/lib/projectWorkingCopyVfs.ts` (carve 242–254, add 283–297).
- `packages/studio/src/flags/mutateFlag.ts` (eventual deletion).
- `packages/studio/src/steps/reducer.ts` (gates 206, 229).
- `packages/studio/src/editors/assignLoop/TouchGallery.tsx` (gate at `promoteOnManualEdit`).
- `packages/studio/src/stores/workingCopyStore.ts` (`setIR`/`setWorkingIR` consolidation; carve mutators).
- `packages/studio/e2e/*.spec.ts`, the two `*.flagParity.test.ts`, `tests/survey/flagOff.test.ts`, `tests/survey/mutateGatingAudit.test.ts`.
- Deploy/build env config for the flag.

### Edge cases & risks
- **F2/SC-008**: until retirement, flag-off MUST stay byte-identical to P4b and make **zero** mutate calls — `flagOff.test.ts` + `mutateGatingAudit.test.ts` are the guard. Don't break them while enabling.
- The add-gallery seam currently does **not** re-emit (`projectWorkingCopyVfs.ts:280–289`) — the text artifact is the reference. Retirement must preserve byte-identical output, so retiring the text path here means switching to seam-IR emit and re-proving byte-parity first.
- The entry-group safety gate (`projectWorkingCopyVfs.ts:231–233`) defers to the legacy path; retirement must preserve that warn-and-skip behavior in the seam path.
- F3: the flag is build/deploy-time; no mid-session flip. QA must restart the dev server to switch states.

### Test strategy & acceptance criteria
- **SC-008**: flag-off full-spine byte-identical to P4b + zero mutate calls (existing) **and** flag-on demonstrated as the write path — both states green.
- **SC-005/SC-006**: re-propagation no-clobber + promotion proven flag-on (extend touch fixtures).
- New golden flag-on-vs-off VFS parity tests green; e2e flag-on specs green.
- Done (rollout) when: flag enabled in deploy, a full cycle of green automated + manual QA, no regressions. Done (retirement) when: legacy branches/mutators deleted, single write path remains, flag-parity tests converted to single-path, all suites + depcruise + typecheck green.

### Open decisions (confirm with Matt)
- **G.** Rollout gating: straight env flip, or a canary/staged deploy first?
- **H.** Sequencing of retirement vs US5/R6 — retire legacy *before* or *after* US5/R6 land (see sequencing below).
- **I.** Should the add-gallery path switch to seam-IR emit (retiring the text emit) or keep text emit as the artifact producer indefinitely? Load-bearing for what "retirement" deletes.

---

## Suggested sequencing

1. **Flag rollout (a)+(b)+(c) first.** US5's real per-prefix validator and R6's orphan surfacing are only *observable* when the seam actually executes (re-propagation runs flag-on; the mutate-produced WC exists flag-on). Proving and enabling the flag de-risks both and gives them a real substrate. Do **not** do retirement (d) yet.
2. **R6 second.** It's self-contained, read-only, low-risk, and rides directly on the now-enabled re-propagation path (`mergeNoClobber` already preserves orphans; R6 only adds detection + a dashboard section following the existing `orphanInputs` pattern). Smallest blast radius.
3. **US5 third.** It's the largest design choice (per-prefix projection vs attribution) and the highest V3 risk; it benefits from the flag being on and from R6 having exercised the report-extension pattern.
4. **Legacy retirement (d) last.** Only after the flag has been on for a full cycle with US5+R6 green, so the single remaining write path is the proven one. Retirement is its own reviewable change set; converting the flag-parity/gating tests to single-path is the final commit.

Dependencies: R6 and US5 both *depend on the flag being enabled* to be meaningful (WS3 a–c). Retirement (WS3 d) depends on US5+R6 landing and the flag being proven. R6 and US5 are independent of each other (both only extend `CompletenessReport` + `DashboardView`; touch the same two files, so coordinate to avoid conflicts).

## Definition of done (per workstream)
- **US5**: each lock-reaching spine prefix is validated against its own `mutate()`-produced working copy; a broken-at-prefix-k fixture strands prefixes ≥ k only; base-template prefixes pass; flag-off stays the pure structural proxy; `articleIVProbe.test.ts` confirms no second debounce/path (SC-009, FR-017/-018, V1–V3).
- **R6**: orphaned `hand-set` (and untagged) touch keys surface in the dashboard with id + location, nothing is auto-deleted, SC-005/SC-006 stay green, `completeness.ts` stays pure (depcruise clean) (R6, FR-009).
- **Flag rollout**: flag-on proven equivalent-where-it-should-match / correct-where-it-differs via extended flag-parity + golden + e2e tests and the manual QA matrix; flag enabled in deploy with "unset to roll back"; legacy dual paths in `projectWorkingCopyVfs.ts` + the five gates + redundant carve mutators deleted with the single write path remaining and all safety-net tests converted/green (SC-008, F1/F2/F3).
