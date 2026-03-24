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
  RecipeCompletions: Record<string, number>;
  /**
   * NPC favor levels from the character export.
   * Keys are NPC internal names (e.g. "NPC_Jara" or just "Jara" depending on export version).
   * Values are favor tier strings like "Neutral", "Comfortable", "Friends", "CloseFriends", "BestFriends".
   */
  FavorLevels?: Record<string, string>;
}
