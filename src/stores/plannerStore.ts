/**
 * @module plannerStore
 *
 * Manages the cooking planner queue: starred recipes, their desired
 * quantities, and zone selections for gardening/cooking NPCs.
 *
 * **Data origin:** User interactions — starring recipes from the Recipe
 * Browser or Gourmand Tracker, adjusting quantities, selecting zones.
 *
 * **Persistence:** Uses manual localStorage persistence (via the
 * `persist()` helper below) rather than Zustand middleware because only
 * a subset of state (`entries`, `gardeningZone`, `cookingZone`) needs
 * to survive page reloads. Every mutating action calls `persist()`
 * after updating state.
 *
 * **How to extend:** To persist additional fields, add them to both the
 * `persist()` function's `JSON.stringify` call and the `loadPersisted()`
 * return type. To add new actions, follow the existing pattern: update
 * state via `set()`, then call `persist()` on the result.
 */
import { create } from "zustand";

export interface PlannerEntry {
  recipeId: string;
  recipeInternalName: string;
  quantity: number;
}

interface PlannerState {
  entries: Record<string, PlannerEntry>; // keyed by recipeId

  gardeningZone: string;
  cookingZone: string;
  /** Character ID of who will do the crafting. Empty = active character. */
  craftingCharId: string;

  // Actions
  starRecipe: (recipeId: string, internalName: string, qty?: number) => void;
  unstarRecipe: (recipeId: string) => void;
  setQuantity: (recipeId: string, qty: number) => void;
  toggleFromGourmand: (recipeId: string, internalName: string) => void;
  clearAll: () => void;
  setGardeningZone: (zone: string) => void;
  setCookingZone: (zone: string) => void;
  setCraftingCharId: (id: string) => void;
}

const STORAGE_KEY = "plannerStore";

function loadPersisted(): Partial<Pick<PlannerState, "entries" | "gardeningZone" | "cookingZone" | "craftingCharId">> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        entries: parsed.entries ?? {},
        gardeningZone: parsed.gardeningZone ?? "",
        cookingZone: parsed.cookingZone ?? "",
        craftingCharId: parsed.craftingCharId ?? "",
      };
    }
  } catch (e) {
    console.warn("Failed to load planner state from localStorage:", e);
  }
  return {};
}

function persist(state: PlannerState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        entries: state.entries,
        gardeningZone: state.gardeningZone,
        cookingZone: state.cookingZone,
        craftingCharId: state.craftingCharId,
      })
    );
  } catch (e) {
    console.warn("Failed to persist planner state to localStorage:", e);
  }
}

export const usePlannerStore = create<PlannerState>((set, get) => {
  const persisted = loadPersisted();

  return {
    entries: persisted.entries ?? {},
    gardeningZone: persisted.gardeningZone ?? "",
    cookingZone: persisted.cookingZone ?? "",
    craftingCharId: persisted.craftingCharId ?? "",

    starRecipe: (recipeId, internalName, qty = 1) => {
      set((s) => {
        const next = {
          ...s,
          entries: {
            ...s.entries,
            [recipeId]: { recipeId, recipeInternalName: internalName, quantity: Math.max(1, qty) },
          },
        };
        persist(next);
        return next;
      });
    },

    unstarRecipe: (recipeId) => {
      set((s) => {
        const { [recipeId]: _, ...rest } = s.entries;
        const next = { ...s, entries: rest };
        persist(next);
        return next;
      });
    },

    setQuantity: (recipeId, qty) => {
      set((s) => {
        const entry = s.entries[recipeId];
        if (!entry) return s;
        const next = {
          ...s,
          entries: { ...s.entries, [recipeId]: { ...entry, quantity: Math.max(1, qty) } },
        };
        persist(next);
        return next;
      });
    },

    toggleFromGourmand: (recipeId, internalName) => {
      const s = get();
      if (s.entries[recipeId]) {
        s.unstarRecipe(recipeId);
      } else {
        s.starRecipe(recipeId, internalName, 1);
      }
    },

    clearAll: () => {
      set((s) => {
        const next = { ...s, entries: {} };
        persist(next);
        return next;
      });
    },

    setGardeningZone: (zone) => {
      set((s) => {
        const next = { ...s, gardeningZone: zone };
        persist(next);
        return next;
      });
    },

    setCookingZone: (zone) => {
      set((s) => {
        const next = { ...s, cookingZone: zone };
        persist(next);
        return next;
      });
    },

    setCraftingCharId: (id) => {
      set((s) => {
        const next = { ...s, craftingCharId: id };
        persist(next);
        return next;
      });
    },
  };
});
