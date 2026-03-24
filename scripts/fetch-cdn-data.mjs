#!/usr/bin/env node
/**
 * Pre-fetches Project Gorgon CDN data at build time so the web app
 * can load it from static files instead of hitting the CDN directly.
 * This avoids CORS and mixed-content issues on GitHub Pages.
 *
 * Output: public/cdn-data/version.txt + all JSON data files
 */

import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "cdn-data");

const VERSION_URL = "http://client.projectgorgon.com/fileversion.txt";
const CDN_BASE = "https://cdn.projectgorgon.com";

const FILES = [
  "recipes.json",
  "items.json",
  "xptables.json",
  "sources_items.json",
  "sources_recipes.json",
  "npcs.json",
  "itemuses.json",
  "storagevaults.json",
  "areas.json",
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // 1. Fetch version
  console.log(`Fetching version from ${VERSION_URL} ...`);
  const versionRes = await fetch(VERSION_URL);
  if (!versionRes.ok) throw new Error(`Version fetch failed: ${versionRes.status}`);
  const version = (await versionRes.text()).trim();
  console.log(`CDN version: ${version}`);
  writeFileSync(join(OUT_DIR, "version.txt"), version);

  // 2. Fetch all data files
  for (const filename of FILES) {
    const url = `${CDN_BASE}/v${version}/data/${filename}`;
    console.log(`Downloading ${filename} ...`);
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  ⚠ Failed to fetch ${filename}: ${res.status} (skipping)`);
      continue;
    }
    const content = await res.text();
    writeFileSync(join(OUT_DIR, filename), content);
    console.log(`  ✓ ${filename} (${(content.length / 1024).toFixed(0)} KB)`);
  }

  console.log(`\nDone! Files written to ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
