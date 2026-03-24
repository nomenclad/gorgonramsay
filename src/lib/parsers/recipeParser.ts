import type { Recipe } from "../../types/recipe";

interface RawRecipeData {
  Name: string;
  InternalName: string;
  Description?: string;
  Skill: string;
  SkillLevelReq: number;
  Ingredients: { ItemCode: number; StackSize: number; ChanceToConsume?: number }[];
  ResultItems: { ItemCode: number; StackSize: number; PercentChance?: number }[];
  RewardSkill?: string;
  RewardSkillXp: number;
  RewardSkillXpFirstTime?: number;
  RewardSkillXpDropOffLevel?: number;
  RewardSkillXpDropOffPct?: number;
  RewardSkillXpDropOffRate?: number;
  IconId?: number;
  Keywords?: string[];
  SortSkill?: string;
  UsageDelay?: number;
  UsageDelayMessage?: string;
  ItemMenuKeywordReq?: string;
  ItemMenuLabel?: string;
  IsItemMenuKeywordReqSufficient?: boolean;
}

export function parseRecipes(json: string): Recipe[] {
  const raw: Record<string, RawRecipeData> = JSON.parse(json);
  return Object.entries(raw)
    .filter(([, data]) => data && typeof data === "object" && data.Name)
    .map(([key, data]) => ({
      id: key,
      ...data,
      // Filter out any ingredients/results with missing ItemCodes (malformed entries)
      Ingredients: (data.Ingredients ?? []).filter(
        (ing) => ing.ItemCode != null && !isNaN(Number(ing.ItemCode))
      ),
      ResultItems: (data.ResultItems ?? []).filter(
        (res) => res.ItemCode != null && !isNaN(Number(res.ItemCode))
      ),
    }));
}

export interface RecipeIndexes {
  bySkill: Map<string, Recipe[]>;
  byInternalName: Map<string, Recipe>;
  byIngredient: Map<number, Recipe[]>;
  byResultItem: Map<number, Recipe[]>;
}

export function buildRecipeIndexes(recipes: Recipe[]): RecipeIndexes {
  const bySkill = new Map<string, Recipe[]>();
  const byInternalName = new Map<string, Recipe>();
  const byIngredient = new Map<number, Recipe[]>();
  const byResultItem = new Map<number, Recipe[]>();

  for (const recipe of recipes) {
    // Index by skill
    const skillList = bySkill.get(recipe.Skill);
    if (skillList) {
      skillList.push(recipe);
    } else {
      bySkill.set(recipe.Skill, [recipe]);
    }

    // Index by internal name
    byInternalName.set(recipe.InternalName, recipe);

    // Index by ingredient ItemCode
    for (const ingredient of recipe.Ingredients) {
      const ingList = byIngredient.get(ingredient.ItemCode);
      if (ingList) {
        ingList.push(recipe);
      } else {
        byIngredient.set(ingredient.ItemCode, [recipe]);
      }
    }

    // Index by result item ItemCode
    for (const result of recipe.ResultItems) {
      const resList = byResultItem.get(result.ItemCode);
      if (resList) {
        resList.push(recipe);
      } else {
        byResultItem.set(result.ItemCode, [recipe]);
      }
    }
  }

  return { bySkill, byInternalName, byIngredient, byResultItem };
}
