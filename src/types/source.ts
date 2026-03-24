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

export interface SourceEntry {
  type: SourceType;
  npc?: string;
  recipeId?: number;
  itemTypeId?: number;
  questId?: number;
  hangOutId?: number;
  skill?: string;
}

export interface ItemSources {
  itemId: string; // "item_123"
  entries: SourceEntry[];
}

export type SourcesData = Record<string, { entries: SourceEntry[] }>;
