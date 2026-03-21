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
