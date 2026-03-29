/**
 * Derive Gourmand food data from items.json and xptables.json.
 *
 * Gourmand XP is awarded the first time a player eats a food item.
 * - Food items have a `FoodDesc` field like "Level 20 Meal" or "Level 0 Snack".
 * - The XP amount for a food at food-level N is xpTable.XpAmounts[N]
 *   from the table with InternalName "Gourmand" (Table_12).
 *
 * NOTE: The /exportcharacter JSON does NOT include eaten-food tracking.
 * RecipeCompletions only records which recipes have been crafted and how
 * many times. We use crafting data as the best available proxy — if a
 * cooking recipe has been completed, the player likely also ate the food.
 * Raw/foraged foods (no cooking recipe) cannot be tracked at all.
 */

import type { Item } from "../../types/item";
import type { XpTable } from "../../types/xpTable";

export interface FoodItem {
  itemCode: number;
  internalName: string;
  itemName: string;
  iconId?: number;
  gourmandXp: number;
  foodLevel: number;
  /** Gourmand skill level required to eat this food (from SkillReqs.Gourmand). */
  gourmandLevelReq: number;
  foodType: string; // "Meal", "Snack", "Instant-Snack", etc.
  effects: string[];
  /**
   * True when a crafting recipe produces this food item (matched via
   * ResultItems.ItemCode). Only for these foods can crafted status be
   * determined from RecipeCompletions. Raw/foraged foods are false.
   */
  hasTracking: boolean;
  /**
   * The cooking recipe's InternalName — used to check RecipeCompletions
   * for crafting status. May differ from the item's InternalName
   * (e.g. recipe "CookingFood_MildCheddarCheese" vs item "MildCheddarCheese").
   * Null for raw/foraged foods that have no crafting recipe.
   */
  recipeInternalName: string | null;
}

/** Extract the numeric level and type label from FoodDesc (e.g. "Level 20 Meal" → {level:20, type:"Meal"}). */
function parseFoodDesc(foodDesc: string): { level: number; type: string } | null {
  const m = foodDesc.match(/Level\s+(\d+)\s+(.*)/i);
  if (!m) return null;
  return { level: parseInt(m[1], 10), type: m[2].trim() };
}

export function parseGourmandFoods(
  items: Item[],
  xpTables: XpTable[],
  recipeByResultItem?: Map<number, { InternalName: string }>
): FoodItem[] {
  // Find the Gourmand XP table
  const gourmandTable = xpTables.find((t) => t.InternalName === "Gourmand");
  if (!gourmandTable) return [];

  const foods: FoodItem[] = [];

  for (const item of items) {
    if (!item.FoodDesc) continue;

    const parsed = parseFoodDesc(item.FoodDesc);
    if (!parsed) continue;

    const { level, type } = parsed;

    // Look up XP — clamp to table bounds
    const xpIndex = Math.min(level, gourmandTable.XpAmounts.length - 1);
    const gourmandXp = gourmandTable.XpAmounts[xpIndex] ?? 0;

    // Derive numeric item code from id string ("item_1234" → 1234)
    const codeMatch = item.id.match(/(\d+)$/);
    const itemCode = codeMatch ? parseInt(codeMatch[1], 10) : 0;

    // Match food to its crafting recipe via ResultItems.ItemCode
    const matchedRecipe = recipeByResultItem?.get(itemCode) ?? null;

    foods.push({
      itemCode,
      internalName: item.InternalName,
      itemName: item.Name,
      iconId: item.IconId,
      gourmandXp,
      foodLevel: level,
      gourmandLevelReq: item.SkillReqs?.Gourmand ?? level,
      foodType: type,
      effects: item.EffectDescs ?? [],
      hasTracking: matchedRecipe !== null,
      recipeInternalName: matchedRecipe?.InternalName ?? null,
    });
  }

  return foods.sort((a, b) => b.foodLevel - a.foodLevel || a.itemName.localeCompare(b.itemName));
}
