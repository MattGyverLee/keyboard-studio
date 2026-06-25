/**
 * Server-side GitHub Git Data API pipeline for Option B (org-mediated PR).
 *
 * The SPA never holds a token in this path. It POSTs pre-filtered source files
 * plus author attribution to POST /submit/managed-pr; this module runs the
 * fork → tree → commit → branch → draft-PR pipeline using the org
 * service-account token, which lives server-side only.
 *
 * Mirror of packages/engine/src/output/github.ts publishPR(), with two
 * differences:
 *   1. The fork owner is the studio org, not the user; the token is the org
 *      service-account token.
 *   2. The human author is credited via a `Co-authored-by` commit trailer
 *      (docs/github_flow.md "Option B"), since the org account is the committer.
 *
 * SECURITY CONTRACT (parity with handlers.ts / google-handlers.ts):
 *  - The org token is never logged and never appears in any response body.
 *  - On any GitHub auth/scope failure (401/403) the route returns a generic
 *    "submission_unavailable" — a misconfigured org token is a server problem,
 *    never surfaced to the SPA as an actionable client error.
 */

import type { ManagedPRBody } from "./managed-pr-schemas.js";
import type { OAuthFetchFn, OAuthFetchResponse } from "./handlers.js";

// ---------------------------------------------------------------------------
// Config — org credentials injected at startup, never returned to the route
// ---------------------------------------------------------------------------

export interface ManagedPRPipelineConfig {
  /** Org service-account OAuth token with public_repo scope. Never logged. */
  orgToken: string;
  /** GitHub login that owns the studio's standing fork of keymanapp/keyboards. */
  orgLogin: string;
  fetch: OAuthFetchFn;
}

// ---------------------------------------------------------------------------
// Handler result — mirrors handlers.ts HandlerResult, plus the extra fields
// the engine's PublishManagedPRError mapping reads (branchName / retry).
// ---------------------------------------------------------------------------

export type ManagedPRHandlerResult =
  | { ok: true; data: { prUrl: string; commitSha: string } }
  | {
      ok: false;
      status: number;
      error: string;
      /** Surfaced in the 409 body so the engine maps to branch-exists. */
      branchName?: string;
      /** Surfaced via Retry-After on 429. */
      retryAfterSeconds?: number;
    };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = "https://api.github.com";
const UPSTREAM_OWNER = "keymanapp";
const UPSTREAM_REPO = "keyboards";

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Build the single-commit message: the SPA-supplied title followed by a
 * `Co-authored-by` trailer crediting the human author. The org account is the
 * committer; this trailer is how the human gets attribution in git history.
 */
export function buildCommitMessage(
  prTitle: string,
  attribution: ManagedPRBody["attribution"]
): string {
  return `${prTitle}\n\nCo-authored-by: ${attribution.displayName} <${attribution.email}>`;
}

/**
 * Branch name on the org fork: `add/<keyboardId>-<shortSha>`.
 *
 * The short SHA is the first 7 chars of the new commit — deterministic and
 * content-unique, so re-submitting the same keyboard while a prior branch is
 * still open does not collide (resolves docs/github-integration.md §5 Q1).
 */
export function buildManagedBranchName(keyboardId: string, commitSha: string): string {
  return `add/${keyboardId}-${commitSha.slice(0, 7)}`;
}

function buildHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// submitManagedPR — the route handler
// ---------------------------------------------------------------------------

/**
 * Run the org-mediated fork+PR pipeline for a validated request body.
 *
 * Returns a discriminated result (never throws) in the same shape handlers.ts
 * uses, so the route can `if (!result.ok) reply.status(result.status)`.
 *
 * Error mapping (all token-leak-safe):
 *  - Network throw                 → 502 submission_unavailable
 *  - GitHub 401/403 (org token)    → 502 submission_unavailable (server misconfig)
 *  - GitHub 429                    → 429 rate_limited (+ retryAfterSeconds)
 *  - Branch already exists (422)   → 409 branch_exists (+ branchName)
 *  - Any other non-ok              → 502 upstream_error
 */
export async function submitManagedPR(
  body: ManagedPRBody,
  config: ManagedPRPipelineConfig
): Promise<ManagedPRHandlerResult> {
  const { orgToken, orgLogin, fetch: fetchFn } = config;
  const forkBase = `${API_BASE}/repos/${orgLogin}/${UPSTREAM_REPO}`;
  const upstreamBase = `${API_BASE}/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`;

  const call = (url: string, method = "GET", payload?: unknown) =>
    fetchFn(url, {
      method,
      headers: buildHeaders(orgToken),
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    });

  // Map a GitHub non-ok response to a safe handler error. 401/403 mean the org
  // token is missing/insufficient — a server-side misconfiguration, surfaced
  // generically and never leaking that the *org* token is the problem.
  const mapNonOk = (res: OAuthFetchResponse): ManagedPRHandlerResult => {
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 502, error: "submission_unavailable" };
    }
    if (res.status === 429) {
      return { ok: false, status: 429, error: "rate_limited", retryAfterSeconds: 60 };
    }
    return { ok: false, status: 502, error: "upstream_error" };
  };

  try {
    // 1. Ensure the org fork exists.
    const forkCheck = await call(forkBase);
    if (!forkCheck.ok) {
      if (forkCheck.status !== 404) return mapNonOk(forkCheck);
      const created = await call(`${upstreamBase}/forks`, "POST", {});
      if (!created.ok) return mapNonOk(created);
    }

    // 2. Read the fork's master HEAD commit SHA.
    const masterRef = await call(`${forkBase}/git/ref/heads/master`);
    if (!masterRef.ok) return mapNonOk(masterRef);
    const refData = (await masterRef.json()) as { object: { sha: string } };
    const masterCommitSha = refData.object.sha;

    // 3. Read the base tree SHA from the parent commit.
    const parentCommit = await call(`${forkBase}/git/commits/${masterCommitSha}`);
    if (!parentCommit.ok) return mapNonOk(parentCommit);
    const parentData = (await parentCommit.json()) as { tree: { sha: string } };
    const baseTreeSha = parentData.tree.sha;

    // 4. Build the tree from the SPA-filtered source files (text content only).
    const treeEntries = body.sourceFiles.map((f) => ({
      path: f.path,
      mode: "100644",
      type: "blob",
      content: f.content,
    }));

    // 5. Create the tree.
    const newTree = await call(`${forkBase}/git/trees`, "POST", {
      base_tree: baseTreeSha,
      tree: treeEntries,
    });
    if (!newTree.ok) return mapNonOk(newTree);
    const newTreeSha = ((await newTree.json()) as { sha: string }).sha;

    // 6. Create the commit (org committer + Co-authored-by human trailer).
    const newCommit = await call(`${forkBase}/git/commits`, "POST", {
      message: buildCommitMessage(body.prTitle, body.attribution),
      tree: newTreeSha,
      parents: [masterCommitSha],
    });
    if (!newCommit.ok) return mapNonOk(newCommit);
    const newCommitSha = ((await newCommit.json()) as { sha: string }).sha;

    // 7. Create the branch ref (content-unique short-SHA suffix).
    const branchName = buildManagedBranchName(body.keyboardId, newCommitSha);
    const branchRef = await call(`${forkBase}/git/refs`, "POST", {
      ref: `refs/heads/${branchName}`,
      sha: newCommitSha,
    });
    if (!branchRef.ok) {
      if (branchRef.status === 422) {
        return { ok: false, status: 409, error: "branch_exists", branchName };
      }
      return mapNonOk(branchRef);
    }

    // 8. Open the draft PR upstream.
    const prBody =
      body.importAttribution !== undefined && body.importAttribution.length > 0
        ? `${body.prBody}\n\n${body.importAttribution}`
        : body.prBody;
    const pr = await call(`${upstreamBase}/pulls`, "POST", {
      title: body.prTitle,
      body: prBody,
      head: `${orgLogin}:${branchName}`,
      base: "master",
      draft: true,
    });
    if (!pr.ok) return mapNonOk(pr);
    const prData = (await pr.json()) as { html_url: string };

    return { ok: true, data: { prUrl: prData.html_url, commitSha: newCommitSha } };
  } catch {
    // Network-level error — do not propagate internal details.
    return { ok: false, status: 502, error: "submission_unavailable" };
  }
}
