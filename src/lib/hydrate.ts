/**
 * Restores all Zustand stores from IndexedDB on app startup so that
 * refreshing the page doesn't lose state.
 *
 * - CDN game data: re-parsed from the existing cdnFiles cache
 * - Characters: all saved characters restored to altStore, active one synced to legacy stores
 * - Inventory / Eaten foods: restored per-character
 */
import { getCachedVersion, getCachedFile, getUserFile, listUserFileKeys } from "./db";
import { ALL_CDN_FILES } from "./cdnLoader";
import { parseRecipes, buildRecipeIndexes } from "./parsers/recipeParser";
import { parseItems, buildItemIndexes } from "./parsers/itemParser";
import { parseXpTables } from "./parsers/xpTableParser";
import { parseSourcesData, parseNpcNames } from "./parsers/sourceParser";
import { parseCharacterSheet } from "./parsers/characterParser";
import { parseInventory } from "./parsers/inventoryParser";
import { parseEatenFoods } from "./parsers/eatenFoodsParser";
import { useGameDataStore } from "../stores/gameDataStore";
import { useAltStore } from "../stores/altStore";
import { useTagsStore } from "../stores/tagsStore";
import { injectMillingRecipes } from "./millingRecipes";

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

  // Inject wiki-sourced Milling recipes (not present in CDN data).
  // Must run after both recipes and items are loaded so item codes resolve.
  injectMillingRecipes();
}

/**
 * Attempt to restore all app state from IndexedDB.
 * Safe to call on every mount — silently skips anything that's missing.
 */
export async function hydrateFromCache(): Promise<void> {
  // 0. Restore user-authored tag definitions and assignments. Independent of
  //    CDN/character data, so can be kicked off in parallel.
  const tagsPromise = useTagsStore.getState().hydrate();

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
    if (files["recipes.json"] && files["items.json"]) {
      applyCdnFiles(files);
    }
  }

  // 2. Restore all characters (multi-character support)
  const altStore = useAltStore.getState();
  const charKeys = await listUserFileKeys("character:");

  // Also check for legacy single-character key ("character" without colon)
  const legacyChar = await getUserFile("character");

  if (charKeys.length > 0) {
    // Multi-character mode: restore each character
    for (const key of charKeys) {
      const id = key.slice("character:".length); // strip prefix
      try {
        const charJson = await getUserFile(key);
        if (!charJson) continue;
        const sheet = parseCharacterSheet(charJson);

        // Load paired inventory
        const invJson = await getUserFile(`inventory:${id}`);
        let inventory: import("../types/inventory").InventoryItem[] = [];
        let invTimestamp: string | null = null;
        if (invJson) {
          try {
            const inv = parseInventory(invJson);
            inventory = inv.Items;
            invTimestamp = inv.Timestamp;
          } catch (e) { console.warn(`Skipping corrupted inventory for ${id}:`, e); }
        }

        // Load paired eaten foods
        let eatenFoods: Map<string, number> | null = null;
        const eatenText = await getUserFile(`eatenFoods:${id}`);
        if (eatenText) {
          try {
            eatenFoods = parseEatenFoods(eatenText) ?? null;
          } catch (e) { console.warn(`Skipping corrupted eaten foods for ${id}:`, e); }
        }

        altStore.loadCharacter(sheet, inventory, invTimestamp, eatenFoods);
      } catch (e) { console.warn(`Skipping corrupted character ${id}:`, e); }
    }

    // Restore active character from localStorage
    const savedActive = localStorage.getItem("activeCharId");
    const ids = altStore.getCharacterIds();
    if (savedActive && ids.includes(savedActive)) {
      altStore.setActiveCharacter(savedActive);
    } else if (ids.length > 0) {
      altStore.setActiveCharacter(ids[0]);
    }
  } else if (legacyChar) {
    // Legacy single-character mode: migrate to multi-character
    try {
      const sheet = parseCharacterSheet(legacyChar);
      const id = altStore.loadCharacter(sheet);

      // Load legacy inventory
      const invJson = await getUserFile("inventory");
      if (invJson) {
        try {
          const inv = parseInventory(invJson);
          altStore.loadInventory(id, inv.Items, inv.Timestamp);
        } catch (e) { console.warn("Skipping corrupted inventory:", e); }
      }

      // Load legacy eaten foods
      const eatenText = await getUserFile("eatenFoods");
      if (eatenText) {
        try {
          const eatenMap = parseEatenFoods(eatenText);
          if (eatenMap) altStore.loadEatenFoods(id, eatenMap);
        } catch (e) { console.warn("Skipping corrupted eaten foods:", e); }
      }

      altStore.setActiveCharacter(id);
    } catch (e) { console.warn("Skipping corrupted character data:", e); }
  }

  // Ensure the tags hydrate settled before we return so UI starts with
  // the user's tags visible.
  await tagsPromise;
}
