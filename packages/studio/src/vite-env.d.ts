/// <reference types="vite/client" />

declare module "*.yaml?raw" {
  const src: string;
  export default src;
}

// Studio build-time environment (Vite `import.meta.env`). Declaring this
// interface augments Vite's ImportMetaEnv so reads are typed.
interface ImportMetaEnv {
  /**
   * GitHub OAuth web-app client id (public; ships in the browser bundle).
   * Required for the "Connect GitHub" PKCE flow (spec §12 "Option A").
   */
  readonly VITE_GITHUB_CLIENT_ID: string;
  /**
   * Base URL of the OAuth backend (issue #63) that holds the client secret and
   * performs the code→token exchange. Default "" = same-origin, so requests
   * hit `/oauth/exchange` on the page's own host.
   */
  readonly VITE_OAUTH_BACKEND_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
