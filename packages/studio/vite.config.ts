import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-server proxy for keymanapp/keyboards release tree source files.
// Bypasses CORS on raw.githubusercontent.com. POC fetches from
// `/kbd-proxy/release/<initial>/<id>/source/<id>.kmn` etc. and feeds
// the bytes into the VirtualFS before CompilerService.compile() runs.
// Production needs a CSP-safe alternative (cached artifact server,
// signed CDN URLs, or compile-on-demand backend) — tracked separately.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/kbd-proxy": {
        target: "https://raw.githubusercontent.com",
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/kbd-proxy/, "/keymanapp/keyboards/master"),
      },
    },
  },
});
