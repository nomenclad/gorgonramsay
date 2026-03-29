/**
 * Parses items.json from the CDN.
 *
 * Builds lookup indexes by ID, ItemCode, and Keywords for efficient
 * cross-referencing with recipes and inventory.
 *
 * To handle game data format changes:
 *   - Add new optional fields to RawItemData below and Item in types/item.ts.
 *   - The parser spreads raw data onto Item, so new fields flow through automatically.
 */
import type { Item } from "../../types/item";

interface RawItemData {
  Name: string;
  InternalName: string;
  Description?: string;
  IconId?: number;
  Keywords?: string[];
  MaxStackSize: number;
  Value: number;
  NumUses?: number;
  FoodDesc?: string;
  EffectDescs?: string[];
  SkillReqs?: Record<string, number>;
}

export function parseItems(json: string): Item[] {
  const raw: Record<string, RawItemData> = JSON.parse(json);
  return Object.entries(raw)
    .filter(([, data]) => data && typeof data === "object" && data.Name)
    .map(([key, data]) => ({
      id: key,
      ...data,
      Keywords: data.Keywords ?? [],
    }));
}

export interface ItemIndexes {
  byId: Map<string, Item>;
  byItemCode: Map<number, Item>;
  byKeyword: Map<string, Item[]>;
}

export function buildItemIndexes(items: Item[]): ItemIndexes {
  const byId = new Map<string, Item>();
  const byItemCode = new Map<number, Item>();
  const byKeyword = new Map<string, Item[]>();

  for (const item of items) {
    // Index by string id (e.g. "item_1")
    byId.set(item.id, item);

    // Extract numeric code from id (e.g. "item_1" -> 1)
    const match = item.id.match(/(\d+)$/);
    if (match) {
      byItemCode.set(parseInt(match[1], 10), item);
    }

    // Index by keyword
    for (const keyword of item.Keywords) {
      const kwList = byKeyword.get(keyword);
      if (kwList) {
        kwList.push(item);
      } else {
        byKeyword.set(keyword, [item]);
      }
    }
  }

  return { byId, byItemCode, byKeyword };
}
