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
  | "Other";

export interface SourceEntry {
  type: SourceType;
  npc?: string;
  recipeId?: number;
  itemTypeId?: number;
  questId?: number;
  hangOutId?: number;
}

export interface ItemSources {
  itemId: string; // "item_123"
  entries: SourceEntry[];
}

export type SourcesData = Record<string, { entries: SourceEntry[] }>;
