/**
 * Auto-selects the maximum number of known recipes to craft, using all
 * available ingredients from storage and vendor purchases.
 *
 * Rules:
 * - Only selects known recipes (InternalName in RecipeCompletions)
 * - Prioritizes recipes never crafted before (first-craft XP bonus)
 * - Prioritizes highest skill level recipes the player can craft
 * - Maximizes ingredient usage — attempts to use every owned ingredient
 * - Allows purchasing ingredients from cooking vendor NPCs
 * - Does NOT select unknown/unlearned recipes
 */
import { useMemo, useCallback } from "react";
import { useGameDataStore } from "../stores/gameDataStore";
import { useCharacterStore } from "../stores/characterStore";
import { useInventoryStore } from "../stores/inventoryStore";
import { usePlannerStore } from "../stores/plannerStore";
import { FOOD_SKILLS } from "../lib/foodSkills";
import { getAcquisitionMethods } from "../lib/sourceResolver";
import type { Recipe } from "../types/recipe";

export interface QuickCookAllResult {
  /** Total recipes that would be queued */
  recipeCount: number;
  /** Execute the auto-plan: clears planner and queues all selected recipes */
  handleQuickCookAll: () => void;
}

export function useQuickCookAll(onAfterQueue?: () => void): QuickCookAllResult {
  const recipes = useGameDataStore((s) => s.recipes);
  const loaded = useGameDataStore((s) => s.loaded);
  const character = useCharacterStore((s) => s.character);
  const getItemQuantity = useInventoryStore((s) => s.getItemQuantity);
  const aggregated = useInventoryStore((s) => s.aggregated);
  const starRecipe = usePlannerStore((s) => s.starRecipe);
  const clearAll = usePlannerStore((s) => s.clearAll);

  const completions = character?.RecipeCompletions ?? {};

  // Build the auto-selected recipe plan
  const plan = useMemo(() => {
    if (!loaded || !character) return [];

    // 1. Filter to known food recipes the player can craft
    const candidates = recipes.filter((r) => {
      if (!FOOD_SKILLS.has(r.Skill)) return false;
      // Must be a known recipe
      if (!(r.InternalName in completions)) return false;
      // Must meet skill level requirement
      const skillLevel = character.Skills[r.Skill]?.Level ?? 0;
      if (skillLevel < r.SkillLevelReq) return false;
      // Must have ingredients available (in inventory or vendor-purchasable)
      return r.Ingredients.every((ing) => {
        if (getItemQuantity(ing.ItemCode) >= ing.StackSize) return true;
        const methods = getAcquisitionMethods(ing.ItemCode, 0);
        return methods.some((m) => m.kind === "vendor");
      });
    });

    // 2. Sort: first-craft first, then by skill level descending
    candidates.sort((a, b) => {
      const aFirstCraft = (completions[a.InternalName] ?? 0) === 0 ? 0 : 1;
      const bFirstCraft = (completions[b.InternalName] ?? 0) === 0 ? 0 : 1;
      if (aFirstCraft !== bFirstCraft) return aFirstCraft - bFirstCraft;
      return b.SkillLevelReq - a.SkillLevelReq;
    });

    // 3. Greedy fill: iterate recipes, craft as many as possible
    // Track a working copy of inventory quantities
    const workingInventory = new Map<number, number>();
    for (const agg of aggregated) {
      workingInventory.set(agg.typeId, agg.totalQuantity);
    }

    const selected: { recipe: Recipe; quantity: number }[] = [];

    for (const recipe of candidates) {
      // Calculate max craftable from current working inventory
      let maxCrafts = Infinity;
      for (const ing of recipe.Ingredients) {
        const have = workingInventory.get(ing.ItemCode) ?? 0;
        const craftsFromInventory = Math.floor(have / ing.StackSize);
        maxCrafts = Math.min(maxCrafts, craftsFromInventory);
      }

      if (maxCrafts === Infinity) maxCrafts = 0;

      // If we can't craft any from inventory, check if vendor-purchasable for at least 1
      if (maxCrafts === 0) {
        const canVendor = recipe.Ingredients.every((ing) => {
          const have = workingInventory.get(ing.ItemCode) ?? 0;
          if (have >= ing.StackSize) return true;
          const methods = getAcquisitionMethods(ing.ItemCode, 0);
          return methods.some((m) => m.kind === "vendor");
        });
        if (canVendor) maxCrafts = 1;
      }

      if (maxCrafts <= 0) continue;

      // Deduct ingredients from working inventory
      for (const ing of recipe.Ingredients) {
        const have = workingInventory.get(ing.ItemCode) ?? 0;
        const used = ing.StackSize * maxCrafts;
        workingInventory.set(ing.ItemCode, Math.max(0, have - used));
      }

      selected.push({ recipe, quantity: maxCrafts });
    }

    return selected;
  }, [loaded, character, recipes, completions, getItemQuantity, aggregated]);

  const handleQuickCookAll = useCallback(() => {
    if (plan.length === 0) return;
    clearAll();
    for (const { recipe, quantity } of plan) {
      starRecipe(recipe.id, recipe.InternalName, quantity);
    }
    onAfterQueue?.();
  }, [plan, clearAll, starRecipe, onAfterQueue]);

  return {
    recipeCount: plan.length,
    handleQuickCookAll,
  };
}
