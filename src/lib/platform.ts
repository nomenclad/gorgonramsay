/**
 * Platform detection — true when running inside the Tauri desktop app,
 * false when running as a plain web page in a browser.
 *
 * Tauri v2 injects `__TAURI_INTERNALS__` on the window object; the legacy
 * `__TAURI__` check covers Tauri v1. If Tauri changes its injection mechanism
 * in a future major version, update the property names checked here.
 */
export const isTauri: boolean =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

/** True when the browser supports the File System Access API (directory picker). */
export const supportsFileSystemAccess: boolean =
  typeof window !== "undefined" && "showDirectoryPicker" in window;
