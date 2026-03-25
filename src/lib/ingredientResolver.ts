/**
 * Ingredient availability checker and cost estimator.
 *
 * Determines whether a player has the required ingredients to craft a recipe,
 * how many times they can craft it, and what it would cost to buy missing items.
 *
 * Key concept: ChanceToConsume — some ingredients in Project Gorgon are only
 * consumed probabilistically (e.g., a 50% chance the tool breaks). This module
 * uses expected values for planning, which is accurate over many crafts but may
 * over- or under-estimate for a single craft.
 *
 * How to change:
 *  - The vendor markup multiplier (item.Value * 2) in `estimateIngredientCost` is
 *    a rough approximation. Update the factor if better pricing data is available.
 */
import type { Recipe, Item } from "../types";
import { expectedConsumption } from "./xpCalculator";

export interface IngredientCheck {
  itemCode: number;
  name: string;
  neededPerCraft: number;
  chanceToConsume: number;
  have: number;
  sufficient: boolean;
}

/**
 * Check ingredient availability for a single craft attempt.
 */
export function checkIngredients(
  recipe: Recipe,
  getItemByCode: (code: number) => Item | undefined,
  getItemQuantity: (typeId: number) => number
): IngredientCheck[] {
  return recipe.Ingredients.map((ing) => {
    const item = getItemByCode(ing.ItemCode);
    const have = getItemQuantity(ing.ItemCode);
    return {
      itemCode: ing.ItemCode,
      name: item?.Name ?? `Item #${ing.ItemCode}`,
      neededPerCraft: ing.StackSize,
      chanceToConsume: ing.ChanceToConsume ?? 1.0,
      have,
      sufficient: have >= ing.StackSize,
    };
  });
}

/**
 * Calculate how many times a recipe can be crafted given current inventory.
 * Accounts for ChanceToConsume (probabilistic consumption).
 * Uses expected value for planning purposes.
 */
export function countCraftable(
  recipe: Recipe,
  getItemQuantity: (typeId: number) => number
): number {
  if (recipe.Ingredients.length === 0) return Infinity;

  // The bottleneck ingredient determines max crafts — find the minimum across all.
  let min = Infinity;
  for (const ing of recipe.Ingredients) {
    const have = getItemQuantity(ing.ItemCode);
    const chance = ing.ChanceToConsume ?? 1.0;
    // Expected consumption per craft = stackSize * chanceToConsume
    const expectedPerCraft = ing.StackSize * chance;
    if (expectedPerCraft <= 0) continue; // zero-consume ingredients (tools) don't limit crafts
    const crafts = Math.floor(have / expectedPerCraft);
    min = Math.min(min, crafts);
  }

  return min === Infinity ? 0 : min;
}

/**
 * Deduct ingredients from a mutable inventory map for N crafts.
 * Returns updated inventory.
 */
export function deductIngredients(
  recipe: Recipe,
  craftCount: number,
  inventory: Map<number, number>
): Map<number, number> {
  const updated = new Map(inventory);
  for (const ing of recipe.Ingredients) {
    const needed = expectedConsumption(
      ing.StackSize,
      ing.ChanceToConsume,
      craftCount
    );
    const current = updated.get(ing.ItemCode) ?? 0;
    updated.set(ing.ItemCode, Math.max(0, current - needed));
  }
  return updated;
}

/**
 * Calculate ingredient cost if buying from vendors.
 * Uses item value * 2 as a rough buy price estimate (vendor markup).
 */
export function estimateIngredientCost(
  recipe: Recipe,
  craftCount: number,
  getItemByCode: (code: number) => Item | undefined,
  getItemQuantity: (typeId: number) => number
): number {
  let total = 0;
  for (const ing of recipe.Ingredients) {
    const have = getItemQuantity(ing.ItemCode);
    const needed = expectedConsumption(
      ing.StackSize,
      ing.ChanceToConsume,
      craftCount
    );
    const missing = Math.max(0, needed - have);
    if (missing > 0) {
      const item = getItemByCode(ing.ItemCode);
      const buyPrice = (item?.Value ?? 0) * 2;
      total += missing * buyPrice;
    }
  }
  return total;
}
