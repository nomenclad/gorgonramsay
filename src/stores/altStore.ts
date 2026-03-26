/**
 * Multi-character (alt) state management.
 *
 * Holds all loaded characters and their inventories. The "active" character
 * is synced to the existing characterStore/inventoryStore so all existing
 * UI consumers work without changes. The "crafting" character determines
 * whose inventory/skills are used for planner calculations.
 *
 * Persistence: each character's data is stored in IndexedDB with keys like
 * "character:Name_Server" and "inventory:Name_Server". The active character
 * ID is stored in localStorage.
 */
import { create } from "zustand";
import type { CharacterSheet } from "../types/character";
import type { InventoryItem, AggregatedItem } from "../types/inventory";
import { aggregateInventory } from "../lib/parsers/inventoryParser";
import { useCharacterStore } from "./characterStore";
import { useInventoryStore } from "./inventoryStore";

export interface AltCharacter {
  /** Unique key: "CharName_Server" */
  id: string;
  name: string;
  server: string;
  character: CharacterSheet;
  inventory: InventoryItem[];
  aggregated: AggregatedItem[];
  inventoryTimestamp: string | null;
  eatenFoods: Map<string, number> | null;
}

/** Where an alt has an item — used for cross-character gathering. */
export interface AltItemLocation {
  charId: string;
  charName: string;
  vault: string;
  quantity: number;
}

/** Build a unique ID for a character. */
export function charId(name: string, server: string): string {
  return `${name}_${server}`;
}

interface AltState {
  alts: Map<string, AltCharacter>;
  activeCharId: string | null;

  /** Add or update a character (from import or hydration). */
  loadCharacter: (
    sheet: CharacterSheet,
    inventory?: InventoryItem[],
    inventoryTimestamp?: string | null,
    eatenFoods?: Map<string, number> | null,
  ) => string; // returns charId

  /** Update only a character's inventory. */
  loadInventory: (id: string, inventory: InventoryItem[], timestamp: string) => void;

  /** Update only a character's eaten foods. */
  loadEatenFoods: (id: string, foods: Map<string, number>) => void;

  /** Switch the active (displayed) character and sync to legacy stores. */
  setActiveCharacter: (id: string) => void;

  /** Remove a character. */
  removeCharacter: (id: string) => void;

  /** Get item locations across ALL alts except the given character. */
  getAltItemLocations: (typeId: number, excludeCharId: string) => AltItemLocation[];

  /** Get all character IDs. */
  getCharacterIds: () => string[];
}

export const useAltStore = create<AltState>((set, get) => ({
  alts: new Map(),
  activeCharId: null,

  loadCharacter: (sheet, inventory = [], inventoryTimestamp = null, eatenFoods = null) => {
    const id = charId(sheet.Character, sheet.ServerName);
    const alt: AltCharacter = {
      id,
      name: sheet.Character,
      server: sheet.ServerName,
      character: sheet,
      inventory,
      aggregated: aggregateInventory(inventory),
      inventoryTimestamp,
      eatenFoods,
    };

    set((s) => {
      const next = new Map(s.alts);
      next.set(id, alt);
      return { alts: next };
    });

    return id;
  },

  loadInventory: (id, inventory, timestamp) => {
    set((s) => {
      const existing = s.alts.get(id);
      if (!existing) return s;
      const next = new Map(s.alts);
      next.set(id, {
        ...existing,
        inventory,
        aggregated: aggregateInventory(inventory),
        inventoryTimestamp: timestamp,
      });
      return { alts: next };
    });

    // If this is the active character, sync to legacy store
    const state = get();
    if (state.activeCharId === id) {
      const updated = state.alts.get(id);
      if (updated) {
        useInventoryStore.getState().setInventory(inventory, timestamp, updated.name);
      }
    }
  },

  loadEatenFoods: (id, foods) => {
    set((s) => {
      const existing = s.alts.get(id);
      if (!existing) return s;
      const next = new Map(s.alts);
      next.set(id, { ...existing, eatenFoods: foods });
      return { alts: next };
    });

    // Sync to legacy store if active
    if (get().activeCharId === id) {
      useCharacterStore.getState().setEatenFoods(foods);
    }
  },

  setActiveCharacter: (id) => {
    const alt = get().alts.get(id);
    if (!alt) return;

    set({ activeCharId: id });
    localStorage.setItem("activeCharId", id);

    // Sync to legacy stores so all existing UI updates reactively
    useCharacterStore.getState().setCharacter(alt.character);
    useCharacterStore.getState().setEatenFoods(alt.eatenFoods ?? new Map());
    if (alt.inventory.length > 0) {
      useInventoryStore.getState().setInventory(
        alt.inventory,
        alt.inventoryTimestamp ?? "",
        alt.name,
      );
    }
  },

  removeCharacter: (id) => {
    set((s) => {
      const next = new Map(s.alts);
      next.delete(id);
      const newActive = s.activeCharId === id
        ? (next.keys().next().value ?? null)
        : s.activeCharId;
      return { alts: next, activeCharId: newActive };
    });
  },

  getAltItemLocations: (typeId, excludeCharId) => {
    const results: AltItemLocation[] = [];
    for (const [id, alt] of get().alts) {
      if (id === excludeCharId) continue;
      const agg = alt.aggregated.find((a) => a.typeId === typeId);
      if (!agg) continue;
      for (const loc of agg.locations) {
        // Skip account-shared storage — main character already sees these
        if (loc.vault.startsWith("*AccountStorage")) continue;
        if (loc.vault === "__on_person__" || loc.vault === "Saddlebag") {
          results.push({ charId: id, charName: alt.name, vault: loc.vault, quantity: loc.quantity });
        } else {
          results.push({ charId: id, charName: alt.name, vault: loc.vault, quantity: loc.quantity });
        }
      }
    }
    return results;
  },

  getCharacterIds: () => Array.from(get().alts.keys()),
}));
