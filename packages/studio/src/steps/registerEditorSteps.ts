// registerEditorSteps — adapt P4a editor adapters into EditorStep descriptors.
//
// T023 (P4b foundation). Each gallery and wizard panel adapter from
// editors/adapters/ becomes an EditorStep with a declared id, title,
// inputs, and writes. The manifest (manifest.ts) sources the actual
// ordered Steps from this list.
//
// Boundary: steps/ -> editors/ is allowed by the steps-layer depcruise rule.
// steps/ -> stores/ and steps/ -> lib/ are forbidden — this file imports neither.
//
// inputs/writes: galleries and panels are rich-editor surfaces that drive
// the working copy directly (carve deletions, mechanism assignments, touch
// assignments). The IRPath declarations here are the authoritative static
// declarations for the completeness graph; the actual writes happen in the
// store at runtime.
//
// Pool ↔ manifest reconciliation:
//   - scaffoldStep was declared here but never placed in the manifest. The
//     copy-track scaffold parameters (keyboardId, displayName) are collected
//     by ProjectNameStepAdapter and passed through its onComplete result — they
//     do not need a separate scaffold step. scaffoldStep is removed from this
//     pool so the pool matches the manifest exactly.

import type { EditorStep } from "./types.ts";
import { irPath, ARRAY_INDEX } from "@keyboard-studio/contracts";
import { CarveAdapter } from "../editors/adapters/carveAdapter.tsx";
import { BuildListAdapter } from "../editors/adapters/buildListAdapter.tsx";
import { AddPhysicalAdapter } from "../editors/adapters/addPhysicalAdapter.tsx";
import { AddTouchAdapter } from "../editors/adapters/addTouchAdapter.tsx";
import {
  TrackStepAdapter,
  ProjectNameStepAdapter,
  TrackOneIdentityPanelAdapter,
  BaseResolutionAdapter,
} from "../editors/adapters/panelAdapters.tsx";

// ---------------------------------------------------------------------------
// Panel steps (wizard panels — non-gallery)
// ---------------------------------------------------------------------------

/**
 * Identity step: the TrackOneIdentityPanel (continuous identity editor).
 * No back affordance — entry-point panel.
 */
export const identityStep: EditorStep = {
  kind: "editor-step",
  id: "identity",
  title: "Keyboard Identity",
  spine: true,
  component: TrackOneIdentityPanelAdapter,
  inputs: [],
  writes: [],
};

/**
 * Choose-base step: BaseResolution (keyboard base picker ONLY).
 * Track selection is a separate manifest step (trackStep).
 */
export const chooseBaseStep: EditorStep = {
  kind: "editor-step",
  id: "choose_base",
  title: "Choose Base Keyboard",
  spine: true,
  component: BaseResolutionAdapter,
  inputs: [],
  writes: [],
};

/**
 * Track step: TrackStep (copy vs adapt choice).
 * Spine:true — every author chooses a track.
 */
export const trackStep: EditorStep = {
  kind: "editor-step",
  id: "track",
  title: "Authoring Track",
  spine: true,
  component: TrackStepAdapter,
  inputs: [],
  writes: [],
};

/**
 * Project name step: ProjectNameStep (copy-track only).
 * Declared spine:true here (the pool default); the manifest overrides it to
 * spine:false with joinTarget:"characters" to model the CYOA copy-only fork.
 * ProjectNameStepAdapter collects both displayName and keyboardId (the scaffold
 * params) — no separate scaffold step is needed.
 */
export const projectNameStep: EditorStep = {
  kind: "editor-step",
  id: "project_name",
  title: "Project Name",
  spine: true,
  component: ProjectNameStepAdapter,
  inputs: [],
  writes: [],
};

/**
 * Build-list step: the Phase B "build my character list" surface (DEFAULT
 * character-discovery method). A mature, hand-built component imported as a
 * single, opaque first-class step. Breaking it down into sub-questions/loops is
 * deferred to a later cycle (Matt's direction).
 *
 * Placement (set in manifest.ts): spine:false with joinTarget:"characters". The
 * build-list is the default surface WITHIN the characters phase — a side trail
 * off the characters spine step that rejoins it, exactly mirroring how
 * project_name forks off and rejoins. This keeps the spine order unchanged
 * (no user-facing regression) while making the build-list a first-class,
 * map-visible step.
 *
 * Declared IR contract:
 *   inputs:  [] — the build-list reads the session CLDR/identity context
 *                 (bcp47_tag, language_name) and uses baseIr ONLY to compute
 *                 advisory "missing character" suggestions. None of those reads
 *                 are a hard IR dependency that gates the step, so no IRPath
 *                 input is declared (declaring one would assert an upstream
 *                 writer the build-list does not actually require).
 *   writes:  [stores[]] — the confirmed character inventory is the character set
 *                 that materializes downstream as keyboard store items. This is
 *                 the build-list's authoritative IR-level write surface.
 */
export const buildListStep: EditorStep = {
  kind: "editor-step",
  id: "build_list",
  title: "Build Character List",
  spine: true,
  component: BuildListAdapter,
  inputs: [],
  writes: [irPath("stores", ARRAY_INDEX)],
};

// ---------------------------------------------------------------------------
// Gallery steps (carve + add galleries)
// ---------------------------------------------------------------------------

/**
 * Carve step: CarveGallery (remove-mode, distinct from add galleries).
 */
export const carveStep: EditorStep = {
  kind: "editor-step",
  id: "carve",
  title: "Carve Keys",
  spine: true,
  component: CarveAdapter,
  inputs: [],
  writes: [],
};

/**
 * Mechanisms step: MechanismGallery (physical key assignment — Phase C).
 * The reducer fires lockDesktop() when this step completes.
 */
export const mechanismsStep: EditorStep = {
  kind: "editor-step",
  id: "mechanisms",
  title: "Assign Mechanisms",
  spine: true,
  component: AddPhysicalAdapter,
  surface: "physical",
  inputs: [],
  writes: [],
};

/**
 * Touch seed source step: off-spine fork that lets the author choose how
 * the touch surface is seeded. Rejoins the spine at the touch carve+add step.
 * spine: false (FR-013, M4).
 */
export const touchSeedSourceStep: EditorStep = {
  kind: "editor-step",
  id: "touch_seed_source",
  title: "Touch Seed Source",
  spine: false,
  joinTarget: "touch",
  component: AddTouchAdapter,
  surface: "touch",
  inputs: [],
  writes: [],
};

/**
 * Touch step: TouchGallery (touch key assignment — Phase E).
 * The reducer fires the buildTouchLayoutJson block when this step completes.
 */
export const touchStep: EditorStep = {
  kind: "editor-step",
  id: "touch",
  title: "Touch Layout",
  spine: true,
  component: AddTouchAdapter,
  surface: "touch",
  inputs: [],
  writes: [],
};

// ---------------------------------------------------------------------------
// Help step (Phase F — questions phase, but represented here as an editor step
// placeholder until the question-step version is wired from the registry).
// ---------------------------------------------------------------------------

/**
 * Help step: placeholder for the Help/Phase F question phase.
 * In P4b this is a spine-only descriptor; the actual content resolves
 * through the PhaseF survey runner in SurveyView (T028).
 */
export const helpStep: EditorStep = {
  kind: "editor-step",
  id: "help",
  title: "Help & Tips",
  spine: true,
  component: TrackOneIdentityPanelAdapter, // placeholder — wired in T028
  inputs: [],
  writes: [],
};

/**
 * Package step: reserved / out-of-scope for v1. Present as a spine placeholder
 * so the manifest spine is complete and the dashboard shows it as a future step.
 * The component is a stub that never advances (FR-012 "reserved").
 */
export const packageStep: EditorStep = {
  kind: "editor-step",
  id: "package",
  title: "Package (reserved)",
  spine: true,
  component: TrackOneIdentityPanelAdapter, // stub — out of scope for v1
  inputs: [],
  writes: [],
};

// ---------------------------------------------------------------------------
// Exported list (unordered pool — the manifest imposes the spine order)
//
// Pool ↔ manifest: every step here is referenced by the manifest, and every
// manifest step (by id) has an entry here. scaffoldStep was removed because
// scaffold params are collected by projectNameStep's adapter — no separate step.
// ---------------------------------------------------------------------------

/**
 * All editor steps as an unordered pool. The manifest picks entries by id
 * and assembles them into the spine order. This list is the canonical source
 * of editor-step descriptors.
 */
export const registeredEditorSteps: readonly EditorStep[] = [
  identityStep,
  chooseBaseStep,
  trackStep,
  projectNameStep,
  buildListStep,
  carveStep,
  mechanismsStep,
  touchSeedSourceStep,
  touchStep,
  helpStep,
  packageStep,
];
