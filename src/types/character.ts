/**
 * Types for character export data from the in-game /exportcharacter command.
 *
 * The export includes skill levels, recipe completions, and NPC favor.
 * If new export fields appear, add them as optional properties here.
 */
export interface SkillState {
  Level: number;
  BonusLevels: number;
  XpTowardNextLevel: number;
  XpNeededForNextLevel: number;
  Abilities?: string[];
}

export interface CharacterSheet {
  Character: string;
  ServerName: string;
  Timestamp: string;
  Report: string;
  ReportVersion: number;
  Race: string;
  Skills: Record<string, SkillState>;
  /**
   * Keys are recipe InternalNames (e.g. "Butter", "CraftedLeatherBoots1"),
   * values are completion counts (how many times crafted). Used to determine
   * recipe knowledge. NOTE: this tracks crafting only — eaten-food status
   * is NOT included in the character export.
   */
  RecipeCompletions: Record<string, number>;
  /**
   * NPC favor levels from the character export.
   * Keys are NPC internal names (e.g. "NPC_Jara" or just "Jara" depending on export version).
   * Values are favor tier strings like "Neutral", "Comfortable", "Friends", "CloseFriends", "BestFriends".
   */
  FavorLevels?: Record<string, string>;
}
