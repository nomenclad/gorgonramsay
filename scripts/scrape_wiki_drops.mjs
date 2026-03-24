/**
 * scrape_wiki_drops.mjs
 *
 * Scrapes the Project Gorgon wiki for monster drop data for food-related
 * ingredients and saves the result to public/monster_drops.json.
 *
 * Usage:
 *   node scripts/scrape_wiki_drops.mjs [--resume]
 *
 * Requires Node 18+ (uses built-in fetch).
 * Run from the project root: node scripts/scrape_wiki_drops.mjs
 *
 * Output: public/monster_drops.json
 *   { "Grapes": [{ monster: "Giant Mantis", location: "Serbule Hills" }, ...], ... }
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// ── Config ────────────────────────────────────────────────────────────────────
const CDN_DIR       = "/Users/lulu/Documents/gorgon jsons";
const OUTPUT_FILE   = path.join(projectRoot, "public", "monster_drops.json");
const PROGRESS_FILE = path.join(projectRoot, "scripts", "scrape_progress.json");
const DELAY_MS      = 150;   // polite delay between wiki requests
const WIKI_BASE     = "http://wiki.projectgorgon.com/wiki";

// Food-related skill names (mirrors src/lib/foodSkills.ts)
const FOOD_SKILLS = new Set([
  "Cooking", "Cheesemaking", "Gourmand", "Gardening", "Fishing",
  "Angling", "Butchering", "Foraging", "Mycology",
  "SushiPreparation", "IceConjuration",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadJson(filename) {
  const fullPath = path.join(CDN_DIR, filename);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

/**
 * Derive the wiki URL slug from an item name.
 * e.g. "Giant Mantis Claw" → "Giant_Mantis_Claw"
 */
function wikiSlug(name) {
  return name.replace(/ /g, "_");
}

/**
 * Fetch an item's wiki page and extract the Drops table rows.
 * Returns an array of { monster, location } objects, or [] if not found.
 */
async function fetchWikiDrops(itemName) {
  const url = `${WIKI_BASE}/${encodeURIComponent(wikiSlug(itemName))}`;
  let html;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "GorgonRamsay-Scraper/1.0 (food-planner app; educational use)" },
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    console.warn(`  ⚠ fetch error for "${itemName}": ${e.message}`);
    return null; // null = retriable error
  }

  // Find a "Drops" section — wiki uses <span class="mw-headline" id="Drops"> heading
  // then a <table> follows (possibly after </h3> and a newline)
  const dropIdx = html.indexOf('id="Drops"');
  if (dropIdx === -1) return [];

  // Grab everything from that point, find the first <table> after it
  const afterDrops = html.slice(dropIdx);
  const tableStart = afterDrops.indexOf("<table");
  if (tableStart === -1) return [];

  // Find matching </table> — handle nested tables
  const fromTable = afterDrops.slice(tableStart);
  let depth = 0;
  let end = 0;
  const openRe = /<table/gi;
  const closeRe = /<\/table>/gi;
  openRe.lastIndex = 0;
  closeRe.lastIndex = 0;

  // Walk through all open/close table tags to find the balanced end
  const events = [];
  let m;
  const tmpOpenRe = /<table/gi;
  const tmpCloseRe = /<\/table>/gi;
  while ((m = tmpOpenRe.exec(fromTable)) !== null) events.push({ pos: m.index, open: true });
  while ((m = tmpCloseRe.exec(fromTable)) !== null) events.push({ pos: m.index, open: false });
  events.sort((a, b) => a.pos - b.pos);

  for (const ev of events) {
    if (ev.open) depth++;
    else {
      depth--;
      if (depth === 0) { end = ev.pos + "</table>".length; break; }
    }
  }
  if (end === 0) return [];

  const tableHtml = fromTable.slice(0, end);

  // Parse table rows — each <tr> has two <td> cells: Monster | Location
  const rows = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    const rowHtml = trMatch[1];
    // Skip header rows (th only)
    if (/<th/i.test(rowHtml) && !/<td/i.test(rowHtml)) continue;

    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      // Strip HTML tags and decode entities
      const text = tdMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&#\d+;/g, (m) => String.fromCharCode(parseInt(m.slice(2, -1), 10)))
        .replace(/\s+/g, " ")
        .trim();
      if (text) cells.push(text);
    }

    if (cells.length >= 2) {
      rows.push({ monster: cells[0], location: cells[1] });
    } else if (cells.length === 1) {
      rows.push({ monster: cells[0], location: "" });
    }
  }

  return rows;
}

// ── Build ingredient list from CDN data ───────────────────────────────────────

function buildIngredientSet() {
  console.log("📂 Loading CDN data…");
  const itemsRaw = loadJson("items.json");
  const recipesRaw = loadJson("recipes.json");

  // Collect item codes used as ingredients in food-skill recipes
  const foodIngredientCodes = new Set();
  const foodResultCodes = new Set();

  for (const [, recipe] of Object.entries(recipesRaw)) {
    if (!FOOD_SKILLS.has(recipe.Skill)) continue;

    (recipe.Ingredients ?? []).forEach((ing) => {
      const code = typeof ing.ItemCode === "number" ? ing.ItemCode : parseInt(ing.ItemCode, 10);
      if (code) foodIngredientCodes.add(code);
    });

    (recipe.ResultItems ?? []).forEach((ri) => {
      const code = typeof ri.ItemCode === "number" ? ri.ItemCode : parseInt(ri.ItemCode, 10);
      if (code) foodResultCodes.add(code);
    });
    // Single result item shorthand
    if (recipe.ResultItemCode) foodResultCodes.add(recipe.ResultItemCode);
  }

  // Map item code → name for ingredients
  const ingredients = new Map(); // name → { code, isCrafted }
  for (const [id, item] of Object.entries(itemsRaw)) {
    const codeMatch = id.match(/(\d+)$/);
    if (!codeMatch) continue;
    const code = parseInt(codeMatch[1], 10);

    if (foodIngredientCodes.has(code)) {
      // Only include items that are NOT crafted results (raw/foraged/monster drop ingredients)
      const isCrafted = foodResultCodes.has(code);
      ingredients.set(item.Name, { code, isCrafted });
    }
  }

  console.log(`✅ Found ${ingredients.size} food ingredients (${[...ingredients.values()].filter(v => !v.isCrafted).length} non-crafted)`);
  return ingredients;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const resume = process.argv.includes("--resume");

  const ingredients = buildIngredientSet();

  // Load existing results if resuming
  let results = {};
  let skipped = new Set();

  if (resume && fs.existsSync(OUTPUT_FILE)) {
    results = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
    skipped = new Set(Object.keys(results));
    console.log(`⏩ Resuming — ${skipped.size} items already scraped`);
  }

  // Only scrape non-crafted ingredients (crafted ones won't appear on wiki drop tables)
  const toScrape = [...ingredients.entries()]
    .filter(([name, { isCrafted }]) => !isCrafted && !skipped.has(name))
    .sort(([a], [b]) => a.localeCompare(b));

  console.log(`🌐 Scraping ${toScrape.length} items from wiki…\n`);

  let done = 0;
  let withDrops = 0;
  let errors = 0;

  for (const [name] of toScrape) {
    process.stdout.write(`  [${done + 1}/${toScrape.length}] ${name}… `);

    const drops = await fetchWikiDrops(name);

    if (drops === null) {
      // Retriable error — skip for now
      console.log("⚠ error (skipped)");
      errors++;
    } else if (drops.length === 0) {
      console.log("—");
      results[name] = [];
    } else {
      console.log(`✓ ${drops.length} sources`);
      results[name] = drops;
      withDrops++;
    }

    done++;

    // Save progress every 25 items
    if (done % 25 === 0) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
      console.log(`  💾 Saved progress (${done} done)\n`);
    }

    await sleep(DELAY_MS);
  }

  // Final save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

  console.log(`\n✅ Done!`);
  console.log(`   ${done} items scraped`);
  console.log(`   ${withDrops} have monster/location drop data`);
  console.log(`   ${errors} errors (run with --resume to retry)`);
  console.log(`   Output: ${OUTPUT_FILE}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
