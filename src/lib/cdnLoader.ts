import { isTauri } from "./platform";
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
  "sources_recipes.json",
  "npcs.json",
  "itemuses.json",
  "storagevaults.json",
  "areas.json",
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

// CDN constants (mirrored from Rust)
const CDN_BASE = "https://cdn.projectgorgon.com";

/**
 * Check whether pre-fetched CDN data is available as static files
 * (bundled at build time by scripts/fetch-cdn-data.mjs for GitHub Pages).
 */
async function tryStaticCdnVersion(): Promise<number | null> {
  try {
    const base = import.meta.env.BASE_URL ?? "/";
    const res = await fetch(`${base}cdn-data/version.txt`);
    if (!res.ok) return null;
    const version = parseInt((await res.text()).trim(), 10);
    return isNaN(version) ? null : version;
  } catch {
    return null;
  }
}

/**
 * Fetch the current CDN version number from the Project Gorgon server.
 * In Tauri: calls Rust command (avoids CORS on the HTTP endpoint).
 * In browser: tries static bundled data first, then dev proxy / CORS proxy.
 */
export async function fetchCdnVersion(): Promise<number> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<number>("fetch_cdn_version");
  }

  // Try static bundled data first (GitHub Pages build)
  const staticVersion = await tryStaticCdnVersion();
  if (staticVersion !== null) return staticVersion;

  // Browser: the version file is HTTP-only, so we route through a configurable proxy.
  // In dev: Vite proxies /api/cdn-version → http://client.projectgorgon.com/fileversion.txt
  // In prod: set VITE_CDN_PROXY to a CORS-enabled proxy URL, e.g. https://corsproxy.io/?
  const proxyBase = import.meta.env.VITE_CDN_PROXY as string | undefined;
  const versionUrl = proxyBase
    ? `${proxyBase}${encodeURIComponent("http://client.projectgorgon.com/fileversion.txt")}`
    : "/api/cdn-version";

  const res = await fetch(versionUrl);
  if (!res.ok) throw new Error(`Version check failed: HTTP ${res.status}`);
  const text = await res.text();
  // allorigins-style proxies return { contents: "..." }
  const version = parseInt(text.trim(), 10);
  if (isNaN(version)) {
    // Likely a JSON-wrapped proxy response
    try {
      const json = JSON.parse(text);
      const inner = json.contents ?? json.body ?? json.data ?? "";
      return parseInt(String(inner).trim(), 10);
    } catch {
      throw new Error(`Could not parse version from: ${text.slice(0, 100)}`);
    }
  }
  return version;
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

      // Download from CDN (or static bundled files)
      onProgress({ filename, status: "downloading" });
      let content: string;
      if (isTauri) {
        const { invoke } = await import("@tauri-apps/api/core");
        content = await invoke<string>("fetch_cdn_file", { version, filename });
      } else {
        // Try static bundled file first (GitHub Pages), fall back to CDN
        const base = import.meta.env.BASE_URL ?? "/";
        const staticRes = await fetch(`${base}cdn-data/${filename}`).catch(() => null);
        if (staticRes?.ok) {
          content = await staticRes.text();
        } else {
          const cdnRes = await fetch(`${CDN_BASE}/v${version}/data/${filename}`);
          if (!cdnRes.ok) throw new Error(`HTTP ${cdnRes.status}`);
          content = await cdnRes.text();
        }
      }

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
