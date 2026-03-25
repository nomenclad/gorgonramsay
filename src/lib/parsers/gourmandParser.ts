/**
 * Derive Gourmand food data from items.json and xptables.json.
 *
 * Gourmand XP is awarded the first time a player eats a food item.
 * - Food items have a `FoodDesc` field like "Level 20 Meal" or "Level 0 Snack".
 * - The XP amount for a food at food-level N is xpTable.XpAmounts[N]
 *   from the table with InternalName "Gourmand" (Table_12).
 * - Eaten status is tracked in CharacterSheet.RecipeCompletions keyed by the
 *   food item's InternalName (e.g. "GoblinBread"), NOT "EatItem:xxx".
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
  foodType: string; // "Meal", "Snack", "Instant-Snack", etc.
  effects: string[];
  /**
   * True when a crafting recipe produces this food item (matched via
   * ResultItems.ItemCode). Only for these foods can eaten status be
   * reliably inferred from RecipeCompletions.
   */
  hasTracking: boolean;
  /**
   * The recipe InternalName used as the key in RecipeCompletions.
   * This may differ from the item's InternalName (e.g. recipe
   * "CookingFood_MildCheddarCheese" vs item "MildCheddarCheese").
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
      foodType: type,
      effects: item.EffectDescs ?? [],
      hasTracking: matchedRecipe !== null,
      recipeInternalName: matchedRecipe?.InternalName ?? null,
    });
  }

  return foods.sort((a, b) => b.foodLevel - a.foodLevel || a.itemName.localeCompare(b.itemName));
}
