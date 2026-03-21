export interface Ingredient {
  ItemCode: number;
  StackSize: number;
  ChanceToConsume?: number;
}

export interface ResultItem {
  ItemCode: number;
  StackSize: number;
  PercentChance?: number;
}

export interface Recipe {
  id: string;
  Name: string;
  InternalName: string;
  Description?: string;
  Skill: string;
  SkillLevelReq: number;
  Ingredients: Ingredient[];
  ResultItems: ResultItem[];
  RewardSkill?: string;
  RewardSkillXp: number;
  RewardSkillXpFirstTime?: number;
  RewardSkillXpDropOffLevel?: number;
  RewardSkillXpDropOffPct?: number;
  RewardSkillXpDropOffRate?: number;
  IconId?: number;
  Keywords?: string[];
  SortSkill?: string;
  UsageDelay?: number;
  UsageDelayMessage?: string;
  ItemMenuKeywordReq?: string;
  ItemMenuLabel?: string;
  IsItemMenuKeywordReqSufficient?: boolean;
}
