/**
 * Vite build configuration — dual-target setup for web and desktop.
 *
 * Two build targets controlled by the BUILD_TARGET env var:
 *   - "web"  → GitHub Pages deployment (dist-web/, base "/gorgonramsay/")
 *   - unset  → Tauri desktop app (dist/, base "/")
 *
 * Key decisions:
 *   - The dev proxy routes /api/cdn-version through Vite because the game's
 *     version endpoint is HTTP-only (mixed-content blocked in browsers).
 *     The canonical URL is in src/lib/config.ts — update both if it changes.
 *   - Tauri packages (@tauri-apps/*) are marked as external in web builds.
 *     They're dynamically imported behind `if (isTauri)` guards and never
 *     execute in the browser, but Rollup still needs them to resolve.
 *
 * How to change:
 *   - To change the GitHub Pages base path: edit the `base` field below.
 *   - To add Tauri plugins to the web exclusion list: add to rollupOptions.external.
 *   - To change the CDN proxy target: update the proxy target URL below AND
 *     the VERSION_URL constant in src/lib/config.ts.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;
const isWebBuild = process.env.BUILD_TARGET === "web";

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Vite options tailored for Tauri development
  clearScreen: false,

  server: {
    port: isWebBuild ? 5175 : 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 5174 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    // Proxy for web dev mode: routes HTTP-only CDN version check through Vite
    // to avoid mixed-content and CORS issues in the browser.
    ...(isWebBuild && {
      proxy: {
        "/api/cdn-version": {
          target: "http://client.projectgorgon.com",
          changeOrigin: true,
          rewrite: () => "/fileversion.txt",
        },
      },
    }),
  },

  base: isWebBuild ? "/gorgonramsay/" : "/",

  build: isWebBuild
    ? {
        outDir: "dist-web",
        // Exclude Tauri-specific packages from the web bundle.
        // Dynamic imports of @tauri-apps/* inside `if (isTauri)` blocks are
        // never executed in the browser, but we still need them to resolve
        // without errors at module parse time.
        rollupOptions: {
          external: (id) =>
            id.startsWith("@tauri-apps/api") ||
            id.startsWith("@tauri-apps/plugin-dialog"),
        },
      }
    : {},
});
