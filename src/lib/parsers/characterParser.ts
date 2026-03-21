import type { CharacterSheet } from "../../types/character";

export function parseCharacterSheet(json: string): CharacterSheet {
  return JSON.parse(json) as CharacterSheet;
}
