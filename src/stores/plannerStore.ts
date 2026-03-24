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

  // Actions
  starRecipe: (recipeId: string, internalName: string, qty?: number) => void;
  unstarRecipe: (recipeId: string) => void;
  setQuantity: (recipeId: string, qty: number) => void;
  toggleFromGourmand: (recipeId: string, internalName: string) => void;
  clearAll: () => void;
  setGardeningZone: (zone: string) => void;
  setCookingZone: (zone: string) => void;
}

const STORAGE_KEY = "plannerStore";

function loadPersisted(): Partial<Pick<PlannerState, "entries" | "gardeningZone" | "cookingZone">> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        entries: parsed.entries ?? {},
        gardeningZone: parsed.gardeningZone ?? "",
        cookingZone: parsed.cookingZone ?? "",
      };
    }
  } catch {
    // ignore
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
      })
    );
  } catch {
    // ignore
  }
}

export const usePlannerStore = create<PlannerState>((set, get) => {
  const persisted = loadPersisted();

  return {
    entries: persisted.entries ?? {},
    gardeningZone: persisted.gardeningZone ?? "",
    cookingZone: persisted.cookingZone ?? "",

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
  };
});
