import './index.css';
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StudioShell } from "./StudioShell.tsx";
import { LintDemo } from "./lint/index.ts";
import { runOAuthCallbackIfPresent } from "./lib/handleOAuthCallback.ts";

function mountApp(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    throw new Error("Studio bootstrap: #root element missing from index.html");
  }

  const isDemoLint =
    typeof window !== "undefined" &&
    window.location.search.includes("demo=lint");

  createRoot(rootEl).render(
    <StrictMode>
      {isDemoLint ? <LintDemo /> : <StudioShell />}
    </StrictMode>,
  );
}

// GitHub OAuth (spec §12 "Option A"): the studio is hash-routed, so the
// /oauth/callback redirect is handled here at boot rather than by a router.
// When the path matches, the handler exchanges the code for a token and
// redirects to the app root; we skip mounting this tick (the redirect remounts).
void (async () => {
  const handled = await runOAuthCallbackIfPresent();
  if (!handled) {
    mountApp();
  }
})();
