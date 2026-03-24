/**
 * Platform detection — true when running inside the Tauri desktop app,
 * false when running as a plain web page in a browser.
 */
export const isTauri: boolean =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

/** True when the browser supports the File System Access API (directory picker). */
export const supportsFileSystemAccess: boolean =
  typeof window !== "undefined" && "showDirectoryPicker" in window;
