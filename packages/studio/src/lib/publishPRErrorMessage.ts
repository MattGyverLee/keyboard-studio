// publishPRErrorMessage — map a PublishPRError (discriminated union, spec §12)
// to a single user-facing string.
//
// publishPR THROWS a PublishPRError-shaped plain object (not an Error instance)
// on failure; the UI switches on `err.kind` to pick recovery affordances and
// shows this message. Kept pure + dependency-free so it is testable in isolation
// and reusable from any surface.

import type { PublishPRError } from "@keyboard-studio/contracts";

/**
 * Single source of truth for the {@link PublishPRError} discriminant values.
 *
 * `satisfies readonly PublishPRError["kind"][]` makes this list track the
 * contract union: add a new `PublishPRError` kind and this array must grow to
 * match, or the build fails. Both {@link isPublishPRError} (the runtime guard)
 * and the {@link publishPRErrorMessage} exhaustiveness `never` guard derive from
 * this, so a new kind can never be silently misclassified or unhandled.
 */
const PUBLISH_PR_ERROR_KINDS = [
  "auth",
  "scope",
  "rate-limit",
  "branch-exists",
  "network",
  "unknown",
] as const satisfies readonly PublishPRError["kind"][];

/**
 * Render a {@link PublishPRError} as a user-facing message.
 *
 * The mapping is exhaustive over the union's `kind`; adding a new kind to the
 * contract surfaces here as a TypeScript error (the `never` default).
 */
export function publishPRErrorMessage(err: PublishPRError): string {
  switch (err.kind) {
    case "auth":
      return "Token expired — reconnect GitHub.";
    case "scope":
      return "Missing scope `public_repo` — reconnect GitHub.";
    case "rate-limit":
      return `GitHub rate limit — retry in ${err.retryAfterSeconds} seconds.`;
    case "branch-exists":
      return "Branch already exists — rename and retry.";
    case "network":
      return "Network error — check your connection.";
    case "unknown":
      return `Unexpected error: ${err.message}`;
    default: {
      // Exhaustiveness guard: a new error kind must be handled above.
      const _exhaustive: never = err;
      return `Unexpected error.${String(_exhaustive)}`;
    }
  }
}

/**
 * Narrow an unknown thrown value to a {@link PublishPRError}.
 *
 * publishPR rejects with a plain object carrying a string `kind`, so we
 * structurally test for it rather than `instanceof Error`.
 */
export function isPublishPRError(value: unknown): value is PublishPRError {
  if (typeof value !== "object" || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return (PUBLISH_PR_ERROR_KINDS as readonly string[]).includes(kind as string);
}
