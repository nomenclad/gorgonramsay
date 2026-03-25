/**
 * @module useQuickCook
 *
 * Auto-picks the best uneaten food to cook next based on what the player
 * owns in their inventory and hasn't eaten yet (for Gourmand XP).
 *
 * Selection logic:
 * 1. Considers only foods with Gourmand tracking (i.e. foods that grant
 *    first-time-eat XP).
 * 2. Prioritizes uneaten foods over already-eaten ones.
 * 3. Within each group, sorts by food level (highest first) for maximum
 *    Gourmand XP gain.
 * 4. Picks one meal and one snack separately (the two food slots).
 * 5. Verifies the player has the required skill level and ingredients
 *    (either in inventory or purchasable from a vendor).
 *
 * Returns `handleQuickCook` which queues the picks into the planner.
 */
import { useMemo, useCallback } from "react";
import { useGameDataStore } from "../stores/gameDataStore";
import { useCharacterStore } from "../stores/characterStore";
import { useInventoryStore } from "../stores/inventoryStore";
import { usePlannerStore } from "../stores/plannerStore";
import { parseGourmandFoods } from "../lib/parsers/gourmandParser";
import { getAcquisitionMethods } from "../lib/sourceResolver";
import type { Recipe } from "../types/recipe";

export interface QuickCookPick {
  recipe: Recipe;
  foodLevel: number;
}

export interface QuickCookResult {
  meal: QuickCookPick | null;
  snack: QuickCookPick | null;
  handleQuickCook: () => void;
}

export function useQuickCook(onAfterQueue?: () => void): QuickCookResult {
  const recipes = useGameDataStore((s) => s.recipes);
  const items = useGameDataStore((s) => s.items);
  const xpTables = useGameDataStore((s) => s.xpTables);
  const loaded = useGameDataStore((s) => s.loaded);

  const character = useCharacterStore((s) => s.character);
  const getItemQuantity = useInventoryStore((s) => s.getItemQuantity);
  const starRecipe = usePlannerStore((s) => s.starRecipe);

  const recipeByName = useMemo(
    () => new Map(recipes.map((r) => [r.InternalName, r])),
    [recipes]
  );
  const recipeByResultItem = useMemo(() => {
    const m = new Map<number, { InternalName: string }>();
    for (const r of recipes) {
      for (const ri of r.ResultItems) {
        if (!m.has(ri.ItemCode)) m.set(ri.ItemCode, r);
      }
    }
    return m;
  }, [recipes]);
  const foods = useMemo(
    () =>
      loaded && items.length > 0 && xpTables.length > 0
        ? parseGourmandFoods(items, xpTables, recipeByResultItem)
        : [],
    [loaded, items, xpTables, recipeByResultItem]
  );

  const completions = character?.RecipeCompletions ?? {};

  const picks = useMemo(() => {
    const result: { meal: QuickCookPick | null; snack: QuickCookPick | null } = {
      meal: null,
      snack: null,
    };
    if (!character) return result;

    const sorted = [...foods]
      .filter((f) => f.hasTracking)
      .sort((a, b) => {
        const aEaten = a.recipeInternalName! in completions ? 1 : 0;
        const bEaten = b.recipeInternalName! in completions ? 1 : 0;
        if (aEaten !== bEaten) return aEaten - bEaten;
        return b.foodLevel - a.foodLevel;
      });

    for (const food of sorted) {
      const type = food.foodType.toLowerCase();
      const isMeal = type.includes("meal");
      const isSnack = type.includes("snack");
      if (!isMeal && !isSnack) continue;
      if (isMeal && result.meal) continue;
      if (isSnack && result.snack) continue;

      const recipe = recipeByName.get(food.recipeInternalName!);
      if (!recipe) continue;
      if (!(recipe.InternalName in completions)) continue;
      const playerSkillLevel = character.Skills[recipe.Skill]?.Level ?? 0;
      if (playerSkillLevel < recipe.SkillLevelReq) continue;

      const hasAll = recipe.Ingredients.every((ing) => {
        if (getItemQuantity(ing.ItemCode) >= ing.StackSize) return true;
        const methods = getAcquisitionMethods(ing.ItemCode, 0);
        return methods.some((m) => m.kind === "vendor");
      });
      if (!hasAll) continue;

      const pick = { recipe, foodLevel: food.foodLevel };
      if (isMeal && !result.meal) result.meal = pick;
      if (isSnack && !result.snack) result.snack = pick;
      if (result.meal && result.snack) break;
    }
    return result;
  }, [foods, completions, recipeByName, getItemQuantity, character]);

  const handleQuickCook = useCallback(() => {
    if (picks.meal) {
      starRecipe(picks.meal.recipe.id, picks.meal.recipe.InternalName, 1);
    }
    if (picks.snack) {
      starRecipe(picks.snack.recipe.id, picks.snack.recipe.InternalName, 1);
    }
    onAfterQueue?.();
  }, [picks, starRecipe, onAfterQueue]);

  return { meal: picks.meal, snack: picks.snack, handleQuickCook };
}
