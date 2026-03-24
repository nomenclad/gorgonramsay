import { create } from "zustand";
import type { Recipe, Item, XpTable, SourcesData } from "../types";
import { loadSourcesData, loadNpcNames, loadRecipeSourcesData } from "../lib/sourceResolver";
import { loadVaultData, loadAreaData, formatVaultName } from "../lib/vaultResolver";

export interface RecipeIndexes {
  bySkill: Map<string, Recipe[]>;
  byInternalName: Map<string, Recipe>;
  byIngredient: Map<number, Recipe[]>;
  byResultItem: Map<number, Recipe[]>;
}

export interface ItemIndexes {
  byId: Map<string, Item>;
  byItemCode: Map<number, Item>;
  byKeyword: Map<string, Item[]>;
}

interface GameDataState {
  recipes: Recipe[];
  items: Item[];
  xpTables: XpTable[];
  recipeIndexes: RecipeIndexes | null;
  itemIndexes: ItemIndexes | null;
  sourcesLoaded: boolean;
  loaded: boolean;
  loading: boolean;
  itemUsesJson: string | null;
  cdnVersion: number | null;

  setRecipes: (recipes: Recipe[], indexes: RecipeIndexes) => void;
  setItems: (items: Item[], indexes: ItemIndexes) => void;
  setXpTables: (tables: XpTable[]) => void;
  setSources: (sources: SourcesData) => void;
  setRecipeSources: (sources: SourcesData) => void;
  setNpcNames: (npcMap: Map<string, { name: string; area?: string }>) => void;
  setLoading: (loading: boolean) => void;
  setItemUsesJson: (json: string) => void;
  setCdnVersion: (version: number) => void;
  setStorageVaults: (json: string) => void;
  setAreas: (json: string) => void;
  formatVaultName: (key: string) => string;
  getItemByCode: (code: number) => Item | undefined;
  getRecipesForSkill: (skill: string) => Recipe[];
  getSkillNames: () => string[];
}

export const useGameDataStore = create<GameDataState>((set, get) => ({
  recipes: [],
  items: [],
  xpTables: [],
  recipeIndexes: null,
  itemIndexes: null,
  sourcesLoaded: false,
  loaded: false,
  loading: false,
  itemUsesJson: null,
  cdnVersion: null,

  setRecipes: (recipes, indexes) =>
    set({
      recipes,
      recipeIndexes: indexes,
      loaded: get().items.length > 0,
    }),

  setItems: (items, indexes) =>
    set({
      items,
      itemIndexes: indexes,
      loaded: get().recipes.length > 0,
    }),

  setXpTables: (tables) => set({ xpTables: tables }),

  setSources: (sources) => {
    loadSourcesData(sources);
    set({ sourcesLoaded: true });
  },

  setRecipeSources: (sources) => {
    loadRecipeSourcesData(sources);
  },

  setNpcNames: (npcMap) => {
    loadNpcNames(npcMap);
  },

  setLoading: (loading) => set({ loading }),

  setItemUsesJson: (json) => set({ itemUsesJson: json }),

  setCdnVersion: (version) => set({ cdnVersion: version }),

  setStorageVaults: (json) => { loadVaultData(json); },

  setAreas: (json) => { loadAreaData(json); },

  formatVaultName: (key) => formatVaultName(key),

  getItemByCode: (code) => get().itemIndexes?.byItemCode.get(code),

  getRecipesForSkill: (skill) =>
    get().recipeIndexes?.bySkill.get(skill) ?? [],

  getSkillNames: () => {
    const skills = new Set<string>();
    for (const recipe of get().recipes) {
      if (recipe.Skill) skills.add(recipe.Skill);
    }
    return Array.from(skills).sort();
  },
}));
