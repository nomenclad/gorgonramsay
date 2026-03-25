/**
 * Restores all Zustand stores from IndexedDB on app startup so that
 * refreshing the page doesn't lose state.
 *
 * - CDN game data: re-parsed from the existing cdnFiles cache
 * - Character / Inventory: restored from the userFiles table
 */
import { getCachedVersion, getCachedFile, getUserFile } from "./db";
import { ALL_CDN_FILES } from "./cdnLoader";
import { parseRecipes, buildRecipeIndexes } from "./parsers/recipeParser";
import { parseItems, buildItemIndexes } from "./parsers/itemParser";
import { parseXpTables } from "./parsers/xpTableParser";
import { parseSourcesData, parseNpcNames } from "./parsers/sourceParser";
import { parseCharacterSheet } from "./parsers/characterParser";
import { parseInventory } from "./parsers/inventoryParser";
import { useGameDataStore } from "../stores/gameDataStore";
import { useCharacterStore } from "../stores/characterStore";
import { useInventoryStore } from "../stores/inventoryStore";

/**
 * Apply a map of CDN file contents to the game data store (no status log).
 * Order matters: recipes and items must be parsed first because other data
 * (sources, item uses) references them by ID. Each file is guarded by an
 * `if` check so partial cache hits still work — optional files may be absent.
 */
function applyCdnFiles(files: Record<string, string>) {
  const store = useGameDataStore.getState();

  if (files["recipes.json"]) {
    const recipes = parseRecipes(files["recipes.json"]);
    const indexes = buildRecipeIndexes(recipes);
    store.setRecipes(recipes, indexes);
  }
  if (files["items.json"]) {
    const items = parseItems(files["items.json"]);
    const indexes = buildItemIndexes(items);
    store.setItems(items, indexes);
  }
  if (files["xptables.json"]) {
    store.setXpTables(parseXpTables(files["xptables.json"]));
  }
  if (files["sources_items.json"]) {
    store.setSources(parseSourcesData(files["sources_items.json"]));
  }
  if (files["sources_recipes.json"]) {
    store.setRecipeSources(parseSourcesData(files["sources_recipes.json"]));
  }
  if (files["npcs.json"]) {
    store.setNpcNames(parseNpcNames(files["npcs.json"]));
  }
  if (files["itemuses.json"]) {
    store.setItemUsesJson(files["itemuses.json"]);
  }
  if (files["storagevaults.json"]) {
    store.setStorageVaults(files["storagevaults.json"]);
  }
  if (files["areas.json"]) {
    store.setAreas(files["areas.json"]);
  }
}

/**
 * Attempt to restore all app state from IndexedDB.
 * Safe to call on every mount — silently skips anything that's missing.
 */
export async function hydrateFromCache(): Promise<void> {
  // 1. Restore CDN game data first — recipes/items must be available before
  //    character or inventory parsing, since those stores may reference item codes.
  const version = await getCachedVersion();
  if (version) {
    useGameDataStore.getState().setCdnVersion(version);
    const files: Record<string, string> = {};
    await Promise.all(
      ALL_CDN_FILES.map(async (filename) => {
        const content = await getCachedFile(version, filename);
        if (content) files[filename] = content;
      }),
    );
    // Core files (recipes + items) are required for the app to function.
    // Without them the UI has nothing to display, so skip hydration entirely.
    if (files["recipes.json"] && files["items.json"]) {
      applyCdnFiles(files);
    }
  }

  // 2. Restore character — must come after CDN data so skill names can be resolved
  const charJson = await getUserFile("character");
  if (charJson) {
    try {
      const sheet = parseCharacterSheet(charJson);
      useCharacterStore.getState().setCharacter(sheet);
    } catch (e) { console.warn("Skipping corrupted character data:", e); }
  }

  // 3. Restore inventory — last because it's the least critical for initial render
  const invJson = await getUserFile("inventory");
  if (invJson) {
    try {
      const inv = parseInventory(invJson);
      useInventoryStore.getState().setInventory(inv.Items, inv.Timestamp, inv.Character);
    } catch (e) { console.warn("Skipping corrupted inventory data:", e); }
  }
}
