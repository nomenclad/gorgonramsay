/**
 * Platform detection — true when running inside the Tauri desktop app,
 * false when running as a plain web page in a browser.
 */
export const isTauri: boolean =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
