// T011 (US1) — carve/add shell does not mutate the KeyboardIR in place.
//
// Context (important): in THIS codebase the carve/add galleries never wrote the
// IR directly. Carve edits are recorded as an OVERLAY layer in workingCopyStore
// (deletedNodeIds / deletedItemIds) and projected onto the IR only at
// serialization time (lib/projectWorkingCopyVfs.ts). The "answer-store-vs-IR
// state fork" spec-014 closes therefore manifests here as (a) the answer-store
// path and (b) the carve OVERLAY path — not as raw in-place IR mutation.
//
// This spec pins the invariant that matters for SC-001 / AC US1-2: the carve
// store mutators NEVER mutate the seeded `ir` object in place. The single
// executed IR write path is the reducer's mutate() apply (covered by
// tests/steps/reducer.mutateSeam.test.ts); carve removals remain a projected
// overlay, not a competing direct-IR writer.
//
// Source of truth: specs/014-mutate-seam-touch-propagation/contracts/mutate-seam.contract.md (M6/SC-001)

import { describe, it, expect, beforeEach } from "vitest";
import { useWorkingCopyStore } from "../../../src/stores/workingCopyStore.ts";
import { applyCarveMutate, CARVE_WRITES } from "../../../src/steps/editorMutate.ts";
import { applyMutatePatch, MutatePatchContainmentError } from "../../../src/steps/mutateApply.ts";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";

function freshIR(): KeyboardIR {
  return makeTestIR([], [makeCharStore("s0", "letters", "abc"), makeCharStore("s1", "extra", "de")]);
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

describe("carve shell — store mutators never mutate the IR object in place (AC US1-2 / SC-001)", () => {
  it("deleteNode records an overlay and leaves the seeded IR byte-identical", () => {
    const ir = freshIR();
    const snapshot = structuredClone(ir);
    const store = useWorkingCopyStore.getState();
    store.setIR(ir);

    store.deleteNode("s0");

    // Overlay records the deletion...
    expect(useWorkingCopyStore.getState().deletedNodeIds.has("s0")).toBe(true);
    // ...but the IR object is unchanged (no in-place mutation, no competing write path).
    expect(ir).toEqual(snapshot);
    expect(useWorkingCopyStore.getState().ir).toEqual(snapshot);
  });

  it("deleteItem records an overlay and does not touch the IR's stores", () => {
    const ir = freshIR();
    const snapshot = structuredClone(ir);
    const store = useWorkingCopyStore.getState();
    store.setIR(ir);

    store.deleteItem("s0#0");

    expect(useWorkingCopyStore.getState().deletedItemIds.has("s0#0")).toBe(true);
    expect(ir.stores).toEqual(snapshot.stores);
  });

  it("restore/keepAll clear the overlay without ever having written the IR", () => {
    const ir = freshIR();
    const snapshot = structuredClone(ir);
    const store = useWorkingCopyStore.getState();
    store.setIR(ir);

    store.deleteNode("s0");
    store.deleteItem("s1#0");
    store.keepAll();

    const s = useWorkingCopyStore.getState();
    expect(s.deletedNodeIds.size).toBe(0);
    expect(s.deletedItemIds.size).toBe(0);
    expect(s.ir).toEqual(snapshot); // IR untouched throughout
  });
});

// ---------------------------------------------------------------------------
// T016 — the mutate() seam is the canonical carve-IR producer (M6/SC-001).
//
// With the seam on, the carve overlay (the same reversible UI state the block
// above pins) is PROJECTED into the working IR exclusively through applyCarveMutate
// → applyMutatePatch / CARVE_WRITES. These cases prove that single write path
// derives the carved IR straight from the overlay + baseIr.
// ---------------------------------------------------------------------------

describe("carve seam — applyCarveMutate is the canonical IR producer (M6/SC-001)", () => {
  it("derives the carved IR from the overlay through the single mutate() write path", () => {
    const ir = freshIR();
    const store = useWorkingCopyStore.getState();
    store.setIR(ir);
    store.deleteNode("s0"); // overlay-only edit

    const overlay = useWorkingCopyStore.getState();
    const carved = applyCarveMutate(ir, overlay.deletedNodeIds, overlay.deletedItemIds);

    // The seam (not a direct store IR write) produced the carved IR.
    expect(carved.stores.map((s) => s.nodeId)).toEqual(["s1"]);
    // base + overlay store IR remain unmutated (overlay is UI state, M1).
    expect(ir.stores.map((s) => s.nodeId)).toEqual(["s0", "s1"]);
    expect(useWorkingCopyStore.getState().ir!.stores.map((s) => s.nodeId)).toEqual([
      "s0",
      "s1",
    ]);
  });

  it("constrains carve writes to CARVE_WRITES — an out-of-surface patch is rejected whole (M3)", () => {
    const ir = freshIR();
    // A patch touching header (outside CARVE_WRITES) must fail fast, IR unchanged.
    expect(() =>
      applyMutatePatch(ir, { header: { ...ir.header, name: "X" } }, CARVE_WRITES),
    ).toThrow(MutatePatchContainmentError);
  });

  it("an empty overlay routes to an empty patch → a structural copy of baseIr (M5)", () => {
    const ir = freshIR();
    const out = applyCarveMutate(ir, new Set(), new Set());
    expect(out).toEqual(ir);
    expect(out).not.toBe(ir);
  });
});
