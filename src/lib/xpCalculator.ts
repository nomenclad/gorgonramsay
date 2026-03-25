/**
 * XP calculation utilities for Project Gorgon's crafting system.
 *
 * Key game mechanic — XP dropoff: each recipe has a base XP reward, but once
 * the player's skill level exceeds the recipe's `RewardSkillXpDropOffLevel`,
 * the XP starts decreasing. For every `DropOffRate` levels above the threshold,
 * the reward is reduced by `DropOffPct` (e.g., 10% per 2 levels). Eventually
 * the recipe yields 0 XP and is no longer worth crafting for skill gains.
 *
 * Formula: effectiveXp = floor(baseXp * max(0, 1 - dropoffPct * floor((level - dropoffLevel) / dropoffRate)))
 *
 * This module also handles:
 *  - First-time crafting bonuses (one-time XP boost, not subject to dropoff)
 *  - Total XP needed between two levels (summing the XP table)
 *  - Expected ingredient consumption with probabilistic ChanceToConsume
 *  - Gold-per-XP cost ratio
 */
import type { Recipe, XpTable } from "../types";

/**
 * Calculate effective XP for a recipe at a given skill level,
 * accounting for dropoff mechanics.
 */
export function computeEffectiveXp(
  recipe: Recipe,
  currentLevel: number
): number {
  const base = recipe.RewardSkillXp;
  if (base <= 0) return 0;

  const dropoffLevel = recipe.RewardSkillXpDropOffLevel;
  const dropoffPct = recipe.RewardSkillXpDropOffPct;
  const dropoffRate = recipe.RewardSkillXpDropOffRate;

  if (!dropoffLevel || !dropoffPct || !dropoffRate) return base;
  if (currentLevel <= dropoffLevel) return base;

  // Each "dropoffRate" levels above the threshold applies another "dropoffPct" penalty.
  // e.g., dropoffLevel=30, dropoffRate=2, dropoffPct=0.1 at level 36 → 3 reductions → 70% XP
  const levelsAbove = currentLevel - dropoffLevel;
  const reductions = Math.floor(levelsAbove / dropoffRate);
  const multiplier = Math.max(0, 1 - dropoffPct * reductions);

  return Math.floor(base * multiplier);
}

/**
 * Calculate first-time bonus XP for a recipe.
 * Returns 0 if no first-time bonus or already completed.
 */
export function getFirstTimeBonus(recipe: Recipe): number {
  return recipe.RewardSkillXpFirstTime ?? 0;
}

/**
 * Calculate total XP needed to go from current level/xp to target level.
 */
export function xpToTargetLevel(
  currentLevel: number,
  currentXp: number,
  xpNeededForNext: number,
  targetLevel: number,
  xpTable: XpTable
): number {
  if (currentLevel >= targetLevel) return 0;

  // XP remaining in current level
  let total = xpNeededForNext - currentXp;

  // XP for each subsequent level
  for (let level = currentLevel + 1; level < targetLevel; level++) {
    const idx = level; // XpAmounts[0] = level 1, XpAmounts[level-1] = level
    if (idx < xpTable.XpAmounts.length) {
      total += xpTable.XpAmounts[idx];
    }
  }

  return total;
}

/**
 * Calculate gold cost per XP for a recipe, given ingredient costs.
 */
export function goldPerXp(
  totalIngredientCost: number,
  effectiveXp: number
): number {
  if (effectiveXp <= 0) return Infinity;
  return totalIngredientCost / effectiveXp;
}

/**
 * Calculate expected ingredient consumption accounting for ChanceToConsume.
 * Default ChanceToConsume is 1.0 (always consumed).
 */
export function expectedConsumption(
  stackSize: number,
  chanceToConsume: number | undefined,
  craftCount: number
): number {
  const chance = chanceToConsume ?? 1.0;
  return Math.ceil(stackSize * chance * craftCount);
}

/**
 * Determine the XP table for a skill based on skills.json data.
 * Returns the table name/id that maps to xptables.json.
 */
export function getXpTableForSkill(
  skillXpTableRef: string,
  xpTables: XpTable[]
): XpTable | undefined {
  return xpTables.find((t) => t.InternalName === skillXpTableRef || t.id === skillXpTableRef);
}
