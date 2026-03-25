/**
 * Types for crafting recipes from the CDN's recipes.json.
 *
 * Each recipe defines ingredients, results, XP rewards, and skill requirements.
 * If the CDN schema changes, add new optional fields here and update recipeParser.ts.
 */

/** A required ingredient for a recipe. */
export interface Ingredient {
  /** Numeric item identifier — cross-reference with items.json keys (e.g. "item_1234"). */
  ItemCode: number;
  /** How many of this item are consumed per craft. */
  StackSize: number;
  /** Probability (0–1) the ingredient is consumed; if omitted, always consumed. */
  ChanceToConsume?: number;
}

/** An item produced by completing a recipe. */
export interface ResultItem {
  /** Numeric item identifier — cross-reference with items.json. */
  ItemCode: number;
  /** How many of this item are produced per craft. */
  StackSize: number;
  /** Probability (0–100) this result is produced; if omitted, always produced. */
  PercentChance?: number;
}

export interface Recipe {
  id: string;
  Name: string;
  InternalName: string;
  Description?: string;
  Skill: string;
  SkillLevelReq: number;
  Ingredients: Ingredient[];
  ResultItems: ResultItem[];
  RewardSkill?: string;
  RewardSkillXp: number;
  /** Bonus XP awarded only the first time this recipe is crafted. */
  RewardSkillXpFirstTime?: number;
  /** Skill level at which XP from this recipe starts declining. */
  RewardSkillXpDropOffLevel?: number;
  /** Percentage of XP retained once drop-off kicks in (e.g. 50 = half XP). */
  RewardSkillXpDropOffPct?: number;
  /** How quickly XP declines per level beyond the drop-off level. */
  RewardSkillXpDropOffRate?: number;
  IconId?: number;
  Keywords?: string[];
  SortSkill?: string;
  /** Crafting time in seconds (shown to the player as a progress bar). */
  UsageDelay?: number;
  /** Message displayed during the crafting delay (e.g. "Cooking..."). */
  UsageDelayMessage?: string;
  /** Item keyword required for this recipe to appear in an item's right-click context menu. */
  ItemMenuKeywordReq?: string;
  /** Label shown in the item's context menu when this recipe is available. */
  ItemMenuLabel?: string;
  /** If true, having the keyword alone is enough to activate; no additional skill check needed. */
  IsItemMenuKeywordReqSufficient?: boolean;
}
