// Tests for T018/T019/T020 reserved touch-suggest seams (P4a, T021).
//
// These tests pin:
//   1. defaultProvenance() returns "hand-set" (provenance.ts, T018).
//   2. DEFAULT_TOUCH_SUGGEST_POLICY has the expected field values (defaults.ts, T019).
//   3. Policy fields are overridable individually without clobbering other fields.
//   4. touchSuggest() returns an empty array in P4a (touchSuggest.ts, T020).
//   5. touchSuggest() accepts and merges policyOverrides without throwing.

import { describe, it, expect } from "vitest";
import {
  defaultProvenance,
} from "../assignLoop/provenance.ts";
import {
  DEFAULT_TOUCH_SUGGEST_POLICY,
} from "./defaults.ts";
import type { TouchSuggestPolicy } from "./defaults.ts";
import { touchSuggest } from "./touchSuggest.ts";

// ---------------------------------------------------------------------------
// T018 — TouchKeyProvenance default
// ---------------------------------------------------------------------------

describe("defaultProvenance", () => {
  it("returns 'hand-set' as the default provenance", () => {
    expect(defaultProvenance()).toBe("hand-set");
  });

  it("is a valid TouchKeyProvenance literal", () => {
    const p = defaultProvenance();
    const valid = ["base-derived", "physical-suggested", "hand-set"] as const;
    expect(valid).toContain(p);
  });
});

// ---------------------------------------------------------------------------
// T019 — TouchSuggestPolicy defaults
// ---------------------------------------------------------------------------

describe("DEFAULT_TOUCH_SUGGEST_POLICY", () => {
  it("has widthBudget of 10", () => {
    expect(DEFAULT_TOUCH_SUGGEST_POLICY.widthBudget).toBe(10);
  });

  it("targets symbol-layer for number-row characters", () => {
    expect(DEFAULT_TOUCH_SUGGEST_POLICY.numberRowTarget).toBe("symbol-layer");
  });

  it("uses long-press-demotion for modifier policy", () => {
    expect(DEFAULT_TOUCH_SUGGEST_POLICY.modifierPolicy).toBe(
      "long-press-demotion"
    );
  });

  it("hosts dead-key output on the base character", () => {
    expect(DEFAULT_TOUCH_SUGGEST_POLICY.deadKeyHost).toBe("base");
  });

  it("defaults to long-press gesture", () => {
    expect(DEFAULT_TOUCH_SUGGEST_POLICY.defaultGesture).toBe("long-press");
  });

  it("is structurally complete — all required fields present", () => {
    const required: Array<keyof TouchSuggestPolicy> = [
      "widthBudget",
      "numberRowTarget",
      "modifierPolicy",
      "deadKeyHost",
      "defaultGesture",
    ];
    for (const field of required) {
      expect(DEFAULT_TOUCH_SUGGEST_POLICY).toHaveProperty(field);
    }
  });

  it("policy is overridable per-field without clobbering siblings", () => {
    const override: Partial<TouchSuggestPolicy> = { widthBudget: 11 };
    const merged: TouchSuggestPolicy = {
      ...DEFAULT_TOUCH_SUGGEST_POLICY,
      ...override,
    };

    // Overridden field
    expect(merged.widthBudget).toBe(11);

    // Sibling fields preserved
    expect(merged.numberRowTarget).toBe(
      DEFAULT_TOUCH_SUGGEST_POLICY.numberRowTarget
    );
    expect(merged.modifierPolicy).toBe(
      DEFAULT_TOUCH_SUGGEST_POLICY.modifierPolicy
    );
    expect(merged.deadKeyHost).toBe(DEFAULT_TOUCH_SUGGEST_POLICY.deadKeyHost);
    expect(merged.defaultGesture).toBe(
      DEFAULT_TOUCH_SUGGEST_POLICY.defaultGesture
    );
  });

  it("numberRowTarget override does not affect other fields", () => {
    const merged: TouchSuggestPolicy = {
      ...DEFAULT_TOUCH_SUGGEST_POLICY,
      numberRowTarget: "numeric-layer",
    };
    expect(merged.numberRowTarget).toBe("numeric-layer");
    expect(merged.widthBudget).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// T020 — touchSuggest generator stub
// ---------------------------------------------------------------------------

describe("touchSuggest (P4a stub)", () => {
  it("returns an empty array with no IR input", () => {
    const result = touchSuggest({ physicalIR: {} });
    expect(result).toEqual([]);
  });

  it("returns an empty array even with a non-empty IR", () => {
    const result = touchSuggest({
      physicalIR: { someKey: "someValue" },
    });
    expect(result).toEqual([]);
  });

  it("does not throw when policyOverrides is provided", () => {
    expect(() =>
      touchSuggest({
        physicalIR: {},
        policyOverrides: { widthBudget: 11 },
      })
    ).not.toThrow();
  });

  it("does not throw when policyOverrides overrides all fields", () => {
    const fullOverride: TouchSuggestPolicy = {
      widthBudget: 12,
      numberRowTarget: "numeric-layer",
      modifierPolicy: "long-press-demotion",
      deadKeyHost: "base",
      defaultGesture: "long-press",
    };
    expect(() =>
      touchSuggest({ physicalIR: {}, policyOverrides: fullOverride })
    ).not.toThrow();
  });

  it("returns an array (not null or undefined)", () => {
    const result = touchSuggest({ physicalIR: {} });
    expect(Array.isArray(result)).toBe(true);
  });
});
