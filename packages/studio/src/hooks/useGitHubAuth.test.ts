// useGitHubAuth — React-state layer over the GitHub OAuth flow.
//
// Coverage goals:
//   1. Rehydrate-from-sessionStorage on mount: a token written before mount is
//      picked up, verifyToken is called with it, and a scoped result → connected.
//   2. needs-scope: verifyToken returns ok:false / missingScopes → "needs-scope"
//      and canSubmit is false.
//   3. disconnect() clears the stored token and returns the hook to idle.
//   4. oauth_error pickup (Fix 1): a `?oauth_error=` query param is read into the
//      hook's error state on mount and stripped from the URL.
//
// Approach: the OAuth storage helpers (githubOAuth.ts) run against jsdom's real
// sessionStorage, so we seed/clear it directly. getGitHubOutputService (the
// services boundary) is mocked so verifyToken is a controllable spy and no
// engine/network is touched.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { VerifyTokenResult } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// services mock — verifyToken is a controllable spy.
// ---------------------------------------------------------------------------

const { verifyToken } = vi.hoisted(() => ({
  verifyToken: vi.fn<[string], Promise<VerifyTokenResult>>(),
}));

vi.mock("../lib/services.ts", () => ({
  getGitHubOutputService: vi.fn(async () => ({
    verifyToken,
    publishPR: vi.fn(),
  })),
}));

import { useGitHubAuth } from "./useGitHubAuth.ts";

const TOKEN_KEY = "ks.github.token";

function seedToken(scope = "public_repo"): void {
  sessionStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({ accessToken: "ghp_seeded", tokenType: "bearer", scope }),
  );
}

beforeEach(() => {
  sessionStorage.clear();
  // Reset the URL to a clean root so oauth_error tests are isolated.
  window.history.replaceState(null, "", "/");
  verifyToken.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useGitHubAuth", () => {
  it("rehydrates the token from sessionStorage and verifies it on mount", async () => {
    seedToken("public_repo");
    verifyToken.mockResolvedValue({
      ok: true,
      login: "octocat",
      scopes: ["public_repo"],
      missingScopes: [],
    });

    const { result } = renderHook(() => useGitHubAuth());

    // Token is rehydrated synchronously on mount.
    expect(result.current.token?.accessToken).toBe("ghp_seeded");

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(verifyToken).toHaveBeenCalledWith("ghp_seeded");
    expect(result.current.login).toBe("octocat");
    expect(result.current.canSubmit).toBe(true);
  });

  it("enters needs-scope when verifyToken returns ok:false with missing scopes", async () => {
    seedToken("read:user");
    verifyToken.mockResolvedValue({
      ok: false,
      login: "octocat",
      scopes: ["read:user"],
      missingScopes: ["public_repo"],
    });

    const { result } = renderHook(() => useGitHubAuth());

    await waitFor(() => expect(result.current.status).toBe("needs-scope"));
    expect(result.current.canSubmit).toBe(false);
    expect(result.current.missingScopes).toEqual(["public_repo"]);
  });

  it("disconnect() clears the stored token and returns to idle", async () => {
    seedToken("public_repo");
    verifyToken.mockResolvedValue({
      ok: true,
      login: "octocat",
      scopes: ["public_repo"],
      missingScopes: [],
    });

    const { result } = renderHook(() => useGitHubAuth());
    await waitFor(() => expect(result.current.status).toBe("connected"));

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.token).toBeNull();
    expect(result.current.status).toBe("idle");
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("picks up ?oauth_error= on mount into error state and strips it from the URL", async () => {
    window.history.replaceState(null, "", "/?oauth_error=access_denied");

    const { result } = renderHook(() => useGitHubAuth());

    await waitFor(() => expect(result.current.error).toBe("access_denied"));
    // The param is stripped so a refresh does not re-surface it.
    expect(window.location.search).toBe("");
  });
});
