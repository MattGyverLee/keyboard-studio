/**
 * Zod request/response schemas for the managed PR submission endpoint.
 *
 * The SPA posts pre-filtered source files and attribution; the backend
 * runs the full GitHub Git Data API pipeline using the org service-account
 * token (never exposed to the browser).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// POST /submit/managed-pr — request body
// ---------------------------------------------------------------------------

export const ManagedPRBodySchema = z.object({
  attribution: z.object({
    displayName: z.string().min(1).max(120),
    email: z.string().email().max(254),
  }),
  keyboardId: z.string().min(1).max(80).regex(/^[a-z0-9_]+$/),
  prTitle: z.string().min(1).max(200),
  prBody: z.string().min(1).max(65536),
  importAttribution: z.string().max(4096).optional(),
  sourceFiles: z
    .array(
      z.object({
        path: z.string().min(1).max(512),
        content: z.string().max(1_048_576),
      })
    )
    .min(1)
    .max(50),
});

export type ManagedPRBody = z.infer<typeof ManagedPRBodySchema>;

// ---------------------------------------------------------------------------
// POST /submit/managed-pr — 200 response
// ---------------------------------------------------------------------------

/**
 * Successful response shape returned to the SPA.
 * Also used as documentation for what the engine programmer should expect.
 */
export const ManagedPRResponseSchema = z.object({
  prUrl: z.string().url(),
  commitSha: z.string().min(1),
});

export type ManagedPRResponse = z.infer<typeof ManagedPRResponseSchema>;
