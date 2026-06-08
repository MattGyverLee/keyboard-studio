// Service container. Config flag: VITE_USE_REAL_ENGINE (default: true).
// Set VITE_USE_REAL_ENGINE=false in .env.local to force mocks (test/CI only).
import type { BaseBrowserService } from "@keyboard-studio/contracts";
import { localBaseBrowser, LOCAL_PROXY_BASE } from "./localBaseBrowser.ts";

const USE_REAL = import.meta.env.VITE_USE_REAL_ENGINE !== "false";

// Re-export the proxy base for callers that need it.
export { LOCAL_PROXY_BASE, USE_REAL };

// BaseBrowserService: in dev, the Vite plugin-backed local browser is the
// real implementation. In production this would be createBaseBrowser() from
// the engine pointing at the GitHub API.
export function getBaseBrowserService(): BaseBrowserService {
  return localBaseBrowser;
}
