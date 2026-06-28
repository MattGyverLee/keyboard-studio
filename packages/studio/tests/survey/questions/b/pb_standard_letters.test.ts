import { describe, it, expect } from "vitest";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";
import { irPath, ARRAY_INDEX } from "@keyboard-studio/contracts";
import { applyMutatePatch } from "../../../../src/steps/mutateApply.ts";
import mod, { validate, fixtures, mutate } from "../../../../src/survey/questions/b/pb_standard_letters.ts";

// ---------------------------------------------------------------------------
// T010 / US1 — mutate() output tests (spec-014 mutate-seam M2–M5)
// ---------------------------------------------------------------------------

describe("pb_standard_letters — mutate() writes stores[] only", () => {
  it("appends a script-group store, preserving existing stores (M2/SC-002)", () => {
    const base = makeTestIR([], [makeCharStore("s0", "letters", "abc")]);
    const result = applyMutatePatch(base, mutate("basic-az", { ir: base, writes: mod.writes! }), mod.writes!);
    expect(result.stores).toHaveLength(2);
    // pre-existing store byte-identical
    expect(result.stores[0]).toEqual(base.stores[0]);
    const added = result.stores.find((s) => s.name === "kmStandardLetters");
    expect(added).toBeDefined();
    expect(added!.items).toEqual([{ kind: "raw", text: "basic-az" }]);
    // header / groups untouched
    expect(result.header).toEqual(base.header);
    expect(result.groups).toEqual(base.groups);
  });

  it("re-answering REPLACES the prior script-group store, not append (M4/idempotency)", () => {
    const base = makeTestIR([], [makeCharStore("s0", "letters", "abc")]);
    const first = applyMutatePatch(base, mutate("basic-az", { ir: base, writes: mod.writes! }), mod.writes!);
    const second = applyMutatePatch(first, mutate("extended-latin", { ir: first, writes: mod.writes! }), mod.writes!);
    const groupStores = second.stores.filter((s) => s.name === "kmStandardLetters");
    expect(groupStores).toHaveLength(1);
    expect(groupStores[0]!.items).toEqual([{ kind: "raw", text: "extended-latin" }]);
    expect(second.stores).toHaveLength(2);
  });

  it("re-applying the SAME answer is idempotent (M4/SC-003)", () => {
    const base = makeTestIR([], [makeCharStore("s0", "letters", "abc")]);
    const once = applyMutatePatch(base, mutate("basic-az", { ir: base, writes: mod.writes! }), mod.writes!);
    const twice = applyMutatePatch(once, mutate("basic-az", { ir: once, writes: mod.writes! }), mod.writes!);
    expect(twice).toEqual(once);
  });

  it("an invalid/blank answer is a no-op (M5)", () => {
    const base = makeTestIR([]);
    expect(mutate("", { ir: base, writes: mod.writes! })).toEqual({});
    expect(mutate("cyrillic", { ir: base, writes: mod.writes! })).toEqual({});
    expect(mutate(undefined, { ir: base, writes: mod.writes! })).toEqual({});
  });

  it("declared writes is exactly [stores[]]", () => {
    expect(mod.writes).toEqual([irPath("stores", ARRAY_INDEX)]);
  });
});

describe("pb_standard_letters — validate() valid fixtures", () => {
  for (const { value, note } of fixtures.valid) {
    it(`accepts ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      expect(validate(value)).toEqual({ ok: true });
    });
  }
});

describe("pb_standard_letters — validate() invalid fixtures", () => {
  for (const { value, note, expectedCode } of fixtures.invalid) {
    it(`rejects ${JSON.stringify(value)}${note ? ` (${note})` : ""}`, () => {
      const result = validate(value);
      expect(result.ok).toBe(false);
      if (expectedCode !== undefined && result.ok === false) {
        expect(result.code).toBe(expectedCode);
      }
    });
  }
});

describe("pb_standard_letters — validate() edge cases", () => {
  it("rejects undefined", () => {
    const r = validate(undefined);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("required");
  });
});
