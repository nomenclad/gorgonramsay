/**
 * Cooking sub-tab within the planner. Groups planned recipes by skill and displays
 * intermediate crafting steps (non-gardening sub-recipes) with ingredient availability.
 * Each recipe shows per-ingredient have/need status with color-coded badges.
 */
import { useMemo } from "react";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { formatSkillName } from "../../lib/foodSkills";
import type { Recipe } from "../../types/recipe";
import type { CraftingStep } from "./plannerUtils";

interface Props {
  plannedRecipes: { recipe: Recipe; quantity: number }[];
  craftingSteps: CraftingStep[]; // non-gardening intermediate steps
  /** Items to grab from the saddlebag at the cooking zone before crafting. */
  saddlebagItems?: { itemName: string; itemCode: number; toCollect: number }[];
}

interface SkillGroup {
  skill: string;
  recipes: { recipe: Recipe; quantity: number }[];
  totalRuns: number;
}

export function CookingTab({ plannedRecipes, craftingSteps, saddlebagItems = [] }: Props) {
  const getItemQuantity = useInventoryStore((s) => s.getItemQuantity);
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);

  const skillGroups = useMemo(() => {
    const map = new Map<string, { recipe: Recipe; quantity: number }[]>();
    for (const pr of plannedRecipes) {
      const skill = pr.recipe.Skill;
      if (!map.has(skill)) map.set(skill, []);
      map.get(skill)!.push(pr);
    }
    const groups: SkillGroup[] = [];
    for (const [skill, recipes] of map.entries()) {
      recipes.sort((a, b) => a.recipe.SkillLevelReq - b.recipe.SkillLevelReq);
      groups.push({
        skill,
        recipes,
        totalRuns: recipes.reduce((s, r) => s + r.quantity, 0),
      });
    }
    groups.sort((a, b) => a.skill.localeCompare(b.skill));
    return groups;
  }, [plannedRecipes]);

  // Non-gardening intermediate crafting steps
  const intermediateSteps = useMemo(
    () => craftingSteps.filter((s) => s.skill !== "Gardening"),
    [craftingSteps]
  );

  if (plannedRecipes.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">
        No recipes planned. Star recipes on the Recipes tab or check foods on the Gourmand tab.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Saddlebag reminder — items to grab from saddlebag before cooking */}
      {saddlebagItems.length > 0 && (
        <div className="bg-accent/5 rounded-lg p-3 border border-accent/20">
          <div className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">
            Retrieve from Saddlebag ({saddlebagItems.length} item{saddlebagItems.length !== 1 ? "s" : ""})
          </div>
          <p className="text-xs text-text-muted mb-2">
            These items are in your saddlebag — grab them before you start cooking.
          </p>
          <div className="flex flex-wrap gap-1">
            {saddlebagItems.map((item) => (
              <span
                key={item.itemCode}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-accent/10 text-accent"
              >
                {item.toCollect}× {item.itemName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Intermediate crafting steps */}
      {intermediateSteps.length > 0 && (
        <div className="bg-bg-secondary rounded-lg p-3 border border-border">
          <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
            Intermediate Crafts ({intermediateSteps.length})
          </div>
          <div className="space-y-2">
            {intermediateSteps.map((step) => (
              <div key={step.recipeId} className="flex items-start gap-3 text-xs">
                <span className="text-accent font-medium shrink-0 w-8 text-right">
                  {step.runs}×
                </span>
                <div>
                  <span className="text-text-primary font-medium">{step.recipeName}</span>
                  <span className="text-text-muted ml-1">
                    ({formatSkillName(step.skill)} Lv{step.levelReq})
                  </span>
                  <span className="text-text-muted ml-1">
                    → {step.runs * step.resultQty}× {step.resultItemName}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {step.ingredientsPerRun.map((ing) => {
                      const totalNeeded = ing.qty * step.runs;
                      const have = getItemQuantity(ing.itemCode);
                      return (
                        <span
                          key={ing.itemCode}
                          className={`px-1.5 py-0.5 rounded text-xs ${
                            have >= totalNeeded
                              ? "bg-success/10 text-success"
                              : "bg-error/10 text-error"
                          }`}
                        >
                          {ing.qty}× {ing.itemName}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recipes grouped by skill */}
      {skillGroups.map((group) => (
        <div key={group.skill} className="bg-bg-secondary rounded-lg p-3 border border-border">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-sm font-semibold text-text-primary">{formatSkillName(group.skill)}</span>
            <span className="text-xs text-text-muted">
              {group.recipes.length} recipe{group.recipes.length !== 1 ? "s" : ""} · {group.totalRuns} total craft{group.totalRuns !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="space-y-2">
            {group.recipes.map((pr) => (
              <div key={pr.recipe.id} className="border-t border-border/50 pt-2 first:border-0 first:pt-0">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="text-accent font-medium">{pr.quantity}×</span>
                  <span className="text-text-primary">{pr.recipe.Name}</span>
                  <span className="text-xs text-text-muted ml-auto">Lv {pr.recipe.SkillLevelReq}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {pr.recipe.Ingredients.map((ing) => {
                    const totalNeeded = ing.StackSize * pr.quantity;
                    const have = getItemQuantity(ing.ItemCode);
                    return (
                      <span
                        key={ing.ItemCode}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
                          have >= totalNeeded
                            ? "bg-success/10 text-success"
                            : "bg-error/10 text-error"
                        }`}
                      >
                        {ing.StackSize}× {getItemByCode(ing.ItemCode)?.Name ?? `Item #${ing.ItemCode}`}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
