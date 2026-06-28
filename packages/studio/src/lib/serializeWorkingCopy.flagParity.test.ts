// T011 / spec-014 flag-parity for the OUTPUT path — projectWorkingCopyForOutput
// produces a byte-identical projected .kmn whether the mutate seam flag is on or
// off, for a working copy carrying carve deletions (M6/SC-008).
//
// Unlike serializeWorkingCopy.test.ts (which mocks ./projectWorkingCopyVfs to
// assert call wiring), this file runs the REAL projection + emit pipeline so the
// comparison is on actual emitted bytes. It compares the projected VFS content
// returned by projectWorkingCopyForOutput rather than zipped bytes (toZip would
// add nondeterministic archive metadata).
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/mutate-seam.contract.md (M6)

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup, IRRule, IRStore, KeyboardIR } from "@keyboard-studio/contracts";

// Mock only services (toZip / pattern library) — NOT projectWorkingCopyVfs, so
// the real emit pipeline runs.
vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => async () => new Uint8Array()),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";

function rule(nodeId: string, vkey: string, char: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers: [] }],
    output: [{ kind: "char", value: char }],
  };
}

function group(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

function store(nodeId: string, name: string): IRStore {
  return { nodeId, name, items: [{ kind: "char", value: "q" }], isSystem: false };
}

function makeIr(): KeyboardIR {
  const main = group("g#main", "main", [rule("r#a", "K_A", "x"), rule("r#b", "K_B", "y")]);
  const second = group("g#second", "second", [rule("r#c", "K_C", "z")]);
  return makeTestIR([main, second], [store("s#extra", "extraX")]);
}

function seed() {
  const vfs = createVirtualFS([
    { path: `source/${basicKbdus.id}.kmn`, content: "c stub\n", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir: makeIr() });
  // A carve overlay that drops a non-entry group + a store.
  useWorkingCopyStore.getState().deleteNode("g#second");
  useWorkingCopyStore.getState().deleteNode("s#extra");
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  useWorkingCopyStore.getState().reset();
});

describe("projectWorkingCopyForOutput — carve flag parity", () => {
  it("emits byte-identical projected .kmn with the seam on vs off", async () => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    seed();
    const off = await projectWorkingCopyForOutput();
    const offKmn = off!.vfs.get(`source/${basicKbdus.id}.kmn`)?.content as string;

    useWorkingCopyStore.getState().reset();

    vi.stubEnv("VITE_KM_MUTATE_SEAM", "1");
    seed();
    const on = await projectWorkingCopyForOutput();
    const onKmn = on!.vfs.get(`source/${basicKbdus.id}.kmn`)?.content as string;

    expect(typeof offKmn).toBe("string");
    expect(onKmn).toBe(offKmn);
    // And the carve actually took effect (second group + extra store dropped).
    expect(onKmn).not.toMatch(/group\(second\)/);
    expect(onKmn).not.toMatch(/store\(extraX\)/);
  });
});
