import { describe, it, expect } from "vitest";
import { parseTouchLayout, emitTouchLayout } from "./parse-touch.js";

const MINIMAL_TOUCH = JSON.stringify({
  tablet: {
    displayUnderlying: false,
    layer: [
      {
        id: "default",
        row: [
          {
            id: 1,
            key: [
              { id: "K_A", text: "a" },
              { id: "K_B", text: "b" },
            ],
          },
        ],
      },
      {
        id: "shift",
        row: [
          {
            id: 1,
            key: [
              { id: "K_A", text: "A", nextlayer: "default" },
            ],
          },
        ],
      },
    ],
  },
});

const MULTI_PLATFORM_TOUCH = JSON.stringify({
  desktop: {
    layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_D", text: "desktop" }] }] }],
  },
  tablet: {
    layer: [
      { id: "default", row: [{ id: 1, key: [{ id: "K_T", text: "tablet" }] }] },
      { id: "extra",   row: [{ id: 1, key: [{ id: "K_E", text: "extra" }] }] },
    ],
  },
  phone: {
    layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_P", text: "phone" }] }] }],
  },
});

const SUBKEY_TOUCH = JSON.stringify({
  tablet: {
    layer: [
      {
        id: "symbol",
        row: [
          {
            id: 1,
            key: [
              {
                id: "U_0028",
                text: "(",
                sk: [
                  { id: "U_005B", text: "[" },
                  { id: "U_007B", text: "{" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
});

describe("parseTouchLayout", () => {
  it("returns TouchLayoutIR with correct platform count", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    expect(ir.platforms.length).toBe(1);
  });

  it("tablet platform has two layers", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const tablet = ir.platforms.find(p => p.id === "tablet");
    expect(tablet?.layers.length).toBe(2);
  });

  it("first layer of tablet platform has id 'default'", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const tablet = ir.platforms.find(p => p.id === "tablet");
    expect(tablet?.layers[0]?.id).toBe("default");
  });

  it("second layer of tablet platform has id 'shift'", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const tablet = ir.platforms.find(p => p.id === "tablet");
    expect(tablet?.layers[1]?.id).toBe("shift");
  });

  it("keys in first layer have correct id and text", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const tablet = ir.platforms.find(p => p.id === "tablet");
    const row0 = tablet?.layers[0]?.rows[0];
    expect(row0?.keys[0]?.id).toBe("K_A");
    expect(row0?.keys[0]?.text).toBe("a");
    expect(row0?.keys[1]?.id).toBe("K_B");
  });

  it("nextlayer is preserved on key", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const tablet = ir.platforms.find(p => p.id === "tablet");
    const shiftLayer = tablet?.layers.find(l => l.id === "shift");
    expect(shiftLayer?.rows[0]?.keys[0]?.nextlayer).toBe("default");
  });

  it("each key has a unique nodeId", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const allIds = ir.platforms
      .flatMap(p => p.layers)
      .flatMap(l => l.rows)
      .flatMap(r => r.keys)
      .map(k => k.nodeId);
    const unique = new Set(allIds);
    expect(unique.size).toBe(allIds.length);
  });

  it("populates nodeIds array", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    expect(ir.nodeIds.length).toBeGreaterThan(0);
    const [key, ref] = ir.nodeIds[0] ?? [];
    expect(typeof key).toBe("string");
    expect(ref?.kind).toBe("touchKey");
  });

  it("multi-platform: desktop platform is present with its default layer", () => {
    const ir = parseTouchLayout(MULTI_PLATFORM_TOUCH);
    const desktop = ir.platforms.find(p => p.id === "desktop");
    expect(desktop).toBeDefined();
    expect(desktop?.layers[0]?.rows[0]?.keys[0]?.id).toBe("K_D");
  });

  it("multi-platform: tablet-only layer 'extra' is included in tablet platform", () => {
    const ir = parseTouchLayout(MULTI_PLATFORM_TOUCH);
    const tablet = ir.platforms.find(p => p.id === "tablet");
    const extra = tablet?.layers.find(l => l.id === "extra");
    expect(extra).toBeDefined();
    expect(extra?.rows[0]?.keys[0]?.id).toBe("K_E");
  });

  it("multi-platform: each platform has its own default layer (no merging)", () => {
    const ir = parseTouchLayout(MULTI_PLATFORM_TOUCH);
    // All three platforms should be present, each with their own default layer
    expect(ir.platforms.length).toBe(3);
    const desktopDefault = ir.platforms.find(p => p.id === "desktop")?.layers.find(l => l.id === "default");
    const tabletDefault = ir.platforms.find(p => p.id === "tablet")?.layers.find(l => l.id === "default");
    const phoneDefault = ir.platforms.find(p => p.id === "phone")?.layers.find(l => l.id === "default");
    expect(desktopDefault?.rows[0]?.keys[0]?.id).toBe("K_D");
    expect(tabletDefault?.rows[0]?.keys[0]?.id).toBe("K_T");
    expect(phoneDefault?.rows[0]?.keys[0]?.id).toBe("K_P");
  });

  it("subkeys (sk) are recursively parsed with their own nodeIds", () => {
    const ir = parseTouchLayout(SUBKEY_TOUCH);
    const tablet = ir.platforms.find(p => p.id === "tablet");
    const symbolLayer = tablet?.layers.find(l => l.id === "symbol");
    const parentKey = symbolLayer?.rows[0]?.keys[0];
    expect(parentKey?.id).toBe("U_0028");
    expect(parentKey?.sk?.length).toBe(2);
    expect(parentKey?.sk?.[0]?.id).toBe("U_005B");
    expect(parentKey?.sk?.[0]?.nodeId).toBeTruthy();
  });

  it("throws SyntaxError on invalid JSON", () => {
    expect(() => parseTouchLayout("not json")).toThrow(SyntaxError);
  });

  it("throws TypeError on JSON array", () => {
    expect(() => parseTouchLayout("[]")).toThrow(TypeError);
  });

  // sp / width / hint preservation -----------------------------------------

  it("parses sp, width, and hint from string wire values to correct IR types", () => {
    const json = JSON.stringify({
      phone: {
        layer: [{
          id: "default",
          row: [{
            id: 1,
            key: [{ id: "K_A", text: "a", sp: "1", width: "150", hint: "x" }],
          }],
        }],
      },
    });
    const ir = parseTouchLayout(json);
    const key = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(key?.sp).toBe(1);
    expect(key?.width).toBe(150);
    expect(key?.hint).toBe("x");
  });

  it("parses sp and width when supplied as numbers (robustness)", () => {
    const json = JSON.stringify({
      phone: {
        layer: [{
          id: "default",
          row: [{
            id: 1,
            key: [{ id: "K_B", text: "b", sp: 2, width: 200 }],
          }],
        }],
      },
    });
    const ir = parseTouchLayout(json);
    const key = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(key?.sp).toBe(2);
    expect(key?.width).toBe(200);
  });

  it("leaves sp, width, hint undefined when absent from raw key", () => {
    const ir = parseTouchLayout(MINIMAL_TOUCH);
    const key = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(key?.sp).toBeUndefined();
    expect(key?.width).toBeUndefined();
    expect(key?.hint).toBeUndefined();
  });

  it("does not set sp or width when raw values are empty strings or NaN-producing", () => {
    const json = JSON.stringify({
      phone: {
        layer: [{
          id: "default",
          row: [{
            id: 1,
            key: [{ id: "K_C", text: "c", sp: "", width: "notanumber" }],
          }],
        }],
      },
    });
    const ir = parseTouchLayout(json);
    const key = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(key?.sp).toBeUndefined();
    expect(key?.width).toBeUndefined();
  });

  it("sp=0 is preserved (falsy but valid spacer key class)", () => {
    const json = JSON.stringify({
      phone: {
        layer: [{
          id: "default",
          row: [{
            id: 1,
            key: [{ id: "K_SP0", sp: "0", width: "50" }],
          }],
        }],
      },
    });
    const ir = parseTouchLayout(json);
    const key = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(key?.sp).toBe(0);
    expect(key?.width).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// emitTouchLayout — kmc-kmn compat: row id + platform defaultHint
// ---------------------------------------------------------------------------

describe("emitTouchLayout", () => {
  it("emits numeric row id on every row (required by TouchLayoutFileWriter.fixup)", () => {
    // Parse a fixture that has row ids, then emit and re-parse to confirm
    // the emitted JSON includes id on every row.
    const ir = parseTouchLayout(MULTI_PLATFORM_TOUCH);
    const json = emitTouchLayout(ir);
    const reparsed = JSON.parse(json) as Record<string, { layer: Array<{ row: Array<{ id?: number }> }> }>;
    for (const [, platform] of Object.entries(reparsed)) {
      for (const layer of platform.layer) {
        for (let i = 0; i < layer.row.length; i++) {
          expect(layer.row[i]!.id, `row[${i}].id must be present`).toBe(i + 1);
        }
      }
    }
  });

  it("emits defaultHint on every platform (schema-conformant output)", () => {
    const ir = parseTouchLayout(MULTI_PLATFORM_TOUCH);
    const json = emitTouchLayout(ir);
    const reparsed = JSON.parse(json) as Record<string, { defaultHint?: string }>;
    for (const [pid, platform] of Object.entries(reparsed)) {
      expect(platform.defaultHint, `platform "${pid}" must have defaultHint`).toBeTruthy();
    }
  });

  it("round-trips sp/width/hint: parse → emit → reparse preserves numeric IR and string wire values", () => {
    const source = JSON.stringify({
      phone: {
        layer: [{
          id: "default",
          row: [{
            id: 1,
            key: [{ id: "K_A", text: "a", sp: "1", width: "150", hint: "x" }],
          }],
        }],
      },
    });
    const ir = parseTouchLayout(source);
    // IR must have numeric sp/width
    const irKey = ir.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(irKey?.sp).toBe(1);
    expect(irKey?.width).toBe(150);
    expect(irKey?.hint).toBe("x");

    // Emitted JSON must re-encode sp/width as strings
    const emitted = emitTouchLayout(ir);
    const reparsed = JSON.parse(emitted) as Record<string, { layer: Array<{ row: Array<{ key: Array<{ sp?: string; width?: string; hint?: string }> }> }> }>;
    const wireKey = reparsed["phone"]?.layer[0]?.row[0]?.key[0];
    expect(wireKey?.sp).toBe("1");
    expect(wireKey?.width).toBe("150");
    expect(wireKey?.hint).toBe("x");

    // Re-parsed IR from emitted JSON should also have numeric sp/width
    const ir2 = parseTouchLayout(emitted);
    const irKey2 = ir2.platforms[0]?.layers[0]?.rows[0]?.keys[0];
    expect(irKey2?.sp).toBe(1);
    expect(irKey2?.width).toBe(150);
    expect(irKey2?.hint).toBe("x");
  });

  it("round-trips key ids and text through emit → reparse", () => {
    const ir = parseTouchLayout(SUBKEY_TOUCH);
    const json = emitTouchLayout(ir);
    const reparsed = JSON.parse(json) as Record<string, { layer: Array<{ row: Array<{ key: Array<{ id: string; sk?: Array<{ id: string }> }> }> }> }>;
    const tabletLayer = reparsed["tablet"]?.layer[0];
    const parentKey = tabletLayer?.row[0]?.key[0];
    expect(parentKey?.id).toBe("U_0028");
    expect(parentKey?.sk?.length).toBe(2);
    expect(parentKey?.sk?.[0]?.id).toBe("U_005B");
  });
});
