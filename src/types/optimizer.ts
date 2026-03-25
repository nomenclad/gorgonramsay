/**
 * Types for skill leveling optimization results.
 *
 * The optimizer calculates the most efficient sequence of recipes to craft
 * in order to level a skill from one level to another, considering inventory,
 * XP drop-off, and ingredient costs.
 */

/** Availability status of a single ingredient for a leveling step. */
export interface IngredientStatus {
  itemCode: number;
  name: string;
  needed: number;
  have: number;
  sufficient: boolean;
  expectedNeeded: number; // accounting for ChanceToConsume
}

/** A single step in the leveling plan: craft a recipe N times for XP. */
export interface LevelingStep {
  recipeId: string;
  recipeName: string;
  recipeInternalName: string;
  skillLevelReq: number;
  craftCount: number;
  xpPerCraft: number;
  totalXp: number;
  /** Whether the player has never crafted this recipe before (first-time bonus eligible). */
  isFirstTime: boolean;
  /** Bonus XP from crafting this recipe for the first time (0 if already crafted). */
  firstTimeXp: number;
  ingredients: IngredientStatus[];
  resultItems: { itemCode: number; name: string; quantity: number }[];
  /** True if all ingredients for all craft repetitions are available in inventory. */
  canCraftFromInventory: boolean;
  ingredientCost: number; // gold cost if buying missing ingredients
}

/** Complete result of an optimization run for a single skill. */
export interface OptimizerResult {
  skill: string;
  fromLevel: number;
  toLevel: number;
  totalXpNeeded: number;
  totalXpGained: number;
  steps: LevelingStep[];
  totalIngredientCost: number;
  missingIngredients: MissingIngredient[];
}

/** An ingredient the player needs to acquire to complete the leveling plan. */
export interface MissingIngredient {
  itemCode: number;
  name: string;
  totalNeeded: number;
  inInventory: number;
  toBuy: number;
  estimatedCost: number;
  usedInSteps: string[]; // recipe names
}
