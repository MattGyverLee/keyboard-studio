# Contract: `TouchKeyIR` provenance field

**Feature**: 014-mutate-seam-touch-propagation | **Status**: PROVISIONAL / GATED on #5b/#232

> Locked-surface edit — requires contracts MAJOR bump + §18 joint engine+content session (plan gates G-I/G-VI). Re-validate against the ratified `KeyboardIR` shape (G-II).

## Surface

`TouchKeyIR.provenance: "base-derived" | "physical-suggested" | "hand-set"` added in `packages/contracts/src/keyboard-ir.ts`, mirrored in `schemas.ts`, exported from `index.ts`. `editors/assignLoop/provenance.ts` `TouchKeyProvenance` becomes a **re-export**.

## Guarantees

- **P1 (contract field, FR-008)**: each touch key carries the provenance tag as a contract field; the editor type is a re-export (single source of truth, SC-007).
- **P2 (conservative default, FR-009)**: pre-existing / untagged keys default to `hand-set` — never auto-overwritten.
- **P3 (round-trip, FR-010)**: every tag survives serialize → deserialize unchanged (SC-007); legacy/missing → `hand-set` on deserialize.
- **P4 (zod drift guard, Art. I)**: the zod schema is updated in the same change as the type.
- **P5 (MAJOR bump, FR-011/SC-010)**: shipped as a `@keyboard-studio/contracts` MAJOR bump with the §18 coordination note recorded; no consumer absorbs it as a silent minor.

## Test obligations

- Round-trip test in `packages/contracts`: a `KeyboardIR` with provenance-tagged touch keys serializes → deserializes with every tag intact (P3/SC-007).
- A compile/test check that `editors/assignLoop/provenance.ts` resolves to the contracts type (single definition, P1/SC-007).
