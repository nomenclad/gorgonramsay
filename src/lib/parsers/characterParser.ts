/**
 * Parse a user-imported character sheet JSON export.
 *
 * The character JSON comes from the Project Gorgon in-game /exportcharacter
 * command. It contains skill levels, recipe completions, favor, and more.
 *
 * To handle game-data format changes:
 *   - Add new optional fields to the CharacterSheet type in types/character.ts.
 *   - Update the validation below to provide sensible defaults for new fields.
 *   - Existing imports that lack the new fields will still load without errors.
 */
import type { CharacterSheet } from "../../types/character";

/**
 * Parse and validate a character sheet JSON string.
 * Throws on malformed JSON or missing required fields so callers can
 * show an error rather than silently operating on bad data.
 */
export function parseCharacterSheet(json: string): CharacterSheet {
  const data = JSON.parse(json);

  // Validate required top-level fields
  if (!data || typeof data !== "object") {
    throw new Error("Invalid character data: expected a JSON object");
  }
  if (typeof data.Character !== "string") {
    throw new Error("Invalid character data: missing 'Character' name field");
  }
  if (!data.Skills || typeof data.Skills !== "object") {
    throw new Error("Invalid character data: missing 'Skills' object");
  }

  // Provide safe defaults for optional fields the app depends on
  if (!data.RecipeCompletions || typeof data.RecipeCompletions !== "object") {
    data.RecipeCompletions = {};
  }

  return data as CharacterSheet;
}
