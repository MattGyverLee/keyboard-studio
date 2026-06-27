// manifest — the single ordered list of all survey steps.
//
// T024 (P4b foundation). This is the ONE source of survey ordering (FR-008,
// FR-012). The runtime (T028) and the dashboard (T031) both read this array.
// Editing this file changes the order in both places simultaneously —
// "map == runtime by construction" (FR-010).
//
// SPINE ORDER (FR-012, M2):
//   Identity → choose base → Characters (Phase A/B questions) → Carve →
//   Mechanisms → [lock: "physical"] → touch_seed_source (spine:false) →
//   touch → [lock: "touch"] → Help → Package (reserved)
//
// NOTE: This manifest is authored in P4b but NOT yet wired into the runtime
// this cycle. The SurveyView rewrite (T028) is the next cycle and will
// consume this export. Authoring it now changes NO runtime behavior.
//
// Boundary: steps/ -> editors/ and steps/ -> survey/ are allowed.
// steps/ -> stores/, lib/, components/ are forbidden.

import type { Step } from "./types.ts";
import {
  identityStep,
  chooseBaseStep,
  carveStep,
  mechanismsStep,
  touchSeedSourceStep,
  touchStep,
  helpStep,
  packageStep,
} from "./registerEditorSteps.ts";

// ---------------------------------------------------------------------------
// "Characters" phase — the Phase A/B question battery.
//
// Represented as a single manifest placeholder for now. The actual question
// ordering within Phase A/B is handled by the SurveyRunner (FlowDef routing)
// rather than expanded step-by-step in the manifest (the SurveyRunner is the
// intra-phase router; the manifest is the inter-phase router).
//
// When T028 wires the manifest into SurveyView, the "characters" step will
// delegate to the existing Phase A/B SurveyRunner for its internal routing.
// ---------------------------------------------------------------------------

/** Spine placeholder for the Phase A/B character-inventory question battery. */
const charactersStep: Step = {
  kind: "editor-step",
  id: "characters",
  title: "Characters",
  spine: true,
  inputs: [],
  writes: [],
  // Temporary stub component — T028 wires the real PhaseA/B runner here.
  // Using the identity adapter type; the manifest author replaces this at wiring time.
  component: () => null,
} as const;

// ---------------------------------------------------------------------------
// Manifest: the ordered Step[] (FR-008, FR-012)
//
// Rules encoded here:
//   M2 — spine order: Identity → choose base → Characters → Carve →
//         Mechanisms → (lock physical) → touch seed source (spine:false) →
//         touch → (lock touch) → Help → Package
//   M3 — exactly one lock:"physical" and one lock:"touch", in that order.
//   M4 — touch_seed_source is spine:false with joinTarget resolving to "touch"
//         (the first spine:true touch step).
// ---------------------------------------------------------------------------

export const manifest: readonly Step[] = [
  // --- Identity panel ---
  identityStep,

  // --- Base selection ---
  chooseBaseStep,

  // --- Character inventory (Phase A / Phase B question battery) ---
  charactersStep,

  // --- Carve (Phase D: remove unwanted base keys) ---
  carveStep,

  // --- Mechanisms (Phase C: physical key assignment) ---
  // The reducer fires lockDesktop() when this step completes (R1).
  {
    ...mechanismsStep,
    lock: "physical",
  } satisfies Step,

  // --- Touch seed source (off-spine fork, FR-013, M4) ---
  // spine:false — side trail that lets the author choose the touch seed.
  // joinTarget: "touch" — rejoins the spine at the touch carve+add step.
  // Both branches converge on the same touch carve/add shell (fork the seed,
  // not the UI). In P4b this fork is declared; the runtime routing is wired in T028.
  touchSeedSourceStep,

  // --- Touch carve+add (Phase E: touch key assignment) ---
  // The reducer fires buildTouchLayoutJson when this step completes (R2).
  {
    ...touchStep,
    lock: "touch",
  } satisfies Step,

  // --- Help (Phase F: usage tips and credits) ---
  helpStep,

  // --- Package (reserved, out of scope for v1) ---
  packageStep,
] as const;
