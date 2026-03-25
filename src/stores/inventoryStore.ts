/**
 * @module inventoryStore
 *
 * Stores the user-imported inventory data and provides aggregated views
 * of item quantities across all storage vaults and the player's backpack.
 *
 * **Data origin:** The player runs `/exportinventory` in Project Gorgon,
 * producing a JSON file. The file is imported (drag-and-drop or folder
 * watch), parsed by `inventoryParser.ts`, and pushed here via
 * `setInventory`. On set, items are automatically aggregated by typeId
 * so callers can look up total quantities without re-scanning.
 *
 * **Persistence:** Raw JSON is saved in the IndexedDB `userFiles` table
 * (key "inventory"). On startup, `hydrate.ts` restores and re-parses it.
 *
 * **How to extend:** Add new derived getters (e.g. `getItemsByVault`) to
 * the store interface. The aggregation logic lives in `inventoryParser.ts`.
 */
import { create } from "zustand";
import type { InventoryItem, AggregatedItem } from "../types";
import { aggregateInventory } from "../lib/parsers/inventoryParser";

interface InventoryState {
  items: InventoryItem[];
  aggregated: AggregatedItem[];
  importTimestamp: string | null;
  characterName: string | null;

  setInventory: (
    items: InventoryItem[],
    timestamp: string,
    character: string
  ) => void;
  getItemQuantity: (typeId: number) => number;
  getItemLocations: (typeId: number) => { vault: string; quantity: number }[];
  getVaultNames: () => string[];
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  items: [],
  aggregated: [],
  importTimestamp: null,
  characterName: null,

  setInventory: (items, timestamp, character) =>
    set({
      items,
      aggregated: aggregateInventory(items),
      importTimestamp: timestamp,
      characterName: character,
    }),

  getItemQuantity: (typeId) => {
    const agg = get().aggregated.find((a) => a.typeId === typeId);
    return agg?.totalQuantity ?? 0;
  },

  getItemLocations: (typeId) => {
    const agg = get().aggregated.find((a) => a.typeId === typeId);
    return agg?.locations ?? [];
  },

  getVaultNames: () => {
    const vaults = new Set(
      get().items.map((i) => i.StorageVault).filter((v): v is string => !!v)
    );
    return Array.from(vaults).sort();
  },
}));
