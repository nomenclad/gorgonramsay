import { invoke } from "@tauri-apps/api/core";
import {
  getCachedFile,
  setCachedFile,
  setCachedVersion,
  evictOldVersions,
} from "./db";

/** Files required for core functionality (always downloaded). */
export const CORE_CDN_FILES = [
  "recipes.json",
  "items.json",
  "xptables.json",
] as const;

/** Optional files — enhance shopping list and source data. */
export const OPTIONAL_CDN_FILES = [
  "sources_items.json",
  "npcs.json",
] as const;

export const ALL_CDN_FILES = [...CORE_CDN_FILES, ...OPTIONAL_CDN_FILES] as const;
export type CdnFilename = (typeof ALL_CDN_FILES)[number];

export interface DownloadProgress {
  filename: string;
  status: "pending" | "cached" | "downloading" | "done" | "error";
  error?: string;
}

export interface CdnLoadResult {
  version: number;
  files: Record<string, string>; // filename -> raw JSON content
}

/**
 * Fetch the current CDN version number from the Project Gorgon server.
 * Calls the Rust tauri command to avoid CORS issues.
 */
export async function fetchCdnVersion(): Promise<number> {
  return invoke<number>("fetch_cdn_version");
}

/**
 * Load all CDN files, using IndexedDB cache when available.
 *
 * @param onProgress  Called for each file as its status changes.
 * @param forceRefresh  If true, bypass cache and re-download everything.
 */
export async function loadAllCdnFiles(
  onProgress: (p: DownloadProgress) => void,
  forceRefresh = false
): Promise<CdnLoadResult> {
  // 1. Get current version from server
  const version = await fetchCdnVersion();

  // 2. Evict stale cache entries from old versions
  await evictOldVersions(version);
  await setCachedVersion(version);

  const files: Record<string, string> = {};

  // 3. Load each file — cache-first
  for (const filename of ALL_CDN_FILES) {
    onProgress({ filename, status: "pending" });

    try {
      // Check cache first (unless forced refresh)
      if (!forceRefresh) {
        const cached = await getCachedFile(version, filename);
        if (cached) {
          files[filename] = cached;
          onProgress({ filename, status: "cached" });
          continue;
        }
      }

      // Download from CDN via Rust command
      onProgress({ filename, status: "downloading" });
      const content = await invoke<string>("fetch_cdn_file", { version, filename });

      // Store in cache
      await setCachedFile(version, filename, content);
      files[filename] = content;
      onProgress({ filename, status: "done" });
    } catch (e) {
      const isOptional = (OPTIONAL_CDN_FILES as readonly string[]).includes(filename);
      onProgress({
        filename,
        status: "error",
        error: String(e),
      });
      // Only throw for core files; optional files can be skipped
      if (!isOptional) {
        throw new Error(`Failed to load required file ${filename}: ${e}`);
      }
    }
  }

  return { version, files };
}
