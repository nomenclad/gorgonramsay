/**
 * @module navStore
 *
 * Manages UI navigation state: active tab, pending cross-tab searches,
 * ingredient/recipe filters, and the global skill filter.
 *
 * **Data origin:** Pure UI state set by user interactions (tab clicks,
 * "view in recipes" links, skill sidebar selections, etc.).
 *
 * **Persistence:** Ephemeral — all state resets on page reload, with the
 * sole exception of `skillSidebarOpen` which is persisted to localStorage
 * so the sidebar remembers its collapsed/expanded state.
 *
 * **How to extend:** Add a new `pending*` field + navigate/clear action
 * pair to enable cross-tab deep-linking for a new feature. Consuming
 * components should call the `clear*` action after reading the pending
 * value to avoid stale navigations.
 */
import { create } from "zustand";

/**
 * Global navigation state — lets any component trigger tab changes
 * and pre-select a recipe in the Crafting Calculator.
 */
interface NavState {
  activeTab: string;
  setActiveTab: (id: string) => void;

  /** Recipe name to auto-select when the Crafting tab mounts / becomes active */
  pendingCraftName: string | null;
  navigateToCraft: (recipeName: string) => void;
  clearPendingCraft: () => void;

  /** Ingredient name to pre-fill search when navigating to the Inventory tab */
  pendingIngredientSearch: string | null;
  navigateToIngredient: (name: string) => void;
  clearPendingIngredientSearch: () => void;

  /**
   * When set, the Recipes tab filters to show only recipes that use this
   * ingredient (by typeId). Set by clicking the recipe count on an ingredient row.
   */
  recipeIngredientFilter: { typeId: number; name: string } | null;
  filterRecipesByIngredient: (typeId: number, name: string) => void;
  clearRecipeIngredientFilter: () => void;

  /** Recipe name to pre-fill the Recipes tab search when navigating from Crafting */
  pendingRecipeNameSearch: string | null;
  navigateToRecipeSearch: (name: string) => void;
  clearRecipeNameSearch: () => void;

  /** Global skill filter shared across all tabs. Empty string means "All". */
  selectedSkill: string;
  setSelectedSkill: (skill: string) => void;

  /** Navigate to the Planner tab */
  navigateToPlanner: () => void;

  /** Whether the skill sidebar is open. Persists to localStorage. */
  skillSidebarOpen: boolean;
  toggleSkillSidebar: () => void;
}

export const useNavStore = create<NavState>((set) => ({
  activeTab: "inventory",
  setActiveTab: (id) => set({ activeTab: id }),

  pendingCraftName: null,
  navigateToCraft: (recipeName) =>
    set({ activeTab: "crafting", pendingCraftName: recipeName }),
  clearPendingCraft: () => set({ pendingCraftName: null }),

  pendingIngredientSearch: null,
  navigateToIngredient: (name) =>
    set({ activeTab: "inventory", pendingIngredientSearch: name }),
  clearPendingIngredientSearch: () => set({ pendingIngredientSearch: null }),

  recipeIngredientFilter: null,
  filterRecipesByIngredient: (typeId, name) =>
    set({ activeTab: "recipes", recipeIngredientFilter: { typeId, name } }),
  clearRecipeIngredientFilter: () => set({ recipeIngredientFilter: null }),

  pendingRecipeNameSearch: null,
  navigateToRecipeSearch: (name) =>
    set({ activeTab: "recipes", pendingRecipeNameSearch: name }),
  clearRecipeNameSearch: () => set({ pendingRecipeNameSearch: null }),

  navigateToPlanner: () => set({ activeTab: "planner" }),

  selectedSkill: "",
  setSelectedSkill: (skill) => set({ selectedSkill: skill }),

  skillSidebarOpen: localStorage.getItem("skillSidebarOpen") !== "false",
  toggleSkillSidebar: () =>
    set((state) => {
      const next = !state.skillSidebarOpen;
      localStorage.setItem("skillSidebarOpen", String(next));
      return { skillSidebarOpen: next };
    }),
}));
