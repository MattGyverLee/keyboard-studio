/**
 * Unit tests for the Option B managed-PR pipeline in github-pipeline.ts.
 *
 * All tests use an injected stub fetch — no real GitHub calls. The stub routes
 * by URL + method so the 7-step pipeline (fork → ref → commit → tree → commit
 * → branch → PR) can be exercised end-to-end and individual steps overridden
 * to provoke each error path.
 */

import { describe, it, expect } from "vitest";
import {
  submitManagedPR,
  buildCommitMessage,
  buildManagedBranchName,
  type ManagedPRPipelineConfig,
} from "./github-pipeline.js";
import type { OAuthFetchFn, OAuthFetchResponse } from "./handlers.js";
import type { ManagedPRBody } from "./managed-pr-schemas.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_TOKEN = "gho_ORG_SECRET_SHOULD_NEVER_LEAK";
const ORG_LOGIN = "keyboard-studio-bot";
const NEW_COMMIT_SHA = "abc1234567890def00000000000000000000000";
const PR_URL = "https://github.com/keymanapp/keyboards/pull/4242";

const VALID_BODY: ManagedPRBody = {
  attribution: { displayName: "Ada Lovelace", email: "ada@example.com" },
  keyboardId: "my_keyboard",
  prTitle: "[my_keyboard] Add My Keyboard 1.0",
  prBody: "## Checklist\n- green",
  sourceFiles: [
    { path: "release/m/my_keyboard/source/my_keyboard.kmn", content: "store(&VERSION) '14.0'" },
    { path: "release/m/my_keyboard/my_keyboard.kps", content: "<Keyboard/>" },
  ],
};

/** Status of one step, keyed by a short tag, so tests override single calls. */
interface StepOverrides {
  forkCheck?: Partial<OAuthFetchResponse>;
  forkCreate?: Partial<OAuthFetchResponse>;
  masterRef?: Partial<OAuthFetchResponse>;
  parentCommit?: Partial<OAuthFetchResponse>;
  tree?: Partial<OAuthFetchResponse>;
  commit?: Partial<OAuthFetchResponse>;
  branch?: Partial<OAuthFetchResponse>;
  pr?: Partial<OAuthFetchResponse>;
}

function res(body: object, ok = true, status = 200): OAuthFetchResponse {
  return { ok, status, json: async () => body };
}

/**
 * Build a fetch stub that walks the happy path, applying any per-step
 * overrides. Captures every request so tests can assert request shape.
 */
function makeStub(overrides: StepOverrides = {}): {
  fetch: OAuthFetchFn;
  calls: Array<{ url: string; method: string; body?: string }>;
} {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fetch: OAuthFetchFn = async (url, init) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, ...(init?.body !== undefined ? { body: init.body } : {}) });

    const apply = (base: OAuthFetchResponse, ov?: Partial<OAuthFetchResponse>) =>
      ov ? { ...base, ...ov } : base;

    if (url.endsWith("/forks") && method === "POST") return apply(res({}, true, 202), overrides.forkCreate);
    if (url.includes("/git/ref/heads/master")) return apply(res({ object: { sha: "masterSha111" } }), overrides.masterRef);
    if (url.includes("/git/commits/masterSha111")) return apply(res({ tree: { sha: "treeShaBase" } }), overrides.parentCommit);
    if (url.endsWith("/git/trees") && method === "POST") return apply(res({ sha: "newTreeSha" }), overrides.tree);
    if (url.endsWith("/git/commits") && method === "POST") return apply(res({ sha: NEW_COMMIT_SHA }), overrides.commit);
    if (url.endsWith("/git/refs") && method === "POST") return apply(res({ ref: "ok" }, true, 201), overrides.branch);
    if (url.endsWith("/pulls") && method === "POST") return apply(res({ html_url: PR_URL }, true, 201), overrides.pr);
    // GET on the fork base = fork-exists check
    if (method === "GET") return apply(res({ full_name: `${ORG_LOGIN}/keyboards` }), overrides.forkCheck);
    throw new Error(`unexpected request: ${method} ${url}`);
  };
  return { fetch, calls };
}

function makeConfig(fetchFn: OAuthFetchFn): ManagedPRPipelineConfig {
  return { orgToken: ORG_TOKEN, orgLogin: ORG_LOGIN, fetch: fetchFn };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("buildCommitMessage()", () => {
  it("appends a Co-authored-by trailer crediting the human author", () => {
    const msg = buildCommitMessage("[my_keyboard] Add it", {
      displayName: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(msg).toContain("[my_keyboard] Add it");
    expect(msg).toContain("Co-authored-by: Ada Lovelace <ada@example.com>");
  });
});

describe("buildManagedBranchName()", () => {
  it("forms add/<keyboardId>-<short7sha> from the commit SHA", () => {
    expect(buildManagedBranchName("my_keyboard", NEW_COMMIT_SHA)).toBe("add/my_keyboard-abc1234");
  });

  it("differs for different commits, giving collision-free re-submission", () => {
    const a = buildManagedBranchName("kb", "1111111aaaa");
    const b = buildManagedBranchName("kb", "2222222bbbb");
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// submitManagedPR — happy path
// ---------------------------------------------------------------------------

describe("submitManagedPR() — success", () => {
  it("returns { prUrl, commitSha } after the full pipeline", async () => {
    const { fetch } = makeStub();
    const result = await submitManagedPR(VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.prUrl).toBe(PR_URL);
    expect(result.data.commitSha).toBe(NEW_COMMIT_SHA);
  });

  it("commits with a Co-authored-by trailer for the human author", async () => {
    const { fetch, calls } = makeStub();
    await submitManagedPR(VALID_BODY, makeConfig(fetch));
    const commitCall = calls.find((c) => c.url.endsWith("/git/commits") && c.method === "POST");
    expect(commitCall?.body).toContain("Co-authored-by: Ada Lovelace <ada@example.com>");
  });

  it("opens the PR from the org fork branch against keymanapp/keyboards master, as a draft", async () => {
    const { fetch, calls } = makeStub();
    await submitManagedPR(VALID_BODY, makeConfig(fetch));
    const prCall = calls.find((c) => c.url.endsWith("/pulls"));
    const body = JSON.parse(prCall!.body!) as { head: string; base: string; draft: boolean };
    expect(body.head).toBe(`${ORG_LOGIN}:add/my_keyboard-abc1234`);
    expect(body.base).toBe("master");
    expect(body.draft).toBe(true);
  });

  it("appends importAttribution to the PR body when supplied", async () => {
    const { fetch, calls } = makeStub();
    await submitManagedPR(
      { ...VALID_BODY, importAttribution: "## Import attribution\nDerived from base-x" },
      makeConfig(fetch)
    );
    const prCall = calls.find((c) => c.url.endsWith("/pulls"));
    const body = JSON.parse(prCall!.body!) as { body: string };
    expect(body.body).toContain("Import attribution");
  });

  it("creates the fork first when it does not yet exist (404 → POST /forks)", async () => {
    const { fetch, calls } = makeStub({ forkCheck: { ok: false, status: 404 } });
    const result = await submitManagedPR(VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/forks") && c.method === "POST")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// submitManagedPR — error mapping
// ---------------------------------------------------------------------------

describe("submitManagedPR() — error mapping", () => {
  it("maps a 422 on branch creation to 409 branch_exists with the branch name", async () => {
    const { fetch } = makeStub({ branch: { ok: false, status: 422 } });
    const result = await submitManagedPR(VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(409);
    expect(result.error).toBe("branch_exists");
    expect(result.branchName).toBe("add/my_keyboard-abc1234");
  });

  it("maps a 429 to rate_limited with a retry hint", async () => {
    const { fetch } = makeStub({ tree: { ok: false, status: 429 } });
    const result = await submitManagedPR(VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(429);
    expect(result.error).toBe("rate_limited");
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("maps an org-token 401 to a generic 502 submission_unavailable (no token detail)", async () => {
    const { fetch } = makeStub({ masterRef: { ok: false, status: 401 } });
    const result = await submitManagedPR(VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(502);
    expect(result.error).toBe("submission_unavailable");
  });

  it("maps an org-token 403 the same generic way", async () => {
    const { fetch } = makeStub({ commit: { ok: false, status: 403 } });
    const result = await submitManagedPR(VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(502);
    expect(result.error).toBe("submission_unavailable");
  });

  it("maps any other non-ok to 502 upstream_error", async () => {
    const { fetch } = makeStub({ pr: { ok: false, status: 500 } });
    const result = await submitManagedPR(VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(502);
    expect(result.error).toBe("upstream_error");
  });

  it("maps a network throw to 502 submission_unavailable", async () => {
    const fetch: OAuthFetchFn = async () => {
      throw new Error("ECONNREFUSED");
    };
    const result = await submitManagedPR(VALID_BODY, makeConfig(fetch));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(502);
    expect(result.error).toBe("submission_unavailable");
  });
});

// ---------------------------------------------------------------------------
// submitManagedPR — org token never leaks into any returned result
// ---------------------------------------------------------------------------

describe("submitManagedPR() — org token never leaks", () => {
  it("is absent from a success result", async () => {
    const { fetch } = makeStub();
    const result = await submitManagedPR(VALID_BODY, makeConfig(fetch));
    expect(JSON.stringify(result)).not.toContain(ORG_TOKEN);
  });

  it("is absent from every error result", async () => {
    const failures: StepOverrides[] = [
      { branch: { ok: false, status: 422 } },
      { tree: { ok: false, status: 429 } },
      { masterRef: { ok: false, status: 401 } },
      { pr: { ok: false, status: 500 } },
    ];
    for (const ov of failures) {
      const { fetch } = makeStub(ov);
      const result = await submitManagedPR(VALID_BODY, makeConfig(fetch));
      expect(JSON.stringify(result)).not.toContain(ORG_TOKEN);
    }
  });

  it("sends the org token in the Authorization header to GitHub (and only there)", async () => {
    // The token must reach GitHub but never the result; assert it is used as a
    // Bearer credential on the request, not echoed back.
    let sawAuth = false;
    const fetch: OAuthFetchFn = async (url, init) => {
      const auth = init?.headers?.["Authorization"];
      if (auth === `Bearer ${ORG_TOKEN}`) sawAuth = true;
      // Delegate to the happy-path stub behaviour.
      const { fetch: inner } = makeStub();
      return inner(url, init);
    };
    await submitManagedPR(VALID_BODY, makeConfig(fetch));
    expect(sawAuth).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stateless backend — secret server-side only, no token persistence (doc §4)
// ---------------------------------------------------------------------------

describe("submitManagedPR() — stateless / no token persistence", () => {
  it("never places the org token in any request body — only the header", async () => {
    const { fetch, calls } = makeStub();
    await submitManagedPR(VALID_BODY, makeConfig(fetch));
    // The token may appear in Authorization headers (not captured here) but
    // must never be serialised into a request body the pipeline sends.
    for (const c of calls) {
      expect(c.body ?? "").not.toContain(ORG_TOKEN);
    }
  });

  it("holds no cross-call state — the token comes only from the passed config", async () => {
    // First call with a token; second call with a DIFFERENT config that has no
    // token usage leaking from the first. A persisted/cached token would show
    // up here as the wrong Authorization value.
    const first = makeStub();
    await submitManagedPR(VALID_BODY, makeConfig(first.fetch));

    let observedToken: string | undefined;
    const probe: OAuthFetchFn = async (url, init) => {
      observedToken ??= init?.headers?.["Authorization"];
      const { fetch: inner } = makeStub();
      return inner(url, init);
    };
    const OTHER_TOKEN = "gho_A_COMPLETELY_DIFFERENT_TOKEN";
    await submitManagedPR(VALID_BODY, {
      orgToken: OTHER_TOKEN,
      orgLogin: ORG_LOGIN,
      fetch: probe,
    });
    // The second call must authenticate with its own config token, proving no
    // token from the first call was retained anywhere in module state.
    expect(observedToken).toBe(`Bearer ${OTHER_TOKEN}`);
    expect(observedToken).not.toContain(ORG_TOKEN);
  });
});
