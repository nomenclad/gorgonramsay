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
