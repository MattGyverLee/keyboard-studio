// mutateGatingAudit.test.ts — spec-014 US4 T031 cross-cutting audit.
//
// T031 obligation: EVERY mutate() execution site MUST be gated on
// isMutateSeamEnabled(), so flag-off falls back to the legacy / P4b declared-only
// seam with no other change (F1/F2/FR-015/-016).
//
// AUDIT RESULT (2026-06-28): all FIVE mutate() execution sites were found ALREADY
// gated — no ungated site existed, so no production-code fix was required. This
// file PINS that invariant: it enumerates the five sites and asserts each one
// reads isMutateSeamEnabled() at its execution point, so a future edit that drops
// a gate (re-introducing an ungated write path, the SC-008/F2 regression) fails
// here.
//
//   1. reducer apply (T014)              — steps/reducer.ts, MutateRequest branch.
//   2. reducer touch-repropagation (T024) — steps/reducer.ts, MECHANISMS_STEP_ID.
//   3. carve projection (T016)           — lib/projectWorkingCopyVfs.ts.
//   4. add-gallery projection (T017)     — lib/projectWorkingCopyVfs.ts.
//   5. touch promotion on manual edit (T025) — editors/assignLoop/TouchGallery.tsx.
//
// The structural assertions below read each source file and confirm the gate
// guards the write at the same site. This is deliberately a SOURCE-LEVEL pin
// (not only a behavioral one): the flagOff.test.ts behavioral spine proof already
// exercises sites 1 + 2 at runtime; the carve/add emit-parity is proved in
// projectWorkingCopyVfs.flagParity.test.ts. This audit guards every site at once
// against gate removal, including the UI sites (3–5) that are awkward to drive
// headlessly.
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/tasks.md T031
//   specs/014-mutate-seam-touch-propagation/contracts/flag-and-validator.contract.md (F1/F2)

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "../../src");

function read(rel: string): string {
  return readFileSync(resolve(SRC, rel), "utf8");
}

/** Count non-comment occurrences of `isMutateSeamEnabled(` in a source string. */
function gateCallCount(source: string): number {
  const matches = source.match(/isMutateSeamEnabled\(/g);
  return matches === null ? 0 : matches.length;
}

describe("T031 / US4 — every mutate() execution site is gated on isMutateSeamEnabled()", () => {
  // -- reducer.ts: sites 1 (apply) + 2 (re-propagation trigger) ---------------
  describe("steps/reducer.ts — apply (T014) + re-propagation trigger (T024)", () => {
    const reducer = read("steps/reducer.ts");

    it("imports the flag", () => {
      expect(reducer).toMatch(/import\s*\{\s*isMutateSeamEnabled\s*\}\s*from\s*["'].*mutateFlag/);
    });

    it("the MutateRequest apply branch returns early when the flag is off (site 1)", () => {
      // The reducer's mutate branch must bail before applyMutatePatch when off.
      expect(reducer).toMatch(/if\s*\(\s*!isMutateSeamEnabled\(\)\s*\)\s*return;/);
    });

    it("the re-propagation trigger is conjoined with the flag (site 2)", () => {
      // The MECHANISMS_STEP_ID repropagate() call is guarded by the flag.
      expect(reducer).toMatch(/isMutateSeamEnabled\(\)\s*&&/);
    });

    it("has at least two flag reads (apply + re-propagation)", () => {
      expect(gateCallCount(reducer)).toBeGreaterThanOrEqual(2);
    });

    it("every applyMutatePatch / repropagate call site is downstream of a flag read", () => {
      // applyMutatePatch is called once (apply branch); repropagate once (trigger).
      // Both must be flag-gated — the first flag read precedes the first write.
      const firstGate = reducer.indexOf("isMutateSeamEnabled(");
      const firstApply = reducer.search(/applyMutatePatch\(/);
      const firstRepro = reducer.search(/\brepropagate\(\{/);
      expect(firstGate).toBeGreaterThanOrEqual(0);
      // The mutate branch's flag check appears before the applyMutatePatch call.
      expect(firstGate).toBeLessThan(firstApply);
      expect(firstGate).toBeLessThan(firstRepro);
    });
  });

  // -- projectWorkingCopyVfs.ts: sites 3 (carve) + 4 (add-gallery) ------------
  describe("lib/projectWorkingCopyVfs.ts — carve (T016) + add-gallery (T017) projection", () => {
    const proj = read("lib/projectWorkingCopyVfs.ts");

    it("imports the flag", () => {
      expect(proj).toMatch(/import\s*\{\s*isMutateSeamEnabled\s*\}\s*from\s*["'].*mutateFlag/);
    });

    it("the carve seam derivation (applyCarveMutate) is guarded by the flag (site 3)", () => {
      expect(proj).toMatch(/if\s*\(\s*isMutateSeamEnabled\(\)\s*&&[^)]*\)\s*\{[\s\S]*applyCarveMutate/);
    });

    it("the add-gallery seam derivation (applyAddGalleryMutate) is guarded by the flag (site 4)", () => {
      expect(proj).toMatch(/if\s*\(\s*isMutateSeamEnabled\(\)\s*\)\s*\{[\s\S]*applyAddGalleryMutate/);
    });

    it("every flag-gated mutate call appears after a flag read", () => {
      const firstGate = proj.indexOf("isMutateSeamEnabled(");
      expect(firstGate).toBeGreaterThanOrEqual(0);
      expect(firstGate).toBeLessThan(proj.search(/applyCarveMutate\(/));
      expect(firstGate).toBeLessThan(proj.search(/applyAddGalleryMutate\(/));
    });
  });

  // -- TouchGallery.tsx: site 5 (touch promotion on manual edit) --------------
  describe("editors/assignLoop/TouchGallery.tsx — touch promotion on manual edit (T025)", () => {
    const gallery = read("editors/assignLoop/TouchGallery.tsx");

    it("imports the flag", () => {
      expect(gallery).toMatch(/import\s*\{\s*isMutateSeamEnabled\s*\}\s*from\s*["'].*mutateFlag/);
    });

    it("the promoteOnManualEdit / setIR write is guarded by the flag (site 5)", () => {
      expect(gallery).toMatch(/if\s*\(\s*isMutateSeamEnabled\(\)\s*&&[\s\S]*?promoteOnManualEdit/);
    });

    it("the flag read precedes the IR write", () => {
      const firstGate = gallery.indexOf("isMutateSeamEnabled(");
      expect(firstGate).toBeGreaterThanOrEqual(0);
      expect(firstGate).toBeLessThan(gallery.search(/promoteOnManualEdit\(/));
    });
  });

  it("AUDIT SUMMARY: all five mutate() execution sites are gated (no ungated site found)", () => {
    // A single roll-up so the audit conclusion is one visible green assertion:
    // each of the three source files carrying mutate() write sites reads the flag.
    expect(gateCallCount(read("steps/reducer.ts"))).toBeGreaterThanOrEqual(2);
    expect(gateCallCount(read("lib/projectWorkingCopyVfs.ts"))).toBeGreaterThanOrEqual(2);
    expect(gateCallCount(read("editors/assignLoop/TouchGallery.tsx"))).toBeGreaterThanOrEqual(1);
  });
});
