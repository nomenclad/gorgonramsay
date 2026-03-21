import { create } from "zustand";
import type { Recipe, Item, XpTable, SourcesData } from "../types";
import { loadSourcesData, loadNpcNames } from "../lib/sourceResolver";

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

  setRecipes: (recipes: Recipe[], indexes: RecipeIndexes) => void;
  setItems: (items: Item[], indexes: ItemIndexes) => void;
  setXpTables: (tables: XpTable[]) => void;
  setSources: (sources: SourcesData) => void;
  setNpcNames: (npcMap: Map<string, { name: string; area?: string }>) => void;
  setLoading: (loading: boolean) => void;
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

  setNpcNames: (npcMap) => {
    loadNpcNames(npcMap);
  },

  setLoading: (loading) => set({ loading }),

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
