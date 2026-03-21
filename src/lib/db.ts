import Dexie, { type Table } from "dexie";

export interface CachedRecipe {
  recipeId: string;
  data: string; // JSON stringified Recipe
}

export interface CachedItem {
  itemId: string;
  data: string;
}

export interface CachedXpTable {
  tableId: string;
  data: string;
}

export interface CacheMetadata {
  key: string;
  value: string;
}

export class PgDatabase extends Dexie {
  recipes!: Table<CachedRecipe>;
  items!: Table<CachedItem>;
  xpTables!: Table<CachedXpTable>;
  metadata!: Table<CacheMetadata>;

  constructor() {
    super("pgefficiency");
    this.version(1).stores({
      recipes: "recipeId",
      items: "itemId",
      xpTables: "tableId",
      metadata: "key",
    });
  }
}

export const db = new PgDatabase();

export async function getCacheVersion(): Promise<string | null> {
  const meta = await db.metadata.get("cdnVersion");
  return meta?.value ?? null;
}

export async function setCacheVersion(version: string): Promise<void> {
  await db.metadata.put({ key: "cdnVersion", value: version });
}

export async function clearCache(): Promise<void> {
  await Promise.all([
    db.recipes.clear(),
    db.items.clear(),
    db.xpTables.clear(),
    db.metadata.clear(),
  ]);
}
