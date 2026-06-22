// Tests for handleOAuthCallback — state validation + exchange flow.
//
// processOAuthCallback is the pure (no-redirect) core; we exercise its state
// validation, missing-code/verifier guards, and the happy path by mocking the
// token exchange via global fetch.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { processOAuthCallback } from "./handleOAuthCallback.ts";
import { setOAuthScratch, getStoredToken } from "./githubOAuth.ts";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("processOAuthCallback — state validation", () => {
  it("rejects when the returned state does not match the stored state", async () => {
    setOAuthScratch("verifier-1", "stored-state");
    const result = await processOAuthCallback("?code=abc&state=DIFFERENT");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("state-mismatch");
    // No token should be stored.
    expect(getStoredToken()).toBeNull();
  });

  it("rejects when no state was stored (nothing to validate against)", async () => {
    const result = await processOAuthCallback("?code=abc&state=anything");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("state-mismatch");
  });

  it("rejects when the code is missing", async () => {
    setOAuthScratch("verifier-1", "s");
    const result = await processOAuthCallback("?state=s");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("missing-code");
  });

  it("surfaces a GitHub error param (e.g. access_denied)", async () => {
    setOAuthScratch("v", "s");
    const result = await processOAuthCallback("?error=access_denied&state=s");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("exchange-failed");
    expect(result.ok === false && result.message).toBe("access_denied");
  });
});

describe("processOAuthCallback — happy path", () => {
  it("exchanges the code and stores the token when state matches", async () => {
    setOAuthScratch("verifier-1", "state-ok");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: "ghp_token",
          token_type: "bearer",
          scope: "public_repo",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await processOAuthCallback("?code=goodcode&state=state-ok");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const stored = getStoredToken();
    expect(stored?.accessToken).toBe("ghp_token");
    expect(stored?.scope).toBe("public_repo");
  });

  it("returns exchange-failed when the backend responds non-2xx", async () => {
    setOAuthScratch("verifier-1", "state-ok");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, status: 400, error: "bad_verification_code" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await processOAuthCallback("?code=badcode&state=state-ok");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("exchange-failed");
    expect(getStoredToken()).toBeNull();
  });
});
