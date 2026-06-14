import { describe, it, expect } from "vitest";
import { checkControlKeyDrift } from "./check-18-4-control-key-drift.js";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";

const PATH = "source/test.keyman-touch-layout";

/** Build a two-layer IR where K_BKSP appears in both layers. */
function makeIRTwoLayers(
  layer1BkspOpts: { sp?: number; width?: number; rowIndex?: number; keyIndex?: number },
  layer2BkspOpts: { sp?: number; width?: number; rowIndex?: number; keyIndex?: number }
): TouchLayoutIR {
  function makeRow(
    includeBksp: boolean,
    opts: { sp?: number; width?: number; rowIndex?: number; keyIndex?: number },
    rowIdx: number
  ) {
    // Put key at the specified position. Default: rowIdx matches opts.rowIndex or 0.
    if (!includeBksp) return { keys: [{ nodeId: "k-other", id: "K_A" }] };

    const bksp: Record<string, unknown> = { nodeId: "k-bksp", id: "K_BKSP" };
    if (opts.sp !== undefined) bksp["sp"] = opts.sp;
    if (opts.width !== undefined) bksp["width"] = opts.width;

    // Build row with enough filler keys to position K_BKSP at opts.keyIndex
    const keyIdx = opts.keyIndex ?? 0;
    const fillers = Array.from({ length: keyIdx }, (_, i) => ({
      nodeId: `filler-r${rowIdx}-${i}`,
      id: `K_FILLER_${i}`,
    }));
    return { keys: [...fillers, bksp] };
  }

  const rowIdx1 = layer1BkspOpts.rowIndex ?? 0;
  const rowIdx2 = layer2BkspOpts.rowIndex ?? 0;

  function buildRows(
    opts: { sp?: number; width?: number; rowIndex?: number; keyIndex?: number },
    rowIdx: number
  ) {
    const rows = Array.from({ length: Math.max(rowIdx + 1, 1) }, (_, i) => {
      if (i === rowIdx) return makeRow(true, opts, i);
      return { keys: [{ nodeId: `filler-row-${i}`, id: "K_FILLER" }] };
    });
    return rows;
  }

  return {
    platforms: [
      {
        id: "phone",
        layers: [
          { id: "default", rows: buildRows(layer1BkspOpts, rowIdx1) },
          { id: "shifted", rows: buildRows(layer2BkspOpts, rowIdx2) },
        ],
      },
    ],
    nodeIds: [],
  };
}

describe("checkControlKeyDrift (18.4 KM_WARN_CONTROL_KEY_DRIFT)", () => {
  it("passes when K_BKSP has identical sp+width across layers", () => {
    const ir = makeIRTwoLayers({ sp: 1, width: 100 }, { sp: 1, width: 100 });
    expect(checkControlKeyDrift(ir, PATH)).toEqual([]);
  });

  it("passes when K_BKSP has no sp/width data (skip comparison)", () => {
    const ir = makeIRTwoLayers({}, {});
    expect(checkControlKeyDrift(ir, PATH)).toEqual([]);
  });

  it("warns when K_BKSP sp changes across layers", () => {
    const ir = makeIRTwoLayers({ sp: 1, width: 100 }, { sp: 2, width: 100 });
    const findings = checkControlKeyDrift(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_CONTROL_KEY_DRIFT");
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.layer).toBe("C");
  });

  it("warns when K_BKSP width changes across layers", () => {
    const ir = makeIRTwoLayers({ sp: 1, width: 100 }, { sp: 1, width: 150 });
    const findings = checkControlKeyDrift(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_CONTROL_KEY_DRIFT");
  });

  it("warns when K_BKSP position (row) changes across layers", () => {
    const ir = makeIRTwoLayers({ sp: 1, width: 100, rowIndex: 0 }, { sp: 1, width: 100, rowIndex: 1 });
    const findings = checkControlKeyDrift(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_CONTROL_KEY_DRIFT");
  });

  it("includes the key id in the message", () => {
    const ir = makeIRTwoLayers({ sp: 1, width: 100 }, { sp: 2, width: 100 });
    const findings = checkControlKeyDrift(ir, PATH);
    expect(findings[0]?.message).toContain("K_BKSP");
  });

  it("warns when K_BKSP keeps the same row but changes keyIndex across layers", () => {
    // Both layers: K_BKSP is in row 0; layer 1 puts it at keyIndex 0, layer 2 at keyIndex 2.
    // sp and width are identical so the only drift is the position in the row.
    const ir = makeIRTwoLayers(
      { sp: 1, width: 100, rowIndex: 0, keyIndex: 0 },
      { sp: 1, width: 100, rowIndex: 0, keyIndex: 2 }
    );
    const findings = checkControlKeyDrift(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_CONTROL_KEY_DRIFT");
    expect(findings[0]?.message).toContain("position in row");
  });

  it("warns when baseline has sp+width but second layer omits both (asymmetric drift)", () => {
    // Baseline layer: K_BKSP has sp:1 and width:100.
    // Second layer: K_BKSP omits both sp and width (undefined).
    // Asymmetric presence of sp/width IS drift per design decision.
    const ir = makeIRTwoLayers({ sp: 1, width: 100 }, {});
    const findings = checkControlKeyDrift(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_CONTROL_KEY_DRIFT");
    expect(findings[0]?.message).toContain("sp changed from 1");
    expect(findings[0]?.message).toContain("unset");
  });

  it("passes (no finding) when both layers have neither sp nor width and position is unchanged", () => {
    // Neither layer sets sp or width; position is the same in both.
    // No drift of any kind, so no finding expected.
    const ir = makeIRTwoLayers({}, {});
    expect(checkControlKeyDrift(ir, PATH)).toEqual([]);
  });

  it("warns on position drift even when neither layer has sp/width data", () => {
    // Both layers omit sp and width, but K_BKSP moves to a different row.
    // Position drift must be flagged regardless of sp/width presence.
    const ir = makeIRTwoLayers({ rowIndex: 0 }, { rowIndex: 1 });
    const findings = checkControlKeyDrift(ir, PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_CONTROL_KEY_DRIFT");
    expect(findings[0]?.message).toContain("row changed");
  });
});
