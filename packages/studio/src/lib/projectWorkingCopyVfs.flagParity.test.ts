// T011 / spec-014 flag-parity — the carve IR projection produces a BYTE-IDENTICAL
// emitted .kmn whether the mutate seam flag is on or off.
//
// Flag-off runs today's path (applyStoreSlotRemovals + applyCarveToVfs's internal
// filter). Flag-on routes the carve IR derivation through the single mutate()
// write seam (applyCarveMutate → applyMutatePatch / CARVE_WRITES). Both must emit
// identical artifacts for the same overlay (M6/SC-008).
//
// This file does NOT mock @keyboard-studio/engine — it exercises the real emit
// pipeline so the comparison is on actual emitted bytes.
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/mutate-seam.contract.md (M6)
//   specs/014-mutate-seam-touch-propagation/contracts/flag-and-validator.contract.md (F2)

import { describe, it, expect, afterEach, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type {
  IRGroup,
  IRRule,
  IRStore,
  StoreItem,
  KeyboardIR,
} from "@keyboard-studio/contracts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function rule(nodeId: string, vkey: string, char: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers: [] }],
    output: [{ kind: "char", value: char }],
  };
}

function parallelRule(nodeId: string, dkId: number, inN: string, outN: string): IRRule {
  return {
    nodeId,
    context: [
      { kind: "deadkey", id: dkId },
      { kind: "any", storeRef: inN },
    ],
    output: [{ kind: "index", storeRef: outN, offset: 2 }],
  };
}

function group(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

function store(nodeId: string, name: string, items: StoreItem[]): IRStore {
  return { nodeId, name, items, isSystem: false };
}

/** A keyboard with two groups, a parallel-store deadkey pattern, and a stray store. */
function makeFixtureIr(): KeyboardIR {
  const outStore = store("store#dkt", "dktX", [
    { kind: "char", value: "À" },
    { kind: "char", value: "ε" },
    { kind: "char", value: "Z" },
  ]);
  const inStore = store("store#dkf", "dkfX", [
    { kind: "char", value: "a" },
    { kind: "char", value: "b" },
    { kind: "char", value: "c" },
  ]);
  const extra = store("store#extra", "extraX", [{ kind: "char", value: "Q" }]);

  const main = group("group#main", "main", [
    rule("rule#a", "K_A", "x"),
    rule("rule#b", "K_B", "y"),
    parallelRule("rule#dk", 0x003b, "dkfX", "dktX"),
  ]);
  // A second, deleteable group (NOT the entry group → safe to drop).
  const second = group("group#second", "second", [rule("rule#c", "K_C", "z")]);

  return makeTestIR([main, second], [outStore, inStore, extra]);
}

function makeVfs(keyboardId: string) {
  return createVirtualFS([
    { path: `source/${keyboardId}.kmn`, content: "c stub\n", isBinary: false },
  ]);
}

/** Run the real projection for one overlay and return the emitted .kmn content. */
function projectKmn(
  overlay: { deletedNodeIds?: Set<string>; deletedItemIds?: Set<string> },
): string {
  const vfs = makeVfs("kb");
  projectWorkingCopyVfs({
    vfs,
    keyboardId: "kb",
    baseIr: makeFixtureIr(),
    deletedNodeIds: overlay.deletedNodeIds ?? new Set(),
    deletedItemIds: overlay.deletedItemIds ?? new Set(),
    assignments: [],
    getPattern: () => undefined,
    identity: null,
  });
  return vfs.get("source/kb.kmn")?.content as string;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

const SCENARIOS: Array<{
  name: string;
  overlay: { deletedNodeIds?: Set<string>; deletedItemIds?: Set<string> };
}> = [
  { name: "no edits (no re-emit)", overlay: {} },
  { name: "whole-group deletion", overlay: { deletedNodeIds: new Set(["group#second"]) } },
  { name: "single-rule deletion", overlay: { deletedNodeIds: new Set(["rule#a"]) } },
  { name: "whole-store deletion", overlay: { deletedNodeIds: new Set(["store#extra"]) } },
  { name: "store-slot nul rewrite", overlay: { deletedItemIds: new Set(["store#dkt#1"]) } },
  {
    name: "slot + whole-rule combined",
    overlay: {
      deletedNodeIds: new Set(["rule#b"]),
      deletedItemIds: new Set(["store#dkt#0"]),
    },
  },
  {
    name: "bare rule item id (whole-node path)",
    overlay: { deletedItemIds: new Set(["rule#c"]) },
  },
];

describe("projectWorkingCopyVfs — carve flag parity (flag-on === flag-off emit)", () => {
  for (const { name, overlay } of SCENARIOS) {
    it(`emits byte-identical .kmn with the seam on vs off — ${name}`, () => {
      vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
      const off = projectKmn(overlay);

      vi.stubEnv("VITE_KM_MUTATE_SEAM", "1");
      const on = projectKmn(overlay);

      expect(on).toBe(off);
    });
  }

  it("preserves the entry-group safety gate under the seam (deleting the entry group warns + skips, no re-emit)", () => {
    // group#main is the entry group (first non-readonly). Deleting it must warn
    // and leave the VFS unchanged in BOTH flag states.
    const overlay = { deletedNodeIds: new Set(["group#main"]) };

    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    const offVfs = makeVfs("kb");
    const offRes = projectWorkingCopyVfs({
      vfs: offVfs,
      keyboardId: "kb",
      baseIr: makeFixtureIr(),
      deletedNodeIds: overlay.deletedNodeIds,
      deletedItemIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    vi.stubEnv("VITE_KM_MUTATE_SEAM", "1");
    const onVfs = makeVfs("kb");
    const onRes = projectWorkingCopyVfs({
      vfs: onVfs,
      keyboardId: "kb",
      baseIr: makeFixtureIr(),
      deletedNodeIds: overlay.deletedNodeIds,
      deletedItemIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    // Both paths warn (entry-group gate) and leave the fetched stub untouched.
    expect(onRes.warnings).toEqual(offRes.warnings);
    expect(onRes.warnings.some((w) => w.includes("entry group"))).toBe(true);
    expect(onVfs.get("source/kb.kmn")?.content).toBe(offVfs.get("source/kb.kmn")?.content);
    expect(onVfs.get("source/kb.kmn")?.content).toBe("c stub\n"); // never re-emitted
  });
});
