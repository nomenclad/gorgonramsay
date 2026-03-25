/**
 * Types for item/recipe acquisition source data from the CDN's
 * sources_items.json and sources_recipes.json.
 *
 * Each source entry describes one way to obtain an item or learn a recipe
 * (e.g. buy from a vendor, loot from a monster, complete a quest).
 */

/**
 * How an item or recipe can be acquired. Common types:
 * - "Vendor"/"Barter" — purchasable from an NPC
 * - "Training" — learned from a skill trainer
 * - "Monster" — dropped by a creature
 * - "Quest"/"HangOut" — quest or hang-out reward
 * - "Recipe" — crafted via another recipe
 * - "Angling"/"CorpseButchering"/"CorpseSkinning" — gathered via trade skills
 */
export type SourceType =
  | "Vendor"
  | "Barter"
  | "Recipe"
  | "Monster"
  | "Quest"
  | "HangOut"
  | "Item"
  | "Angling"
  | "CorpseButchering"
  | "CorpseSkinning"
  | "Effect"
  | "NpcGift"
  | "TreasureMap"
  | "ResourceInteractor"
  | "CraftedInteractor"
  | "Training"
  | "Skill"
  | "Other";

/** A single acquisition source for an item or recipe. */
export interface SourceEntry {
  type: SourceType;
  /** NPC who sells/teaches this (for Vendor, Training, Barter types). */
  npc?: string;
  /** Recipe that produces this item (for Recipe type). */
  recipeId?: number;
  /** Item that grants this (for Item type, e.g. scrolls). */
  itemTypeId?: number;
  /** Quest that rewards this (for Quest type). */
  questId?: number;
  /** Hang-out that rewards this (for HangOut type). */
  hangOutId?: number;
  /** Skill associated with this source (for Skill, Training types). */
  skill?: string;
}

/** All known sources for a single item. */
export interface ItemSources {
  /** Item identifier string, e.g. "item_123". */
  itemId: string;
  entries: SourceEntry[];
}

/** Top-level sources data keyed by item/recipe identifier string. */
export type SourcesData = Record<string, { entries: SourceEntry[] }>;
