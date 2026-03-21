import type { Recipe, Item, XpTable, MissingIngredient } from "../types";
import type { LevelingStep, OptimizerResult } from "../types/optimizer";
import {
  computeEffectiveXp,
  expectedConsumption,
} from "./xpCalculator";
import { deductIngredients, estimateIngredientCost } from "./ingredientResolver";

export interface OptimizerInput {
  skill: string;
  currentLevel: number;
  currentXp: number;
  xpNeededForNext: number;
  targetLevel: number;
  xpTable: XpTable;
  recipes: Recipe[];
  recipeCompletions: Record<string, number>;
  inventory: Map<number, number>; // typeId -> quantity
  getItemByCode: (code: number) => Item | undefined;
}

/**
 * Calculate total XP needed from current state to target level.
 */
function totalXpToTarget(
  currentLevel: number,
  currentXp: number,
  xpNeededForNext: number,
  targetLevel: number,
  xpTable: XpTable
): number {
  if (currentLevel >= targetLevel) return 0;
  let total = xpNeededForNext - currentXp;
  for (let lvl = currentLevel + 1; lvl < targetLevel; lvl++) {
    if (lvl < xpTable.XpAmounts.length) {
      total += xpTable.XpAmounts[lvl];
    }
  }
  return Math.max(0, total);
}

/**
 * Add XP to current level/xp state, returning updated level and xp.
 */
function addXp(
  level: number,
  xp: number,
  addAmount: number,
  xpTable: XpTable
): { level: number; xp: number } {
  let curLevel = level;
  let curXp = xp + addAmount;
  while (curLevel < xpTable.XpAmounts.length) {
    const needed = xpTable.XpAmounts[curLevel];
    if (curXp >= needed) {
      curXp -= needed;
      curLevel++;
    } else {
      break;
    }
  }
  return { level: curLevel, xp: curXp };
}

/**
 * Count how many times a recipe can be crafted from inventory (expected value).
 */
function countCraftableFromMap(
  recipe: Recipe,
  inventory: Map<number, number>
): number {
  if (recipe.Ingredients.length === 0) return 0;
  let min = Infinity;
  for (const ing of recipe.Ingredients) {
    const have = inventory.get(ing.ItemCode) ?? 0;
    const chance = ing.ChanceToConsume ?? 1.0;
    const expectedPerCraft = ing.StackSize * chance;
    if (expectedPerCraft <= 0) continue;
    const crafts = Math.floor(have / expectedPerCraft);
    if (crafts < min) min = crafts;
  }
  return min === Infinity ? 0 : min;
}

/**
 * Main greedy optimizer: produces a leveling plan to reach target level.
 *
 * Algorithm:
 * 1. Claim all first-time bonuses for eligible recipes (free XP)
 * 2. Among craftable recipes, pick highest XP/craft available
 * 3. If nothing craftable, pick best recipe by XP/craft (will appear in shopping list)
 * 4. Repeat until target level reached
 */
export function runOptimizer(input: OptimizerInput): OptimizerResult {
  const {
    skill,
    currentLevel,
    currentXp,
    xpNeededForNext,
    targetLevel,
    xpTable,
    recipes,
    recipeCompletions,
    getItemByCode,
  } = input;

  const totalXpNeeded = totalXpToTarget(
    currentLevel,
    currentXp,
    xpNeededForNext,
    targetLevel,
    xpTable
  );

  if (totalXpNeeded <= 0) {
    return {
      skill,
      fromLevel: currentLevel,
      toLevel: targetLevel,
      totalXpNeeded: 0,
      totalXpGained: 0,
      steps: [],
      totalIngredientCost: 0,
      missingIngredients: [],
    };
  }

  // Mutable simulation state
  let simLevel = currentLevel;
  let simXp = currentXp;
  let simInventory = new Map(input.inventory);
  let xpGained = 0;

  const steps: LevelingStep[] = [];
  // Track missing ingredients across all steps
  const missingMap = new Map<
    number,
    { name: string; needed: number; inInventory: number; steps: string[] }
  >();

  // First pass: claim all first-time bonuses
  const eligibleForFirstTime = recipes.filter(
    (r) =>
      r.SkillLevelReq <= simLevel &&
      (r.RewardSkillXpFirstTime ?? 0) > 0 &&
      recipeCompletions[r.InternalName] === 0
  );

  for (const recipe of eligibleForFirstTime) {
    if (simLevel >= targetLevel) break;
    const firstTimeXp = recipe.RewardSkillXpFirstTime ?? 0;
    const craftableCount = countCraftableFromMap(recipe, simInventory);

    const step = buildStep(
      recipe,
      1,
      firstTimeXp,
      firstTimeXp,
      true,
      simInventory,
      getItemByCode,
      craftableCount >= 1
    );
    steps.push(step);

    // Track missing ingredients
    trackMissing(step, missingMap, simInventory);

    if (craftableCount >= 1) {
      simInventory = deductIngredients(recipe, 1, simInventory);
    }

    const result = addXp(simLevel, simXp, firstTimeXp, xpTable);
    simLevel = result.level;
    simXp = result.xp;
    xpGained += firstTimeXp;
  }

  // Main leveling loop
  const maxIterations = 10000;
  let iterations = 0;

  while (simLevel < targetLevel && iterations < maxIterations) {
    iterations++;

    // Get eligible recipes at current level
    const eligible = recipes
      .filter((r) => r.SkillLevelReq <= simLevel)
      .map((r) => {
        const effXp = computeEffectiveXp(r, simLevel);
        const craftable = countCraftableFromMap(r, simInventory);
        return { recipe: r, effXp, craftable };
      })
      .filter((r) => r.effXp > 0);

    if (eligible.length === 0) break;

    // Sort: craftable first, then by XP desc
    eligible.sort((a, b) => {
      if (a.craftable > 0 && b.craftable === 0) return -1;
      if (b.craftable > 0 && a.craftable === 0) return 1;
      return b.effXp - a.effXp;
    });

    const best = eligible[0];
    const { recipe, effXp } = best;

    // How many XP do we still need?
    const xpStillNeeded = totalXpToTarget(
      simLevel,
      simXp,
      xpTable.XpAmounts[simLevel] ?? 0,
      targetLevel,
      xpTable
    );

    // How many crafts to get to next level or finish?
    const craftsNeeded = Math.max(1, Math.ceil(xpStillNeeded / effXp));
    const craftable = countCraftableFromMap(recipe, simInventory);
    const craftCount = craftable > 0 ? Math.min(craftable, craftsNeeded) : craftsNeeded;

    const step = buildStep(
      recipe,
      craftCount,
      effXp,
      0,
      false,
      simInventory,
      getItemByCode,
      craftable > 0
    );
    steps.push(step);

    trackMissing(step, missingMap, simInventory);

    if (craftable > 0) {
      simInventory = deductIngredients(recipe, craftCount, simInventory);
    }

    const totalStepXp = effXp * craftCount;
    const result = addXp(simLevel, simXp, totalStepXp, xpTable);
    simLevel = result.level;
    simXp = result.xp;
    xpGained += totalStepXp;
  }

  // Consolidate consecutive identical steps
  const consolidated = consolidateSteps(steps);

  // Build missing ingredients summary
  const missingIngredients: MissingIngredient[] = [];
  let totalCost = 0;
  for (const [itemCode, data] of missingMap) {
    const item = getItemByCode(itemCode);
    const cost = (item?.Value ?? 0) * 2 * data.needed;
    totalCost += cost;
    missingIngredients.push({
      itemCode,
      name: data.name,
      totalNeeded: data.needed + data.inInventory,
      inInventory: data.inInventory,
      toBuy: data.needed,
      estimatedCost: cost,
      usedInSteps: [...new Set(data.steps)],
    });
  }

  return {
    skill,
    fromLevel: currentLevel,
    toLevel: Math.min(simLevel, targetLevel),
    totalXpNeeded,
    totalXpGained: xpGained,
    steps: consolidated,
    totalIngredientCost: totalCost,
    missingIngredients: missingIngredients.sort(
      (a, b) => b.estimatedCost - a.estimatedCost
    ),
  };
}

function buildStep(
  recipe: Recipe,
  craftCount: number,
  xpPerCraft: number,
  firstTimeXp: number,
  isFirstTime: boolean,
  inventory: Map<number, number>,
  getItemByCode: (code: number) => Item | undefined,
  canCraftFromInventory: boolean
): LevelingStep {
  const ingredients = recipe.Ingredients.map((ing) => {
    const item = getItemByCode(ing.ItemCode);
    const have = inventory.get(ing.ItemCode) ?? 0;
    const expectedNeeded = expectedConsumption(
      ing.StackSize,
      ing.ChanceToConsume,
      craftCount
    );
    return {
      itemCode: ing.ItemCode,
      name: item?.Name ?? `Item #${ing.ItemCode}`,
      needed: ing.StackSize,
      have,
      sufficient: have >= ing.StackSize,
      expectedNeeded,
    };
  });

  const resultItems = recipe.ResultItems.map((r) => {
    const item = getItemByCode(r.ItemCode);
    return {
      itemCode: r.ItemCode,
      name: item?.Name ?? `Item #${r.ItemCode}`,
      quantity: Math.floor(r.StackSize * (r.PercentChance ?? 1.0)),
    };
  });

  const ingredientCost = canCraftFromInventory
    ? 0
    : recipe.Ingredients.reduce((sum, ing) => {
        const have = inventory.get(ing.ItemCode) ?? 0;
        const needed = expectedConsumption(
          ing.StackSize,
          ing.ChanceToConsume,
          craftCount
        );
        const missing = Math.max(0, needed - have);
        const item = getItemByCode(ing.ItemCode);
        return sum + missing * (item?.Value ?? 0) * 2;
      }, 0);

  return {
    recipeId: recipe.id,
    recipeName: recipe.Name,
    recipeInternalName: recipe.InternalName,
    skillLevelReq: recipe.SkillLevelReq,
    craftCount,
    xpPerCraft,
    totalXp: isFirstTime ? firstTimeXp : xpPerCraft * craftCount,
    isFirstTime,
    firstTimeXp,
    ingredients,
    resultItems,
    canCraftFromInventory,
    ingredientCost,
  };
}

function trackMissing(
  step: LevelingStep,
  missingMap: Map<number, { name: string; needed: number; inInventory: number; steps: string[] }>,
  inventory: Map<number, number>
) {
  for (const ing of step.ingredients) {
    const have = inventory.get(ing.itemCode) ?? 0;
    const missing = Math.max(0, ing.expectedNeeded - have);
    if (missing > 0) {
      const existing = missingMap.get(ing.itemCode);
      if (existing) {
        existing.needed += missing;
        existing.steps.push(step.recipeName);
      } else {
        missingMap.set(ing.itemCode, {
          name: ing.name,
          needed: missing,
          inInventory: have,
          steps: [step.recipeName],
        });
      }
    }
  }
}

function consolidateSteps(steps: LevelingStep[]): LevelingStep[] {
  const result: LevelingStep[] = [];
  for (const step of steps) {
    const last = result[result.length - 1];
    if (
      last &&
      last.recipeId === step.recipeId &&
      !step.isFirstTime &&
      !last.isFirstTime
    ) {
      // Merge into previous step
      last.craftCount += step.craftCount;
      last.totalXp += step.totalXp;
      last.ingredientCost += step.ingredientCost;
      // Update ingredient counts
      for (let i = 0; i < last.ingredients.length; i++) {
        last.ingredients[i].expectedNeeded += step.ingredients[i]?.expectedNeeded ?? 0;
        last.ingredients[i].have = step.ingredients[i]?.have ?? last.ingredients[i].have;
        last.ingredients[i].sufficient = last.ingredients[i].have >= last.ingredients[i].needed;
      }
    } else {
      result.push({ ...step });
    }
  }
  return result;
}

/**
 * Calculate gold efficiency stats for a single recipe at a given level.
 */
export function recipeGoldEfficiency(
  recipe: Recipe,
  currentLevel: number,
  getItemByCode: (code: number) => Item | undefined,
  getItemQuantity: (typeId: number) => number
): {
  effectiveXp: number;
  ingredientCost: number;
  goldPerXp: number;
  resultValue: number;
  profit: number;
} {
  const effectiveXp = computeEffectiveXp(recipe, currentLevel);
  const ingredientCost = estimateIngredientCost(
    recipe,
    1,
    getItemByCode,
    getItemQuantity
  );
  const resultValue = recipe.ResultItems.reduce((sum, r) => {
    const item = getItemByCode(r.ItemCode);
    const chance = r.PercentChance ?? 1.0;
    return sum + (item?.Value ?? 0) * r.StackSize * chance;
  }, 0);

  return {
    effectiveXp,
    ingredientCost,
    goldPerXp: effectiveXp > 0 ? ingredientCost / effectiveXp : Infinity,
    resultValue,
    profit: resultValue - ingredientCost,
  };
}
