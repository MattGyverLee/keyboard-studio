import { describe, it, expect } from "vitest";
import { checkKeysPerRow } from "./check-18-3-keys-per-row.js";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";

const PATH = "source/test.keyman-touch-layout";

function makeIR(platform: "phone" | "tablet" | "desktop", keyCount: number): TouchLayoutIR {
  const keys = Array.from({ length: keyCount }, (_, i) => ({
    nodeId: `k-${i}`,
    id: `K_${i}`,
  }));
  return {
    platforms: [
      {
        id: platform,
        layers: [
          { id: "default", rows: [{ keys }] },
        ],
      },
    ],
    nodeIds: [],
  };
}

describe("checkKeysPerRow (18.3 KM_WARN_TOUCH_KEYS_PER_ROW)", () => {
  it("passes for phone with 10 keys in a row (at limit)", () => {
    expect(checkKeysPerRow(makeIR("phone", 10), PATH)).toEqual([]);
  });

  it("passes for tablet with 13 keys in a row (at limit)", () => {
    expect(checkKeysPerRow(makeIR("tablet", 13), PATH)).toEqual([]);
  });

  it("passes for desktop (no rule)", () => {
    expect(checkKeysPerRow(makeIR("desktop", 20), PATH)).toEqual([]);
  });

  it("warns for phone with 11 keys in a row", () => {
    const findings = checkKeysPerRow(makeIR("phone", 11), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_TOUCH_KEYS_PER_ROW");
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.layer).toBe("C");
  });

  it("warns for tablet with 14 keys in a row", () => {
    const findings = checkKeysPerRow(makeIR("tablet", 14), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_WARN_TOUCH_KEYS_PER_ROW");
  });

  it("includes the row index in the message", () => {
    const findings = checkKeysPerRow(makeIR("phone", 11), PATH);
    expect(findings[0]?.message).toContain("row 1");
  });
});
