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
}
