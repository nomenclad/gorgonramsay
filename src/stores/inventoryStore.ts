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
