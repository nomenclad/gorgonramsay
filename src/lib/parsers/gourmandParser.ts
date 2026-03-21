/**
 * Parse itemuses.json to extract Gourmand food data.
 * itemuses.json maps item IDs to usage effects including Gourmand XP bonuses.
 */

export interface FoodItem {
  itemCode: number;
  itemName: string;
  gourmandXp: number;
  effects: string[];
}

interface RawItemUse {
  InternalName?: string;
  Verb?: string;
  Requirements?: string[];
  Effects?: string[];
}

interface RawItemUseData {
  [itemId: string]: RawItemUse | RawItemUse[];
}

export function parseGourmandFoods(
  itemUsesJson: string,
  getItemByCode: (code: number) => { Name: string } | undefined
): FoodItem[] {
  const raw: RawItemUseData = JSON.parse(itemUsesJson);
  const foods: FoodItem[] = [];

  for (const [itemId, uses] of Object.entries(raw)) {
    const usesArray = Array.isArray(uses) ? uses : [uses];
    const itemCode = parseInt(itemId.replace("item_", ""), 10);
    if (isNaN(itemCode)) continue;

    let gourmandXp = 0;
    const allEffects: string[] = [];

    for (const use of usesArray) {
      const effects = use.Effects ?? [];
      for (const effect of effects) {
        // Look for Gourmand XP effects
        if (effect.includes("SKILL_GOURMAND") || effect.includes("Gourmand")) {
          const match = effect.match(/(\d+)/);
          if (match) {
            gourmandXp = Math.max(gourmandXp, parseInt(match[1], 10));
          }
        }
        allEffects.push(effect);
      }
    }

    if (gourmandXp > 0) {
      const item = getItemByCode(itemCode);
      foods.push({
        itemCode,
        itemName: item?.Name ?? `Item #${itemCode}`,
        gourmandXp,
        effects: allEffects,
      });
    }
  }

  return foods.sort((a, b) => b.gourmandXp - a.gourmandXp);
}
