import { describe, it, expect } from "vitest";
import { scaffoldTouchLayout, buildMinimalPhoneTouchLayout } from "./scaffoldTouchLayout.js";
import type {
  KeyboardIR,
  IRGroup,
  IRRule,
  TouchLayoutIR,
  Pattern,
} from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture builder helpers
// ---------------------------------------------------------------------------

let _nodeSeq = 0;
function freshId(prefix: string): string {
  return `${prefix}:${++_nodeSeq}`;
}

/** Build a minimal KeyboardIR with no groups and no touchLayout. */
function makeMinimalIR(overrides: Partial<KeyboardIR> = {}): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test_kb",
      name: "Test KB",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
    ...overrides,
  };
}

/** Build a simple IRRule for a single vkey with given modifiers and a char output. */
function makeCharRule(
  vkey: string,
  modifiers: string[],
  output: string,
): IRRule {
  return {
    nodeId: freshId("rule"),
    context: [{ kind: "vkey", name: vkey, modifiers }],
    output: [{ kind: "char", value: output }],
  };
}

/** Build a single non-readonly IRGroup containing the given rules. */
function makeGroup(rules: IRRule[]): IRGroup {
  return {
    nodeId: freshId("group"),
    name: "main",
    usingKeys: true,
    rules,
    readonly: false,
  };
}

/** Build a minimal Pattern with strategyId starting with "S-02". */
function makeS02Pattern(
  vkey: string,
  successorChar: string,
  nodeId: string,
): Pattern {
  // ownedNodes path: rule has deadkey context + char output, vkey in context.
  const ruleNodeId = nodeId;
  return {
    id: "test_s02_pattern",
    title: "Test deadkey",
    description: "Test deadkey pattern",
    category: "desktop",
    appliesTo: [],
    strategyId: "S-02",
    origin: "recognized",
    ownedNodes: [{ nodeId: ruleNodeId, kind: "rule" }],
    questions: [],
    kmnFragment: `+ [K_ACUTE] > deadkey(dk1)\n+ [dk1 ${vkey}] > '${successorChar}'`,
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: "test",
    reviewDate: "2026-06-18",
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("scaffoldTouchLayout", () => {
  describe("null / empty IR", () => {
    it("returns a TouchLayoutIR with at least one platform when IR has no groups and no touchLayout", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);

      expect(result).toBeDefined();
      expect(result.platforms).toBeDefined();
      expect(result.platforms.length).toBeGreaterThanOrEqual(1);
    });

    it("the generated platform has id 'phone'", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);

      const phone = result.platforms.find((p) => p.id === "phone");
      expect(phone).toBeDefined();
    });

    it("the phone platform has a default layer", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);

      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default");
      expect(defaultLayer).toBeDefined();
    });

    it("the phone platform has at least one row in the default layer", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);

      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      expect(defaultLayer.rows.length).toBeGreaterThanOrEqual(1);
    });

    it("does not mutate the input IR", () => {
      const ir = makeMinimalIR();
      const groupsBefore = ir.groups.length;
      const patternsBefore = ir.recognizedPatterns.length;

      scaffoldTouchLayout(ir);

      expect(ir.groups.length).toBe(groupsBefore);
      expect(ir.recognizedPatterns.length).toBe(patternsBefore);
      expect(ir.touchLayout).toBeUndefined();
    });
  });

  describe("default layer mapping", () => {
    it("IR with a simple base-layer key (no modifiers) produces a phone platform touch key with the matching output", () => {
      // Rule: K_A with no modifiers → 'a'
      const rule = makeCharRule("K_A", [], "a");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;

      // Find the K_A key across all rows.
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === "K_A");
      expect(kaKey).toBeDefined();
      expect(kaKey?.output).toBe("a");
      expect(kaKey?.text).toBe("a");
    });

    it("default layer does not carry SHIFT-modified output", () => {
      // Rule: K_A with SHIFT → 'A'
      const rule = makeCharRule("K_A", ["SHIFT"], "A");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;

      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === "K_A");
      // The key exists in the default layer (seeded from QWERTY), but without
      // a desktop base-layer rule its output should be absent (not 'A').
      if (kaKey !== undefined) {
        expect(kaKey.output).not.toBe("A");
      }
    });
  });

  describe("shift layer", () => {
    it("IR with a SHIFT-modified key produces a shift layer on the phone platform", () => {
      const rule = makeCharRule("K_A", ["SHIFT"], "A");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const shiftLayer = phone.layers.find((l) => l.id === "shift");
      expect(shiftLayer).toBeDefined();
    });

    it("shift layer contains the correct output for the SHIFT-modified key", () => {
      const rule = makeCharRule("K_A", ["SHIFT"], "A");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const shiftLayer = phone.layers.find((l) => l.id === "shift")!;
      const allKeys = shiftLayer.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === "K_A");
      expect(kaKey).toBeDefined();
      expect(kaKey?.output).toBe("A");
    });
  });

  describe("altgr layer", () => {
    it("IR with an RALT-modified key produces an altgr layer", () => {
      const rule = makeCharRule("K_A", ["RALT"], "à");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const altgrLayer = phone.layers.find((l) => l.id === "altgr");
      expect(altgrLayer).toBeDefined();
    });

    it("altgr layer carries the correct output for the RALT key", () => {
      const rule = makeCharRule("K_A", ["RALT"], "à");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });

      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const altgrLayer = phone.layers.find((l) => l.id === "altgr")!;
      const allKeys = altgrLayer.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === "K_A");
      expect(kaKey).toBeDefined();
      expect(kaKey?.output).toBe("à");
    });

    it("IR without any RALT keys does NOT produce an altgr layer", () => {
      // Only base-layer and SHIFT rules — no RALT.
      const rules = [
        makeCharRule("K_A", [], "a"),
        makeCharRule("K_A", ["SHIFT"], "A"),
        makeCharRule("K_B", [], "b"),
      ];
      const ir = makeMinimalIR({ groups: [makeGroup(rules)] });

      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const altgrLayer = phone.layers.find((l) => l.id === "altgr");
      expect(altgrLayer).toBeUndefined();
    });

    it("RALT+SHIFT combination is NOT mapped to a top-level touch layer (spec §8 rule)", () => {
      // RALT+SHIFT rules should be ignored; no altgr layer should appear unless
      // there is at least one RALT-only (no SHIFT) rule present.
      const raltShiftRule = makeCharRule("K_A", ["RALT", "SHIFT"], "Ä");
      const ir = makeMinimalIR({ groups: [makeGroup([raltShiftRule])] });

      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const altgrLayer = phone.layers.find((l) => l.id === "altgr");
      // RALT+SHIFT → no altgr layer
      expect(altgrLayer).toBeUndefined();
    });
  });

  describe("deadkey → sk[]", () => {
    it("recognized S-02 pattern causes relevant touch key to have non-empty sk[]", () => {
      const vkey = "K_E";
      const successorChar = "é";

      // Build owned rule: deadkey context + vkey + char output
      const ownedNodeId = freshId("rule");
      const deadkeyRule: IRRule = {
        nodeId: ownedNodeId,
        context: [
          { kind: "deadkey", name: "dk1" } as never,
          { kind: "vkey", name: vkey, modifiers: [] },
        ],
        output: [{ kind: "char", value: successorChar }],
      };

      const pattern = makeS02Pattern(vkey, successorChar, ownedNodeId);

      const ir = makeMinimalIR({
        groups: [makeGroup([deadkeyRule])],
        recognizedPatterns: [pattern],
      });

      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey);

      expect(targetKey).toBeDefined();
      expect(targetKey?.sk).toBeDefined();
      expect(targetKey?.sk?.length).toBeGreaterThan(0);
    });

    it("sk[] entries carry the correct successor character (via text; U_-id, no output field)", () => {
      const vkey = "K_E";
      const successorChar = "é";
      const ownedNodeId = freshId("rule");

      const deadkeyRule: IRRule = {
        nodeId: ownedNodeId,
        context: [
          { kind: "deadkey", name: "dk1" } as never,
          { kind: "vkey", name: vkey, modifiers: [] },
        ],
        output: [{ kind: "char", value: successorChar }],
      };

      const pattern = makeS02Pattern(vkey, successorChar, ownedNodeId);
      const ir = makeMinimalIR({
        groups: [makeGroup([deadkeyRule])],
        recognizedPatterns: [pattern],
      });

      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey)!;

      // U_-id sk entries: character is in `text`; `output` is omitted.
      // é = U+00E9 → id "U_00E9"
      const skTexts = targetKey.sk!.map((s) => s.text);
      expect(skTexts).toContain(successorChar);
      // Confirm the id is in U_ form, not the old _sk_ compound form.
      const skIds = targetKey.sk!.map((s) => s.id);
      expect(skIds.some((id) => /^U_[0-9A-F]{4,5}$/i.test(id))).toBe(true);
    });

    it("hint is NOT set on a S-02 key — dot comes from platform defaultHint", () => {
      // scaffoldTouchLayout must not assign a per-key hint. The Keyman runtime
      // renders the dot (•) automatically when platform defaultHint is "dot"
      // and the key has sk entries.
      const vkey = "K_A";
      const successorChar = "à";
      const ownedNodeId = freshId("rule");

      const deadkeyRule: IRRule = {
        nodeId: ownedNodeId,
        context: [
          { kind: "deadkey", name: "dk1" } as never,
          { kind: "vkey", name: vkey, modifiers: [] },
        ],
        output: [{ kind: "char", value: successorChar }],
      };

      const pattern = makeS02Pattern(vkey, successorChar, ownedNodeId);
      const ir = makeMinimalIR({
        groups: [makeGroup([deadkeyRule])],
        recognizedPatterns: [pattern],
      });

      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey)!;

      // hint must be undefined — no character hint is generated
      expect(targetKey.hint).toBeUndefined();
      // sk must still be populated (that behaviour is unchanged)
      expect(targetKey.sk).toBeDefined();
      expect(targetKey.sk!.length).toBeGreaterThan(0);
    });

    it("a pattern whose strategyId does NOT start with S-02 does not produce sk[]", () => {
      // S-01 pattern — should not generate longpress sk[] entries.
      const vkey = "K_A";
      const pattern: Pattern = {
        id: "test_s01_pattern",
        title: "S-01 pattern",
        description: "S-01 does not generate sk[]",
        category: "desktop",
        appliesTo: [],
        strategyId: "S-01",
        origin: "recognized",
        ownedNodes: [],
        questions: [],
        kmnFragment: `+ [${vkey}] > 'a'`,
        tests: [],
        validatedForFamilies: [],
        sourceKeyboards: [],
        reviewedBy: "test",
        reviewDate: "2026-06-18",
      };

      const ir = makeMinimalIR({ recognizedPatterns: [pattern] });
      const result = scaffoldTouchLayout(ir);

      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const kaKey = allKeys.find((k) => k.id === vkey);

      // Key may or may not exist in the layout, but sk must not be populated.
      if (kaKey !== undefined) {
        expect(kaKey.sk === undefined || kaKey.sk.length === 0).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Polyfill-based width-uniformity helper (activeLayout.ts formula)
  // ---------------------------------------------------------------------------

  /**
   * Computes rendered proportional widths for all visible letter keys across
   * all non-functional rows of a phone default layer, using the KMW
   * activeLayout.ts polyfill formula:
   *
   *   rowSum     = sum(key.width||100 + key.pad||15) for all keys in row
   *   totalWidth = max(rowSum) + 15 (DEFAULT_RIGHT_MARGIN)
   *   non-last key renderedWidth = key.width || 100
   *   last key renderedWidth     = totalWidth
   *                                  - sum_non_last(width+pad)
   *                                  - finalKey.pad
   *                                  - 15 (rightMargin)
   *
   * Returns { totalWidth, letterRatios: Array<{ rowIdx, keyId, ratio }> }
   */
  function computeLetterKeyRatios(
    layers: Array<{ id: string; rows: Array<{ keys: Array<{ id: string; sp?: number; width?: number; pad?: number }> }> }>,
  ): {
    totalWidth: number;
    letterRatios: Array<{ rowIdx: number; keyId: string; ratio: number }>;
  } {
    const defaultLayer = layers.find((l) => l.id === "default");
    if (!defaultLayer) return { totalWidth: 0, letterRatios: [] };

    const DEFAULT_W = 100;
    const DEFAULT_P = 15;
    const RIGHT_MARGIN = 15;

    const rowSums = defaultLayer.rows.map((r) =>
      r.keys.reduce((s, k) => s + (k.width ?? DEFAULT_W) + (k.pad ?? DEFAULT_P), 0),
    );
    const totalWidth = Math.max(...rowSums) + RIGHT_MARGIN;

    const letterRatios: Array<{ rowIdx: number; keyId: string; ratio: number }> = [];

    for (let ri = 0; ri < defaultLayer.rows.length; ri++) {
      const row = defaultLayer.rows[ri]!;
      for (let ki = 0; ki < row.keys.length; ki++) {
        const k = row.keys[ki]!;
        // Skip spacers (sp===10), special/system keys (sp===1), and wide keys
        // like K_SPACE (width !== 100 and not a spacer) — only track standard letter keys.
        if (k.sp !== undefined) continue;
        if ((k.width ?? 100) !== 100) continue;
        const isLast = ki === row.keys.length - 1;
        let renderedWidth: number;
        if (isLast) {
          const nonLastSum = row.keys
            .slice(0, -1)
            .reduce((s, k2) => s + (k2.width ?? DEFAULT_W) + (k2.pad ?? DEFAULT_P), 0);
          renderedWidth = totalWidth - nonLastSum - (k.pad ?? DEFAULT_P) - RIGHT_MARGIN;
        } else {
          renderedWidth = k.width ?? DEFAULT_W;
        }
        letterRatios.push({ rowIdx: ri, keyId: k.id, ratio: renderedWidth / totalWidth });
      }
    }

    return { totalWidth, letterRatios };
  }

  describe("key sizing — slot-padding: polyfill-based uniformity (Case A, QWERTY seed)", () => {
    it("all letter keys in all rows render at ≈100/1165 (max/min ratio < 1.05)", () => {
      // Uses the real activeLayout.ts polyfill formula — catches totalWidth-inflation bugs.
      const rule = makeCharRule("K_A", [], "a");
      const ir = makeMinimalIR({ groups: [makeGroup([rule])] });
      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;

      const { totalWidth, letterRatios } = computeLetterKeyRatios(phone.layers);
      expect(totalWidth).toBe(1165);
      expect(letterRatios.length).toBeGreaterThan(0);

      const ratioValues = letterRatios.map((x) => x.ratio);
      const minR = Math.min(...ratioValues);
      const maxR = Math.max(...ratioValues);
      expect(maxR / minR).toBeLessThan(1.05);
    });

    it("totalWidth is 1165 (= 10 * 115 + 15) — no row inflates it", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const { totalWidth } = computeLetterKeyRatios(phone.layers);
      expect(totalWidth).toBe(1165);
    });

    it("all letter keys have width === 100", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      for (let rowIdx = 0; rowIdx < 4; rowIdx++) {
        const row = defaultLayer.rows[rowIdx]!;
        const letterKeys = row.keys.filter((k) => k.sp === undefined);
        for (const key of letterKeys) {
          expect(key.width, `row ${rowIdx} key ${key.id}`).toBe(100);
        }
      }
    });

    it("full 10-key rows (rows 0-2) have no spacers and no pad on first key", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      for (const rowIdx of [0, 1, 2]) {
        const row = defaultLayer.rows[rowIdx]!;
        expect(row.keys.some((k) => k.sp === 10), `row ${rowIdx} spacer`).toBe(false);
        expect(row.keys[0]!.pad, `row ${rowIdx} first-key pad`).toBeUndefined();
      }
    });

    it("7-key Z-row (row 3) has symmetric slot-padding: 1 leading + 2 trailing spacers, no pad on K_Z", () => {
      const ir = makeMinimalIR();
      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const zRow = defaultLayer.rows[3]!;

      const spacers = zRow.keys.filter((k) => k.sp === 10);
      expect(spacers).toHaveLength(3); // gap = 10 - 7 = 3

      // Leading: floor(3/2) = 1 spacer before K_Z; trailing: 2 spacers after K_M
      expect(zRow.keys[0]!.sp).toBe(10); // leading spacer
      expect(zRow.keys[1]!.id).toBe("K_Z"); // first letter key
      expect(zRow.keys[1]!.pad).toBeUndefined(); // no pad on letter key
      expect(zRow.keys[zRow.keys.length - 1]!.sp).toBe(10); // trailing spacer
      expect(zRow.keys[zRow.keys.length - 2]!.sp).toBe(10); // trailing spacer 2
    });
  });

  describe("buildMinimalPhoneTouchLayout — slot-padding: polyfill-based uniformity", () => {
    it("all letter keys in all rows render at ≈100/1165 (max/min ratio < 1.05)", () => {
      // Uses the real activeLayout.ts polyfill formula.
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;

      const { totalWidth, letterRatios } = computeLetterKeyRatios(phone.layers);
      expect(totalWidth).toBe(1165);
      expect(letterRatios.length).toBeGreaterThan(0);

      const ratioValues = letterRatios.map((x) => x.ratio);
      const minR = Math.min(...ratioValues);
      const maxR = Math.max(...ratioValues);
      expect(maxR / minR).toBeLessThan(1.05);
    });

    it("totalWidth is 1165 — no row inflates it", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const { totalWidth } = computeLetterKeyRatios(phone.layers);
      expect(totalWidth).toBe(1165);
    });

    it("all letter keys have width === 100", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      for (const layer of phone.layers) {
        for (let rowIdx = 0; rowIdx < 3; rowIdx++) {
          const row = layer.rows[rowIdx]!;
          const letterKeys = row.keys.filter((k) => k.sp === undefined);
          for (const key of letterKeys) {
            expect(key.width, `layer ${layer.id} row ${rowIdx} key ${key.id}`).toBe(100);
          }
        }
      }
    });

    it("10-key QWERTY row (row 0) has no spacers and no pad on first key", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const qwertyRow = defaultLayer.rows[0]!;

      expect(qwertyRow.keys.some((k) => k.sp === 10)).toBe(false);
      expect(qwertyRow.keys[0]!.pad).toBeUndefined();
    });

    it("9-key ASDF row (row 1) has 1 trailing spacer (gap=1: leading=0, trailing=1), no pad on K_A", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const asdfRow = defaultLayer.rows[1]!;

      const spacers = asdfRow.keys.filter((k) => k.sp === 10);
      expect(spacers).toHaveLength(1); // gap = 10 - 9 = 1

      // gap=1: leading=0, trailing=1 → K_A is first key, trailing spacer is last
      expect(asdfRow.keys[0]!.id).toBe("K_A");
      expect(asdfRow.keys[0]!.pad).toBeUndefined();
      expect(asdfRow.keys[asdfRow.keys.length - 1]!.sp).toBe(10);
    });

    it("7-key Z-row (row 2) has 3 slot-padding spacers (1 leading + 2 trailing), no pad on K_Z", () => {
      const layout = buildMinimalPhoneTouchLayout();
      const phone = layout.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const zRow = defaultLayer.rows[2]!;

      const spacers = zRow.keys.filter((k) => k.sp === 10);
      expect(spacers).toHaveLength(3); // gap = 10 - 7 = 3

      // gap=3: leading=1, trailing=2
      expect(zRow.keys[0]!.sp).toBe(10); // leading spacer
      expect(zRow.keys[1]!.id).toBe("K_Z"); // first letter key
      expect(zRow.keys[1]!.pad).toBeUndefined(); // no centering pad on letter key
      expect(zRow.keys[zRow.keys.length - 1]!.sp).toBe(10); // trailing spacer
      expect(zRow.keys[zRow.keys.length - 2]!.sp).toBe(10); // trailing spacer 2
    });
  });

  describe("augments existing touchLayout", () => {
    it("when ir.touchLayout is already set, the function returns a TouchLayoutIR without throwing", () => {
      const existingPhoneLayer = {
        id: "default",
        rows: [
          {
            keys: [
              {
                nodeId: freshId("key"),
                id: "K_A",
                text: "a",
                output: "a",
              },
            ],
          },
        ],
      };

      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [existingPhoneLayer],
          },
        ],
        nodeIds: [],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });

      let result: TouchLayoutIR | undefined;
      expect(() => {
        result = scaffoldTouchLayout(ir);
      }).not.toThrow();

      expect(result).toBeDefined();
      expect(result!.platforms).toBeDefined();
    });

    it("when ir.touchLayout has a phone platform, that platform is preserved in the result", () => {
      const existingKey = {
        nodeId: freshId("key"),
        id: "K_A",
        text: "a",
        output: "a",
      };
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [
              {
                id: "default",
                rows: [{ keys: [existingKey] }],
              },
            ],
          },
        ],
        nodeIds: [],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });
      const result = scaffoldTouchLayout(ir);

      const phone = result.platforms.find((p) => p.id === "phone");
      expect(phone).toBeDefined();
    });

    it("when ir.touchLayout is set without a phone platform, a phone platform is added", () => {
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "tablet",
            layers: [
              {
                id: "default",
                rows: [{ keys: [{ nodeId: freshId("key"), id: "K_A" }] }],
              },
            ],
          },
        ],
        nodeIds: [],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });
      const result = scaffoldTouchLayout(ir);

      const phone = result.platforms.find((p) => p.id === "phone");
      expect(phone).toBeDefined();
      // The tablet platform must also still be present.
      const tablet = result.platforms.find((p) => p.id === "tablet");
      expect(tablet).toBeDefined();
    });

    it("when ir.touchLayout is set with existing nodeIds, they are preserved in the result", () => {
      const existingNodeEntry: [string, import("@keyboard-studio/contracts").IRNodeRef] = [
        "phone:default:K_A",
        { nodeId: "existing_node_1", kind: "rule" },
      ];
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [
              {
                id: "default",
                rows: [{ keys: [{ nodeId: "existing_node_1", id: "K_A" }] }],
              },
            ],
          },
        ],
        nodeIds: [existingNodeEntry],
      };

      const ir = makeMinimalIR({ touchLayout: existingTouchLayout });
      const result = scaffoldTouchLayout(ir);

      // The existing nodeId should be preserved.
      expect(result.nodeIds).toContainEqual(existingNodeEntry);
    });

    it("augments sk[] from S-02 deadkey patterns into the existing phone platform's default layer", () => {
      const vkey = "K_E";
      const successorChar = "ê";
      const ownedNodeId = freshId("rule");

      const existingKey = {
        nodeId: freshId("key"),
        id: vkey,
        text: "e",
        output: "e",
      };
      const existingTouchLayout: TouchLayoutIR = {
        platforms: [
          {
            id: "phone",
            layers: [
              {
                id: "default",
                rows: [{ keys: [existingKey] }],
              },
            ],
          },
        ],
        nodeIds: [],
      };

      const deadkeyRule: IRRule = {
        nodeId: ownedNodeId,
        context: [
          { kind: "deadkey", name: "dk1" } as never,
          { kind: "vkey", name: vkey, modifiers: [] },
        ],
        output: [{ kind: "char", value: successorChar }],
      };

      const pattern = makeS02Pattern(vkey, successorChar, ownedNodeId);
      const ir = makeMinimalIR({
        groups: [makeGroup([deadkeyRule])],
        recognizedPatterns: [pattern],
        touchLayout: existingTouchLayout,
      });

      const result = scaffoldTouchLayout(ir);
      const phone = result.platforms.find((p) => p.id === "phone")!;
      const defaultLayer = phone.layers.find((l) => l.id === "default")!;
      const allKeys = defaultLayer.rows.flatMap((r) => r.keys);
      const targetKey = allKeys.find((k) => k.id === vkey);

      expect(targetKey).toBeDefined();
      expect(targetKey?.sk).toBeDefined();
      expect(targetKey?.sk?.length).toBeGreaterThan(0);
      // U_-id sk entries: character is in `text`; `output` is omitted.
      const skTexts = targetKey?.sk?.map((s) => s.text);
      expect(skTexts).toContain(successorChar);
    });
  });
});
