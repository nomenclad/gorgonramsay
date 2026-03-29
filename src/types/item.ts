/**
 * Types for game items from the CDN's items.json.
 *
 * Each entry represents a unique item type (weapon, food, material, etc.).
 * If the CDN adds new fields, add them here as optional properties and
 * update itemParser.ts accordingly.
 */
export interface Item {
  id: string;
  Name: string;
  InternalName: string;
  Description?: string;
  /** Numeric icon identifier used by the game client for display. */
  IconId?: number;
  /** Tags for categorization (e.g. "Food", "Equipment", "Knife"). Used by recipe keyword filters. */
  Keywords: string[];
  MaxStackSize: number;
  Value: number;
  NumUses?: number;
  /** e.g. "Level 20 Meal" — only present on food items. Parsed by gourmandParser to extract food level and type. */
  FoodDesc?: string;
  /** Plain-text effect descriptions — present on food and consumables. Displayed to the user as buff/debuff info. */
  EffectDescs?: string[];
  /** Skill requirements to use/eat this item (e.g. { Gourmand: 25 } means Gourmand level 25 to eat). */
  SkillReqs?: Record<string, number>;
}
