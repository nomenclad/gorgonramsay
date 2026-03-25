/**
 * @module characterStore
 *
 * Stores the user-imported character sheet: skill levels, recipe completion
 * counts, favor standings, and other per-character data.
 *
 * **Data origin:** The player runs `/exportcharacter` in Project Gorgon,
 * which writes a JSON file. That file is imported via drag-and-drop or
 * the folder-watch feature, parsed by `characterParser.ts`, and pushed
 * here via `setCharacter`.
 *
 * **Persistence:** The raw JSON is saved in the IndexedDB `userFiles`
 * table (key "character") so it survives page reloads. On startup,
 * `hydrate.ts` restores it from IndexedDB and calls `setCharacter`.
 *
 * **How to extend:** Add derived getters (like `isFirstTimeRecipe`) to
 * the store interface. If the character JSON gains new fields, update
 * the `CharacterSheet` type and `characterParser.ts` first.
 */
import { create } from "zustand";
import type { CharacterSheet, SkillState } from "../types";

interface CharacterState {
  character: CharacterSheet | null;
  /**
   * Foods the player has eaten for Gourmand XP, parsed from the game's local
   * Books directory text file. Keys are food display names (e.g. "Large Strawberry"),
   * values are eat counts. Null if the file hasn't been imported yet.
   */
  eatenFoods: Map<string, number> | null;

  setCharacter: (sheet: CharacterSheet) => void;
  setEatenFoods: (foods: Map<string, number>) => void;
  getSkill: (name: string) => SkillState | undefined;
  getRecipeCompletion: (internalName: string) => number | undefined;
  isFirstTimeRecipe: (internalName: string) => boolean;
  getCraftingSkills: () => [string, SkillState][];
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  character: null,
  eatenFoods: null,

  setCharacter: (sheet) => set({ character: sheet }),
  setEatenFoods: (foods) => set({ eatenFoods: foods }),

  getSkill: (name) => get().character?.Skills[name],

  getRecipeCompletion: (internalName) =>
    get().character?.RecipeCompletions[internalName],

  isFirstTimeRecipe: (internalName) => {
    const completions = get().character?.RecipeCompletions;
    if (!completions) return false;
    return internalName in completions && completions[internalName] === 0;
  },

  getCraftingSkills: () => {
    const skills = get().character?.Skills;
    if (!skills) return [];
    return Object.entries(skills).filter(
      ([name]) =>
        !name.startsWith("Anatomy_") &&
        !name.startsWith("Phrenology_") &&
        name !== "Unknown"
    );
  },
}));
