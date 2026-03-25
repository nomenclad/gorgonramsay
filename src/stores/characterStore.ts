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

  setCharacter: (sheet: CharacterSheet) => void;
  getSkill: (name: string) => SkillState | undefined;
  getRecipeCompletion: (internalName: string) => number | undefined;
  isFirstTimeRecipe: (internalName: string) => boolean;
  getCraftingSkills: () => [string, SkillState][];
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  character: null,

  setCharacter: (sheet) => set({ character: sheet }),

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
