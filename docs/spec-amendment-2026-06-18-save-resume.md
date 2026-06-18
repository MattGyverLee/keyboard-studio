# spec.md amendment — Save & resume (v1.4.0 spec revision)

**Status:** PROPOSED 2026-06-18. **Not yet applied/signed off** — amends a v1.3.0 working-copy-spine invariant (§12), which per the revision policy (§18) requires a joint engine+content session. This PR is the proposal artifact; the spec text carries the change marked PROPOSED so reviewers see the exact diff under review. Merge is gated on sign-off.

**Provenance:** Design discussion 2026-06-18 (login / save & resume for keyboard authors). Motivation, options, and the storage/credential/deployment decisions are summarized in the PR body.

---

## Motivation

Authors want to leave the studio and pick up an in-progress keyboard later. Today the working copy lives only in browser memory and is lost on refresh — a real usability gap for a tool used across multiple sittings. The spec's existing notion of "resume" (§ "Defer answers… the studio remembers gaps and resumes"; § "the same studio session re-opens the same working copy") is **within-session only**; cross-session persistence is explicitly forbidden by the §12 invariant. Enabling save & resume therefore requires a spec change, not just implementation.

## Section-by-section changes

- **§12 (Output artifacts → "Working copy as the live edit target")** — the sentence "there is no intermediate persistence step between instantiation and output" is replaced with a **Save & resume** clause that permits a non-destructive **session snapshot** between instantiation and output. The core invariant is preserved: the working copy remains the single live edit target; a restored snapshot is identical to the one serialized; the snapshot is never a delivery path; **output (step 15) remains the only route to a `.zip` or PR.** Two snapshot stores are permitted — browser-local (default, no account, no network) and an optional account-keyed backing store for cross-device resume. Degrades to browser-local when no backing service is configured.
- **§16 (Out of scope → "Hosting and deployment")** — the bare "ships a static SPA" line gains a v1.4.0 exception: a **minimal optional backing service** is permitted solely for (a) the OAuth token exchange the in-scope GitHub fork+PR path already requires, and (b) account-keyed save & resume. The service is never required to author, validate, or deliver; no GitHub account is ever required. General-purpose hosting/ops stay out of scope.

## What does NOT change

- The 15-step pipeline, the two authoring tracks, and the re-projected-layers IR model (§12) are untouched.
- The two delivery paths — ZIP download (accountless) and GitHub OAuth fork+PR (§12) — are unchanged. The ZIP path stays fully accountless and offline-capable.
- No `Pattern`/`Criterion` schema (§5) change.
- Out-of-scope status of general hosting, MML authoring, touch-first, CJK/Ethiopic, etc. (§16) is unchanged.

## Implementation outline (informative — not part of the spec text)

Phased, additive, low-risk:

1. **Browser-local autosave/restore first** — serialize the working copy to a snapshot and rehydrate it on load. No login, no backend. Exercises the serialize↔rehydrate core (the inverse of `toZip`, which does not exist yet) needed by every later phase.
2. **Optional account-based resume** — lightweight email-identity login backed by a minimal Vercel serverless function + managed datastore, for cross-device resume.

Settled design inputs (for the implementation epic, not the spec):
- **Deployment:** Vercel — SPA static + `oauth-backend` as serverless functions co-located at `/api` (same-origin → session cookie can be `SameSite=Lax`, simpler CSRF).
- **Token landscape (three distinct credentials, not to be conflated):** user GitHub OAuth *delivery* token (in-memory in browser); keyboard-studio *session/login* token (**httpOnly cookie**, CSRF protection a mandatory acceptance criterion of the cookie work — same-origin keeps it small, not a separate issue); service *read* credential for base-keyboard fetch/mirror (CI/Vercel env, never browser).

## Review

**PENDING.** Joint engine+content session not yet held. Sign-off and per-specialist findings to be logged in [docs/spec-signoff.md](spec-signoff.md) under Post-Sign-Off Amendments once the cycle completes.
