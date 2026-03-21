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

    if (!visited.has(ing.ItemCode) && have < needed) {
      const producers = byResultItem.get(ing.ItemCode);
      if (producers && producers.length > 0) {
        // Pick simplest recipe (fewest ingredients)
        craftingRecipe = producers.reduce((a, b) =>
          a.Ingredients.length <= b.Ingredients.length ? a : b
        );

        const newVisited = new Set(visited);
        newVisited.add(ing.ItemCode);

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
