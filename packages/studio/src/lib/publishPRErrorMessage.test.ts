// Tests for publishPRErrorMessage — exhaustive over the PublishPRError union.

import { describe, it, expect } from "vitest";
import type { PublishPRError } from "@keyboard-studio/contracts";
import { publishPRErrorMessage, isPublishPRError } from "./publishPRErrorMessage.ts";

describe("publishPRErrorMessage", () => {
  it("auth → reconnect message", () => {
    const err: PublishPRError = { kind: "auth", message: "expired" };
    expect(publishPRErrorMessage(err)).toMatch(/reconnect github/i);
  });

  it("scope → missing public_repo message", () => {
    const err: PublishPRError = {
      kind: "scope",
      message: "no scope",
      required: ["public_repo"],
    };
    expect(publishPRErrorMessage(err)).toMatch(/public_repo/);
    expect(publishPRErrorMessage(err)).toMatch(/reconnect github/i);
  });

  it("rate-limit → interpolates retryAfterSeconds", () => {
    const err: PublishPRError = {
      kind: "rate-limit",
      message: "slow down",
      retryAfterSeconds: 42,
    };
    expect(publishPRErrorMessage(err)).toBe("GitHub rate limit — retry in 42 seconds.");
  });

  it("branch-exists → rename and retry message", () => {
    const err: PublishPRError = {
      kind: "branch-exists",
      message: "exists",
      branchName: "add/foo",
    };
    expect(publishPRErrorMessage(err)).toMatch(/branch already exists/i);
  });

  it("network → check connection message", () => {
    const err: PublishPRError = { kind: "network", message: "offline" };
    expect(publishPRErrorMessage(err)).toMatch(/network error/i);
  });

  it("unknown → includes the underlying message", () => {
    const err: PublishPRError = { kind: "unknown", message: "boom" };
    expect(publishPRErrorMessage(err)).toBe("Unexpected error: boom");
  });
});

describe("isPublishPRError", () => {
  it("true for each valid kind", () => {
    const kinds: PublishPRError["kind"][] = [
      "auth",
      "scope",
      "rate-limit",
      "branch-exists",
      "network",
      "unknown",
    ];
    for (const kind of kinds) {
      expect(isPublishPRError({ kind, message: "x" })).toBe(true);
    }
  });

  it("false for non-PublishPRError values", () => {
    expect(isPublishPRError(null)).toBe(false);
    expect(isPublishPRError(new Error("nope"))).toBe(false);
    expect(isPublishPRError({ kind: "other" })).toBe(false);
    expect(isPublishPRError("string")).toBe(false);
  });
});
