/**
 * Multi-step crafting chain resolver.
 *
 * In Project Gorgon, many recipes require ingredients that are themselves crafted
 * from other recipes (e.g., making Cheese requires Milk, which requires a Milking
 * recipe). This module builds a tree of ingredient dependencies so the UI can
 * show the full crafting chain.
 *
 * The resolver works recursively: for each ingredient the player doesn't have
 * enough of, it looks up recipes that produce that item, picks the simplest one
 * (fewest ingredients), and recurses into its ingredients.
 *
 * Cycle prevention: a `visited` set tracks item codes already being resolved
 * in the current branch to avoid infinite loops (e.g., recipe A needs item B,
 * recipe for B needs item A).
 *
 * How to change:
 *  - maxDepth (default 3) limits recursion — increase if deeper chains are needed.
 *  - The "simplest recipe" heuristic (fewest ingredients) could be replaced with
 *    a cost-based or XP-based selection strategy.
 */
import type { Recipe } from "../types";

export interface IngredientNode {
  itemCode: number;
  itemName: string;
  quantity: number;
  haveInInventory: number;
  children: IngredientNode[]; // sub-ingredients if craftable
  craftingRecipe?: Recipe; // recipe that makes this item, if any
}

/**
 * Recursively resolve ingredient trees for a recipe.
 * Stops at items available in inventory or with no crafting recipe.
 * Max depth prevents infinite cycles.
 */
export function resolveIngredientTree(
  recipe: Recipe,
  craftCount: number,
  getItemByCode: (code: number) => { Name: string } | undefined,
  getItemQuantity: (typeId: number) => number,
  byResultItem: Map<number, Recipe[]>,
  maxDepth = 3,
  depth = 0,
  visited = new Set<number>()
): IngredientNode[] {
  if (depth >= maxDepth) return [];

  return recipe.Ingredients.map((ing) => {
    const item = getItemByCode(ing.ItemCode);
    const have = getItemQuantity(ing.ItemCode);
    const needed = Math.ceil(ing.StackSize * craftCount * (ing.ChanceToConsume ?? 1));

    // Find a crafting recipe for this ingredient (avoid cycles)
    let craftingRecipe: Recipe | undefined;
    let children: IngredientNode[] = [];

    // Only recurse if we don't have enough AND haven't visited this item (cycle guard)
    if (!visited.has(ing.ItemCode) && have < needed) {
      const producers = byResultItem.get(ing.ItemCode);
      if (producers && producers.length > 0) {
        // Pick simplest recipe (fewest ingredients) to keep the tree manageable
        craftingRecipe = producers.reduce((a, b) =>
          a.Ingredients.length <= b.Ingredients.length ? a : b
        );

        // Clone visited set per branch so sibling ingredients don't block each other
        const newVisited = new Set(visited);
        newVisited.add(ing.ItemCode);

        // Only need to craft enough to cover the deficit
        const subCraftCount = Math.ceil((needed - have) / ing.StackSize);
        children = resolveIngredientTree(
          craftingRecipe,
          subCraftCount,
          getItemByCode,
          getItemQuantity,
          byResultItem,
          maxDepth,
          depth + 1,
          newVisited
        );
      }
    }

    return {
      itemCode: ing.ItemCode,
      itemName: item?.Name ?? `Item #${ing.ItemCode}`,
      quantity: needed,
      haveInInventory: have,
      children,
      craftingRecipe,
    };
  });
}
