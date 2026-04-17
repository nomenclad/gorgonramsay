/**
 * Wiki-sourced milling recipes.
 *
 * The Project Gorgon CDN's `recipes.json` does not include Milling recipes
 * (the skill isn't among the 68 CDN skills at all). This module defines
 * them manually from the wiki (https://wiki.projectgorgon.com/wiki/Milling)
 * and injects synthetic Recipe objects into the game data store after
 * CDN data is loaded.
 *
 * Because we don't know item codes ahead of time, the injection step
 * resolves ingredient/result item **names** against the loaded `items.json`
 * at runtime. If a name can't be resolved (e.g. the item doesn't exist in
 * the current CDN version), that recipe is silently skipped.
 *
 * This module is intentionally self-contained: all wiki data lives here,
 * and the single public function `injectMillingRecipes()` is idempotent —
 * safe to call multiple times (after CDN refresh, drag-drop, etc.).
 *
 * Source: https://wiki.projectgorgon.com/wiki/Milling
 */
import type { Recipe } from "../types/recipe";
import { buildRecipeIndexes } from "./parsers/recipeParser";
import { useGameDataStore } from "../stores/gameDataStore";

interface WikiMillingRecipe {
  ingredientName: string;
  resultName: string;
  xp: number;
  levelReq: number;
}

const WIKI_MILLING_RECIPES: WikiMillingRecipe[] = [
  { ingredientName: "Barley",       resultName: "Barley Flour",        xp:  50, levelReq:  5 },
  { ingredientName: "Flower Seeds", resultName: "Ground Flower Seeds", xp:  75, levelReq: 10 },
  { ingredientName: "Tundra Rye",   resultName: "Rye Flour",           xp: 100, levelReq: 15 },
  { ingredientName: "Almonds",      resultName: "Almond Flour",        xp: 110, levelReq: 18 },
  { ingredientName: "Oat Groats",   resultName: "Oat Flour",           xp: 150, levelReq: 25 },
  { ingredientName: "Corn",         resultName: "Cornmeal",            xp: 250, levelReq: 22 },
  { ingredientName: "Orcish Wheat", resultName: "Orcish Flour",        xp: 500, levelReq: 35 },
];

/**
 * Inject wiki-sourced Milling recipes into the game data store.
 *
 * **Prerequisites:** Both `recipes` and `items` must already be loaded in
 * the store (the function is a no-op otherwise).
 *
 * **Idempotency:** If recipes with `Skill === "Milling"` already exist in
 * the store, the call is a no-op — safe to call after every CDN load.
 */
export function injectMillingRecipes(): void {
  const store = useGameDataStore.getState();
  const { items, recipes, recipeIndexes } = store;

  if (!items.length || !recipes.length || !recipeIndexes) return;
  if (recipes.some((r) => r.Skill === "Milling")) return;

  // Build case-insensitive name → item-code lookup from items.json
  const nameToCode = new Map<string, number>();
  for (const item of items) {
    const m = item.id.match(/(\d+)$/);
    if (m) nameToCode.set(item.Name.toLowerCase(), parseInt(m[1], 10));
  }

  const synthetic: Recipe[] = [];
  for (const wr of WIKI_MILLING_RECIPES) {
    const ingCode = nameToCode.get(wr.ingredientName.toLowerCase());
    const resCode = nameToCode.get(wr.resultName.toLowerCase());
    if (ingCode === undefined || resCode === undefined) continue;

    synthetic.push({
      id: `milling_${wr.ingredientName.toLowerCase().replace(/\s+/g, "_")}`,
      Name: `Mill ${wr.ingredientName}`,
      InternalName: `MillRecipe_${wr.ingredientName.replace(/\s+/g, "")}`,
      Skill: "Milling",
      SkillLevelReq: wr.levelReq,
      Ingredients: [{ ItemCode: ingCode, StackSize: 1 }],
      ResultItems: [{ ItemCode: resCode, StackSize: 1 }],
      RewardSkillXp: wr.xp,
      Keywords: ["Milling"],
    });
  }

  if (synthetic.length === 0) return;

  const combined = [...recipes, ...synthetic];
  const newIndexes = buildRecipeIndexes(combined);
  store.setRecipes(combined, newIndexes);
}
