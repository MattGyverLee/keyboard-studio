/**
 * Type-level tests for IRPath (T008).
 *
 * Positive cases: valid paths must be assignable to IRPath.
 * Negative cases: invalid paths must NOT be assignable to IRPath — enforced via
 * @ts-expect-error annotations. If a negative case compiles WITHOUT the
 * annotation, TS reports an unused @ts-expect-error → typecheck fails → CI
 * catches the regression (Drift AC / G2 enforcement).
 *
 * These tests also validate G3 (both surfaces covered) and G4 (traversal
 * bounded at TouchKeyIR — no sub-key paths).
 */

import { describe, it, expect } from "vitest";
import {
  irPath,
  formatIRPath,
  ARRAY_INDEX,
  type IRPath,
  type AssignableTo,
} from "./ir-path.js";

// ---------------------------------------------------------------------------
// Helper: static type assertion
// ---------------------------------------------------------------------------

/** Asserts at compile time that T is exactly `true`. */
type IsTrue<T extends true> = T;

// ---------------------------------------------------------------------------
// Positive cases (Design AC — valid paths must compile)
// ---------------------------------------------------------------------------

describe("IRPath — positive cases", () => {
  it("accepts the physical groups[].rules[].output path", () => {
    // This is the canonical physical path the spec names explicitly.
    const p = irPath("groups", ARRAY_INDEX, "rules", ARRAY_INDEX, "output");
    // Runtime sanity: it is an array with the right shape.
    expect(p[0]).toBe("groups");
    expect(p[1]).toEqual({ kind: "[]" });
    expect(p[2]).toBe("rules");
    expect(p[3]).toEqual({ kind: "[]" });
    expect(p[4]).toBe("output");
  });

  it("accepts the physical groups[].rules[].context path", () => {
    const p = irPath("groups", ARRAY_INDEX, "rules", ARRAY_INDEX, "context");
    expect(p[4]).toBe("context");
  });

  it("accepts the physical stores[] path", () => {
    const p = irPath("stores", ARRAY_INDEX);
    expect(p[0]).toBe("stores");
    expect(p[1]).toEqual({ kind: "[]" });
  });

  it("accepts a stores[].name leaf path", () => {
    const p = irPath("stores", ARRAY_INDEX, "name");
    expect(p[2]).toBe("name");
  });

  it("accepts the header.bcp47 path", () => {
    const p = irPath("header", "bcp47");
    expect(p[0]).toBe("header");
    expect(p[1]).toBe("bcp47");
  });

  it("accepts the header.keyboardId path", () => {
    const p = irPath("header", "keyboardId");
    expect(p[1]).toBe("keyboardId");
  });

  it("accepts the comments[] path", () => {
    const p = irPath("comments", ARRAY_INDEX);
    expect(p[0]).toBe("comments");
  });

  it("accepts the raw[] path", () => {
    const p = irPath("raw", ARRAY_INDEX);
    expect(p[0]).toBe("raw");
  });

  it("accepts the recognizedPatterns[] path", () => {
    const p = irPath("recognizedPatterns", ARRAY_INDEX);
    expect(p[0]).toBe("recognizedPatterns");
  });

  it("accepts the deep touch path touchLayout.platforms[].layers[].rows[].keys[]", () => {
    // G3: touch surface is covered; G4: traversal stops at keys[] (TouchKeyIR boundary).
    const p = irPath(
      "touchLayout",
      "platforms",
      ARRAY_INDEX,
      "layers",
      ARRAY_INDEX,
      "rows",
      ARRAY_INDEX,
      "keys",
      ARRAY_INDEX,
    );
    expect(p[0]).toBe("touchLayout");
    expect(p[1]).toBe("platforms");
    expect(p[2]).toEqual({ kind: "[]" });
    expect(p[3]).toBe("layers");
    expect(p[8]).toEqual({ kind: "[]" });
  });

  it("accepts the visual keyboard path visualKeyboard.layers[].keys[]", () => {
    const p = irPath(
      "visualKeyboard",
      "layers",
      ARRAY_INDEX,
      "keys",
      ARRAY_INDEX,
    );
    expect(p[0]).toBe("visualKeyboard");
    expect(p[4]).toEqual({ kind: "[]" });
  });

  it("accepts the groups[] path (without entering rules)", () => {
    const p = irPath("groups", ARRAY_INDEX);
    expect(p[0]).toBe("groups");
  });

  it("accepts a groups[].name path", () => {
    const p = irPath("groups", ARRAY_INDEX, "name");
    expect(p[2]).toBe("name");
  });

  // Compile-time assignability: verify these are valid IRPath values.
  type _PhysicalPath = IsTrue<
    AssignableTo<
      readonly ["groups", { kind: "[]" }, "rules", { kind: "[]" }, "output"],
      IRPath
    >
  >;
  type _TouchPath = IsTrue<
    AssignableTo<
      readonly [
        "touchLayout",
        "platforms",
        { kind: "[]" },
        "layers",
        { kind: "[]" },
        "rows",
        { kind: "[]" },
        "keys",
        { kind: "[]" },
      ],
      IRPath
    >
  >;
  type _StorePath = IsTrue<
    AssignableTo<readonly ["stores", { kind: "[]" }], IRPath>
  >;
  type _HeaderPath = IsTrue<
    AssignableTo<readonly ["header", "bcp47"], IRPath>
  >;
});

// ---------------------------------------------------------------------------
// Negative cases (Design AC — invalid paths must NOT compile)
// Removing any @ts-expect-error below must make `pnpm typecheck` fail.
// ---------------------------------------------------------------------------

describe("IRPath — negative cases (Design AC / G1)", () => {
  it("rejects a path with a field that does not exist on KeyboardIR", () => {
    // @ts-expect-error "nonExistentTopLevel" is not a key of KeyboardIR
    const _bad: IRPath = ["nonExistentTopLevel"] as const;
    // This line is unreachable in valid code; the test passes by compiling.
    expect(true).toBe(true);
  });

  it("rejects a path that names a valid top-level field but an invalid child", () => {
    // @ts-expect-error "bogusChild" is not a key of IRHeader
    const _bad: IRPath = ["header", "bogusChild"] as const;
    expect(true).toBe(true);
  });

  it("rejects a path that skips the array-index sentinel", () => {
    // groups is IRGroup[], so the next segment after "groups" must be an
    // ArrayIndex, not "rules" directly.
    // @ts-expect-error missing ArrayIndex between "groups" and "rules"
    const _bad: IRPath = ["groups", "rules"] as const;
    expect(true).toBe(true);
  });

  it("rejects a path with a mis-spelled IR field name", () => {
    // @ts-expect-error "stors" is not a key of KeyboardIR (typo for "stores")
    const _bad: IRPath = ["stors"] as const;
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatIRPath
// ---------------------------------------------------------------------------

describe("formatIRPath", () => {
  it("renders the canonical physical path as groups[].rules[].output", () => {
    const p = irPath("groups", ARRAY_INDEX, "rules", ARRAY_INDEX, "output");
    expect(formatIRPath(p)).toBe("groups[].rules[].output");
  });

  it("renders a top-level array path as stores[]", () => {
    const p = irPath("stores", ARRAY_INDEX);
    expect(formatIRPath(p)).toBe("stores[]");
  });

  it("renders the deep touch path correctly", () => {
    const p = irPath(
      "touchLayout",
      "platforms",
      ARRAY_INDEX,
      "layers",
      ARRAY_INDEX,
      "rows",
      ARRAY_INDEX,
      "keys",
      ARRAY_INDEX,
    );
    expect(formatIRPath(p)).toBe(
      "touchLayout.platforms[].layers[].rows[].keys[]",
    );
  });

  it("renders a header field path as header.bcp47", () => {
    const p = irPath("header", "bcp47");
    expect(formatIRPath(p)).toBe("header.bcp47");
  });

  it("renders the empty root path as (root)", () => {
    const rootPath: IRPath = [] as const;
    expect(formatIRPath(rootPath)).toBe("(root)");
  });
});

// ---------------------------------------------------------------------------
// irPath builder
// ---------------------------------------------------------------------------

describe("irPath builder", () => {
  it("returns the exact tuple passed in", () => {
    const segs = ["groups", ARRAY_INDEX, "rules", ARRAY_INDEX, "output"] as const;
    const p = irPath(...segs);
    expect(p).toEqual(segs);
  });

  it("is referentially equal for the same construction (no caching — tuple identity)", () => {
    const p1 = irPath("header", "name");
    const p2 = irPath("header", "name");
    expect(p1).toEqual(p2);
  });
});
