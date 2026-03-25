/**
 * Food skill definitions for Project Gorgon.
 *
 * This module defines which game skills are food-related, which are craftable
 * (vs. gathering), and how skills are grouped in the UI sidebar.
 *
 * The app uses these sets to:
 *  - Filter recipes on the Recipe Tracker and Gold Efficiency pages (FOOD_SKILLS)
 *  - Decide which intermediate crafting steps to auto-resolve (CRAFT_SKILLS)
 *  - Merge Fishing + Angling under a single sidebar entry (MERGED_FISHING)
 *
 * How to change:
 *  - When a new food-related skill is added to Project Gorgon, add its InternalName
 *    (CamelCase, as it appears in the CDN data) to FOOD_SKILLS.
 *  - If the new skill is a crafting skill (not gathering), also add it to CRAFT_SKILLS.
 *  - Gathering skills (Butchering, Fishing, Angling) are intentionally excluded from
 *    CRAFT_SKILLS because their outputs are raw materials, not intermediate crafts.
 */

/**
 * Skills considered food-related in Project Gorgon.
 * Used to filter the Recipe Tracker and Gold Efficiency pages.
 */
export const FOOD_SKILLS = new Set([
  "Cooking",
  "Cheesemaking",
  "Gourmand",
  "Gardening",
  "Fishing",
  "Angling",
  "Butchering",
  "Mycology",
  "SushiPreparation",
  "IceConjuration",
]);

/** Split a CamelCase skill ID into a human-readable label, e.g. "SushiPreparation" → "Sushi Preparation" */
export function formatSkillName(id: string): string {
  return id.replace(/([A-Z])/g, " $1").trim();
}

/**
 * Skills where the planner should auto-resolve intermediate crafting steps.
 * Gathering skills (Butchering, Fishing, Angling) are excluded because their
 * outputs (Salt, meat, fish) are better treated as raw materials to purchase
 * or farm rather than intermediate crafts to queue.
 */
export const CRAFT_SKILLS = new Set([
  "Cooking",
  "Cheesemaking",
  "Gardening",
  "Mycology",
  "SushiPreparation",
  "IceConjuration",
]);

/** Skills that should be merged under "Fishing" in the sidebar */
export const MERGED_FISHING = new Set(["Fishing", "Angling"]);

/** Check if a recipe's skill matches the selected sidebar skill (handles Fishing/Angling merge) */
export function matchesSelectedSkill(recipeSkill: string, selectedSkill: string): boolean {
  if (!selectedSkill) return true;
  if (selectedSkill === "Fishing") return MERGED_FISHING.has(recipeSkill);
  return recipeSkill === selectedSkill;
}
