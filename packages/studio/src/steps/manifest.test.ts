// manifest.test.ts — T025 (P4b foundation).
//
// Asserts M2–M6 from the manifest-reducer contract:
//   M2 — spine order matches FR-012 functional order.
//   M3 — exactly one lock:"physical" then one lock:"touch".
//   M4 — touch_seed_source is spine:false with a joinTarget resolving to an
//         existing spine:true step.
//   M5 — all ids unique.
//   M6 — no A–G phase-letter vocabulary in ids or titles.
//
// Source of truth: specs/012-step-model-manifest/contracts/manifest-reducer.contract.md

import { describe, it, expect } from "vitest";
import { manifest } from "./manifest.ts";
import type { Step } from "./types.ts";
import { assertUniqueIds } from "./types.test.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function spineSteps(steps: readonly Step[]): Step[] {
  return steps.filter((s) => s.spine === true);
}

function lockedSteps(steps: readonly Step[]): Step[] {
  return steps.filter((s) => s.lock !== undefined);
}

function offSpineSteps(steps: readonly Step[]): Step[] {
  return steps.filter((s) => s.spine === false);
}

// ---------------------------------------------------------------------------
// M5 — unique ids (precondition for all other assertions)
// ---------------------------------------------------------------------------

describe("M5 — all step ids are unique", () => {
  it("no duplicate ids in manifest", () => {
    expect(() => assertUniqueIds(manifest)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// M2 — spine order
//
// FR-012: Identity → choose base → Characters → Carve → Mechanisms →
//         (lock:physical on mechanisms or adjacent) → touch carve+add →
//         (lock:touch on touch) → Help → Package
//
// The functional step ids in the expected order. Lock gates are embedded in
// their respective spine steps, so they do not change the positional order —
// we assert on the id sequence of spine:true steps.
// ---------------------------------------------------------------------------

const EXPECTED_SPINE_ORDER = [
  "identity",
  "choose_base",
  "characters",
  "carve",
  "mechanisms",
  "touch",
  "help",
  "package",
] as const;

describe("M2 — spine order matches FR-012", () => {
  it("spine steps appear in the functional order (Identity → … → Package)", () => {
    const actualSpineIds = spineSteps(manifest).map((s) => s.id);
    expect(actualSpineIds).toEqual([...EXPECTED_SPINE_ORDER]);
  });

  it("first spine step is 'identity'", () => {
    const first = spineSteps(manifest)[0];
    expect(first?.id).toBe("identity");
  });

  it("last spine step is 'package'", () => {
    const spine = spineSteps(manifest);
    const last = spine[spine.length - 1];
    expect(last?.id).toBe("package");
  });

  it("'mechanisms' appears before 'touch' on the spine", () => {
    const spine = spineSteps(manifest);
    const mechIdx = spine.findIndex((s) => s.id === "mechanisms");
    const touchIdx = spine.findIndex((s) => s.id === "touch");
    expect(mechIdx).toBeGreaterThanOrEqual(0);
    expect(touchIdx).toBeGreaterThanOrEqual(0);
    expect(mechIdx).toBeLessThan(touchIdx);
  });

  it("'carve' appears before 'mechanisms' on the spine", () => {
    const spine = spineSteps(manifest);
    const carveIdx = spine.findIndex((s) => s.id === "carve");
    const mechIdx = spine.findIndex((s) => s.id === "mechanisms");
    expect(carveIdx).toBeGreaterThanOrEqual(0);
    expect(mechIdx).toBeGreaterThanOrEqual(0);
    expect(carveIdx).toBeLessThan(mechIdx);
  });

  it("'characters' appears before 'carve' on the spine", () => {
    const spine = spineSteps(manifest);
    const charIdx = spine.findIndex((s) => s.id === "characters");
    const carveIdx = spine.findIndex((s) => s.id === "carve");
    expect(charIdx).toBeGreaterThanOrEqual(0);
    expect(carveIdx).toBeGreaterThanOrEqual(0);
    expect(charIdx).toBeLessThan(carveIdx);
  });

  it("'help' appears before 'package' on the spine", () => {
    const spine = spineSteps(manifest);
    const helpIdx = spine.findIndex((s) => s.id === "help");
    const pkgIdx = spine.findIndex((s) => s.id === "package");
    expect(helpIdx).toBeGreaterThanOrEqual(0);
    expect(pkgIdx).toBeGreaterThanOrEqual(0);
    expect(helpIdx).toBeLessThan(pkgIdx);
  });
});

// ---------------------------------------------------------------------------
// M3 — exactly two locks, in the order physical then touch
// ---------------------------------------------------------------------------

describe("M3 — exactly one lock:physical then one lock:touch", () => {
  it("exactly two locks exist in the manifest", () => {
    const locked = lockedSteps(manifest);
    expect(locked).toHaveLength(2);
  });

  it("the first lock is 'physical'", () => {
    const locked = lockedSteps(manifest);
    expect(locked[0]?.lock).toBe("physical");
  });

  it("the second lock is 'touch'", () => {
    const locked = lockedSteps(manifest);
    expect(locked[1]?.lock).toBe("touch");
  });

  it("lock:physical is on the 'mechanisms' step (positioned before the touch step)", () => {
    const physicalLockStep = manifest.find((s) => s.lock === "physical");
    expect(physicalLockStep?.id).toBe("mechanisms");
  });

  it("lock:touch is on the 'touch' step", () => {
    const touchLockStep = manifest.find((s) => s.lock === "touch");
    expect(touchLockStep?.id).toBe("touch");
  });

  it("lock:physical appears before lock:touch in the manifest array", () => {
    const physIdx = manifest.findIndex((s) => s.lock === "physical");
    const touchIdx = manifest.findIndex((s) => s.lock === "touch");
    expect(physIdx).toBeGreaterThanOrEqual(0);
    expect(touchIdx).toBeGreaterThanOrEqual(0);
    expect(physIdx).toBeLessThan(touchIdx);
  });

  it("all lock-carrying steps are spine:true steps (not side trails)", () => {
    const locked = lockedSteps(manifest);
    for (const s of locked) {
      expect(s.spine).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// M4 — touch_seed_source fork
//
// A step id "touch_seed_source" must exist that is spine:false, has a
// joinTarget resolving to an existing spine:true step in the manifest.
// ---------------------------------------------------------------------------

describe("M4 — touch_seed_source fork", () => {
  it("a step with id 'touch_seed_source' exists in the manifest", () => {
    const found = manifest.find((s) => s.id === "touch_seed_source");
    expect(found).toBeDefined();
  });

  it("touch_seed_source has spine:false", () => {
    const found = manifest.find((s) => s.id === "touch_seed_source");
    expect(found?.spine).toBe(false);
  });

  it("touch_seed_source has a joinTarget declared", () => {
    const found = manifest.find((s) => s.id === "touch_seed_source");
    expect(found?.joinTarget).toBeDefined();
    expect(typeof found?.joinTarget).toBe("string");
    expect((found?.joinTarget?.length ?? 0) > 0).toBe(true);
  });

  it("touch_seed_source.joinTarget resolves to a step that exists in the manifest", () => {
    const seedStep = manifest.find((s) => s.id === "touch_seed_source");
    const joinTarget = seedStep?.joinTarget;
    expect(joinTarget).toBeDefined();
    const targetStep = manifest.find((s) => s.id === joinTarget);
    expect(targetStep).toBeDefined();
  });

  it("touch_seed_source.joinTarget resolves to a spine:true step", () => {
    const seedStep = manifest.find((s) => s.id === "touch_seed_source");
    const joinTarget = seedStep?.joinTarget;
    const targetStep = manifest.find((s) => s.id === joinTarget);
    expect(targetStep?.spine).toBe(true);
  });

  it("touch_seed_source appears in the manifest before the touch spine step", () => {
    const seedIdx = manifest.findIndex((s) => s.id === "touch_seed_source");
    const touchIdx = manifest.findIndex((s) => s.id === "touch");
    expect(seedIdx).toBeGreaterThanOrEqual(0);
    expect(touchIdx).toBeGreaterThanOrEqual(0);
    expect(seedIdx).toBeLessThan(touchIdx);
  });

  it("there is exactly one off-spine step (touch_seed_source)", () => {
    const offSpine = offSpineSteps(manifest);
    expect(offSpine).toHaveLength(1);
    expect(offSpine[0]?.id).toBe("touch_seed_source");
  });
});

// ---------------------------------------------------------------------------
// M6 — no A–G phase-letter vocabulary in ids or titles
//
// The retired sequential phase-letter vocabulary (phase A, phase B, phase C,
// phase D, phase E, phase F, phase G as primary identifiers) must not appear
// in step ids or titles. The characters step is "characters", not "phase_a".
// ---------------------------------------------------------------------------

// Phase-letter patterns that would indicate the retired vocabulary.
// We check for standalone letters as step id prefixes and as "Phase X" titles.
const RETIRED_ID_PATTERNS = [
  /^phase_[a-gA-G]$/,
  /^phase[A-G]$/,
  /^[a-gA-G]$/,           // single-letter id (the original SurveyStage literals)
];

const RETIRED_TITLE_PATTERNS = [
  /^Phase\s+[A-G]\s*$/i,  // "Phase A", "Phase B", etc. as the full title
];

describe("M6 — no A–G phase-letter vocabulary in ids or titles", () => {
  it("no step id matches a retired phase-letter pattern", () => {
    for (const step of manifest) {
      for (const pattern of RETIRED_ID_PATTERNS) {
        expect(
          pattern.test(step.id),
          `Step id "${step.id}" matches retired pattern ${pattern.source}`,
        ).toBe(false);
      }
    }
  });

  it("no step title is exactly a retired 'Phase X' label", () => {
    for (const step of manifest) {
      for (const pattern of RETIRED_TITLE_PATTERNS) {
        expect(
          pattern.test(step.title),
          `Step title "${step.title}" matches retired pattern ${pattern.source}`,
        ).toBe(false);
      }
    }
  });

  it("the characters-inventory step uses id 'characters', not 'phase_a' or similar", () => {
    const charStep = manifest.find((s) => s.id === "characters");
    expect(charStep).toBeDefined();
  });
});
