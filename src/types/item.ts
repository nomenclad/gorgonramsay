export interface Item {
  id: string;
  Name: string;
  InternalName: string;
  Description?: string;
  IconId?: number;
  Keywords: string[];
  MaxStackSize: number;
  Value: number;
  NumUses?: number;
  /** e.g. "Level 20 Meal" — only present on food items */
  FoodDesc?: string;
  /** Plain-text effect descriptions — present on food and consumables */
  EffectDescs?: string[];
}
