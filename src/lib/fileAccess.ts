import {
  getStoredDirectoryHandle,
  storeDirectoryHandle,
  clearDirectoryHandle,
} from "./db";

export interface ReportFile {
  filename: string;
  path: string; // Tauri: absolute path; Web: filename
  modified_timestamp: number; // Unix seconds
  file_type: string; // "character" | "inventory"
}

/**
 * Classify a report filename (mirrors the Rust classify_file logic).
 * Returns null for unrecognised files.
 */
export function classifyFile(filename: string): "character" | "inventory" | null {
  if (filename.startsWith("Character_") && filename.endsWith(".json"))
    return "character";
  if (filename.includes("_items_") && filename.endsWith(".json"))
    return "inventory";
  return null;
}

const DIR_HANDLE_KEY = "pgReportsDir";

/**
 * Open a directory picker and persist the handle in IndexedDB.
 * Throws if the user cancels or the browser doesn't support it.
 */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!window.showDirectoryPicker) {
    throw new Error("File System Access API is not supported in this browser");
  }
  const handle = await window.showDirectoryPicker({ mode: "read" });
  await storeDirectoryHandle(DIR_HANDLE_KEY, handle);
  return handle;
}

/** Retrieve the previously-stored directory handle, or null. */
export async function getStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
  return getStoredDirectoryHandle(DIR_HANDLE_KEY);
}

/** Clear the stored directory handle. */
export async function clearStoredHandle(): Promise<void> {
  await clearDirectoryHandle(DIR_HANDLE_KEY);
}

/**
 * Check whether we still have read permission on a stored handle.
 * Returns "granted", "prompt" (needs user gesture), or "denied".
 */
export async function verifyPermission(
  handle: FileSystemDirectoryHandle
): Promise<"granted" | "prompt" | "denied"> {
  const opts = { mode: "read" as const };
  const status = await handle.queryPermission(opts);
  if (status === "granted") return "granted";
  // "prompt" means the browser can ask again with a user gesture
  if (status === "prompt") return "prompt";
  return "denied";
}

/**
 * Request read permission on a stored handle (must be called from a user gesture).
 * Returns true if granted.
 */
export async function requestPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  const status = await handle.requestPermission({ mode: "read" as const });
  return status === "granted";
}

/**
 * List report files from either a Tauri path string or a web directory handle.
 * Returns files sorted by modified_timestamp descending (newest first).
 */
export async function listReportFiles(
  source: string | FileSystemDirectoryHandle
): Promise<ReportFile[]> {
  if (typeof source === "string") {
    // Tauri codepath
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<ReportFile[]>("list_report_files", { reportsPath: source });
  }

  // Web codepath — iterate directory entries
  const files: ReportFile[] = [];
  for await (const entry of source.values()) {
    if (entry.kind !== "file") continue;
    const ft = classifyFile(entry.name);
    if (!ft) continue;
    try {
      const fileHandle = await source.getFileHandle(entry.name);
      const file = await fileHandle.getFile();
      files.push({
        filename: entry.name,
        path: entry.name,
        modified_timestamp: Math.floor(file.lastModified / 1000),
        file_type: ft,
      });
    } catch {
      // File may have been deleted between listing and reading — skip
    }
  }

  files.sort((a, b) => b.modified_timestamp - a.modified_timestamp);
  return files;
}

/**
 * Read a file's text content from either a Tauri path or a web directory handle.
 */
export async function readFileContent(
  source: string | FileSystemDirectoryHandle,
  filenameOrPath: string
): Promise<string> {
  if (typeof source === "string") {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("read_file_content", { path: filenameOrPath });
  }

  const fileHandle = await source.getFileHandle(filenameOrPath);
  const file = await fileHandle.getFile();
  return file.text();
}
