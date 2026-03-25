#!/usr/bin/env node
/**
 * Pre-fetches Project Gorgon CDN data at build time so the web app
 * can load it from static files instead of hitting the CDN directly.
 * This avoids CORS and mixed-content issues on GitHub Pages.
 *
 * Output: public/cdn-data/version.txt + all JSON data files
 *
 * How to change:
 *   - CDN URLs: update VERSION_URL and CDN_BASE below. The canonical
 *     source of truth for these URLs is src/lib/config.ts — keep both
 *     in sync. (This script runs outside the Vite/TS pipeline, so it
 *     cannot import config.ts directly.)
 *   - To add new data files: add the filename to the FILES array below
 *     AND to ALL_CDN_FILES in src/lib/cdnLoader.ts.
 *   - Core vs optional: the first 3 files (recipes, items, xptables)
 *     are required — failure to fetch them will abort the build. The
 *     rest are optional and will be skipped with a warning.
 */

import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "cdn-data");

// Keep these in sync with CDN_BASE and VERSION_URL in src/lib/config.ts
const VERSION_URL = "http://client.projectgorgon.com/fileversion.txt";
const CDN_BASE = "https://cdn.projectgorgon.com";

// Files to fetch — order matters: core files first, then optional.
// Core files (recipes, items, xptables) are required for the app to function.
const CORE_FILES = ["recipes.json", "items.json", "xptables.json"];
const OPTIONAL_FILES = [
  "sources_items.json",
  "sources_recipes.json",
  "npcs.json",
  "itemuses.json",
  "storagevaults.json",
  "areas.json",
];
const FILES = [...CORE_FILES, ...OPTIONAL_FILES];

/**
 * Fetch a URL with one retry on failure (3-second delay between attempts).
 * Returns the Response object on success, or throws on double failure.
 */
async function fetchWithRetry(url) {
  try {
    const res = await fetch(url);
    if (res.ok) return res;
    throw new Error(`HTTP ${res.status}`);
  } catch (firstErr) {
    console.warn(`  Retry in 3s after: ${firstErr.message}`);
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} (after retry)`);
    return res;
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // 1. Fetch version number
  console.log(`Fetching version from ${VERSION_URL} ...`);
  const versionRes = await fetchWithRetry(VERSION_URL);
  const version = (await versionRes.text()).trim();
  console.log(`CDN version: ${version}`);
  writeFileSync(join(OUT_DIR, "version.txt"), version);

  // 2. Fetch all data files
  for (const filename of FILES) {
    const url = `${CDN_BASE}/v${version}/data/${filename}`;
    console.log(`Downloading ${filename} ...`);
    try {
      const res = await fetchWithRetry(url);
      const content = await res.text();
      writeFileSync(join(OUT_DIR, filename), content);
      console.log(`  ✓ ${filename} (${(content.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      if (CORE_FILES.includes(filename)) {
        // Core file failure is fatal — the app won't function without it
        throw new Error(`Failed to fetch required file ${filename}: ${err.message}`);
      }
      // Optional files can be skipped — the app handles their absence gracefully
      console.warn(`  ⚠ Failed to fetch ${filename}: ${err.message} (skipping)`);
    }
  }

  console.log(`\nDone! Files written to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
