export interface IngredientStatus {
  itemCode: number;
  name: string;
  needed: number;
  have: number;
  sufficient: boolean;
  expectedNeeded: number; // accounting for ChanceToConsume
}

export interface LevelingStep {
  recipeId: string;
  recipeName: string;
  recipeInternalName: string;
  skillLevelReq: number;
  craftCount: number;
  xpPerCraft: number;
  totalXp: number;
  isFirstTime: boolean;
  firstTimeXp: number;
  ingredients: IngredientStatus[];
  resultItems: { itemCode: number; name: string; quantity: number }[];
  canCraftFromInventory: boolean;
  ingredientCost: number; // gold cost if buying missing ingredients
}

export interface OptimizerResult {
  skill: string;
  fromLevel: number;
  toLevel: number;
  totalXpNeeded: number;
  totalXpGained: number;
  steps: LevelingStep[];
  totalIngredientCost: number;
  missingIngredients: MissingIngredient[];
}

export interface MissingIngredient {
  itemCode: number;
  name: string;
  totalNeeded: number;
  inInventory: number;
  toBuy: number;
  estimatedCost: number;
  usedInSteps: string[]; // recipe names
}
