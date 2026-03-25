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
   * Keys are recipe InternalNames (e.g. "CookingFood_MildCheddarCheese"),
   * values are completion counts. Used to determine recipe knowledge and
   * eaten status for Gourmand tracking.
   */
  RecipeCompletions: Record<string, number>;
  /**
   * NPC favor levels from the character export.
   * Keys are NPC internal names (e.g. "NPC_Jara" or just "Jara" depending on export version).
   * Values are favor tier strings like "Neutral", "Comfortable", "Friends", "CloseFriends", "BestFriends".
   */
  FavorLevels?: Record<string, string>;
}
