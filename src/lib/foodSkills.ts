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

/** Skills that should be merged under "Fishing" in the sidebar */
export const MERGED_FISHING = new Set(["Fishing", "Angling"]);

/** Check if a recipe's skill matches the selected sidebar skill (handles Fishing/Angling merge) */
export function matchesSelectedSkill(recipeSkill: string, selectedSkill: string): boolean {
  if (!selectedSkill) return true;
  if (selectedSkill === "Fishing") return MERGED_FISHING.has(recipeSkill);
  return recipeSkill === selectedSkill;
}
