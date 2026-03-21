import { useState, useMemo } from "react";
import { useCharacterStore } from "../../stores/characterStore";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { computeEffectiveXp, getFirstTimeBonus } from "../../lib/xpCalculator";

export function SkillOptimizer() {
  const character = useCharacterStore((s) => s.character);
  const getCraftingSkills = useCharacterStore((s) => s.getCraftingSkills);
  const getRecipesForSkill = useGameDataStore((s) => s.getRecipesForSkill);
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const getItemQuantity = useInventoryStore((s) => s.getItemQuantity);
  const loaded = useGameDataStore((s) => s.loaded);

  const [selectedSkill, setSelectedSkill] = useState("");
  const [targetLevel, setTargetLevel] = useState(50);

  const craftingSkills = useMemo(() => getCraftingSkills(), [getCraftingSkills]);

  const currentSkill = character?.Skills[selectedSkill];

  const recipes = useMemo(() => {
    if (!selectedSkill || !currentSkill) return [];

    return getRecipesForSkill(selectedSkill)
      .map((recipe) => {
        const effectiveXp = computeEffectiveXp(recipe, currentSkill.Level);
        const firstTimeBonus = getFirstTimeBonus(recipe);
        const isFirstTime =
          character?.RecipeCompletions[recipe.InternalName] === 0;

        // Check ingredient availability
        const ingredientStatus = recipe.Ingredients.map((ing) => {
          const item = getItemByCode(ing.ItemCode);
          const have = getItemQuantity(ing.ItemCode);
          return {
            itemCode: ing.ItemCode,
            name: item?.Name ?? `Item #${ing.ItemCode}`,
            needed: ing.StackSize,
            have,
            sufficient: have >= ing.StackSize,
          };
        });

        const canCraft = ingredientStatus.every((s) => s.sufficient);
        const craftableCount = ingredientStatus.length > 0
          ? Math.min(
              ...ingredientStatus.map((s) =>
                Math.floor(s.have / s.needed)
              )
            )
          : 0;

        return {
          recipe,
          effectiveXp,
          firstTimeBonus: isFirstTime ? firstTimeBonus : 0,
          canCraft,
          craftableCount,
          ingredientStatus,
        };
      })
      .filter((r) => r.effectiveXp > 0 || r.firstTimeBonus > 0)
      .sort((a, b) => {
        // First-time bonuses first, then by effective XP desc
        if (a.firstTimeBonus > 0 && b.firstTimeBonus === 0) return -1;
        if (b.firstTimeBonus > 0 && a.firstTimeBonus === 0) return 1;
        // Then craftable recipes
        if (a.canCraft && !b.canCraft) return -1;
        if (b.canCraft && !a.canCraft) return 1;
        return b.effectiveXp - a.effectiveXp;
      });
  }, [
    selectedSkill,
    currentSkill,
    character,
    getRecipesForSkill,
    getItemByCode,
    getItemQuantity,
  ]);

  if (!loaded || !character) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-text-secondary mb-2">
          Skill Optimizer
        </h2>
        <p className="text-text-muted">
          Load game data and character files in Settings to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <div>
          <label className="block text-xs text-text-secondary mb-1">
            Skill
          </label>
          <select
            value={selectedSkill}
            onChange={(e) => setSelectedSkill(e.target.value)}
            className="bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary"
          >
            <option value="">Select a skill...</option>
            {craftingSkills
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, state]) => (
                <option key={name} value={name}>
                  {name} (Lv {state.Level})
                </option>
              ))}
          </select>
        </div>

        {currentSkill && (
          <>
            <div>
              <label className="block text-xs text-text-secondary mb-1">
                Current Level
              </label>
              <div className="bg-bg-tertiary rounded px-3 py-2 text-sm">
                {currentSkill.Level}
                <span className="text-text-muted ml-1">
                  ({currentSkill.XpTowardNextLevel}/{currentSkill.XpNeededForNextLevel} XP)
                </span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">
                Target Level
              </label>
              <input
                type="number"
                value={targetLevel}
                onChange={(e) => setTargetLevel(Number(e.target.value))}
                min={currentSkill.Level + 1}
                max={100}
                className="bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary w-20"
              />
            </div>
          </>
        )}
      </div>

      {selectedSkill && recipes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-2 px-3">Recipe</th>
                <th className="py-2 px-3">Req Level</th>
                <th className="py-2 px-3">XP</th>
                <th className="py-2 px-3">First-Time</th>
                <th className="py-2 px-3">Can Craft</th>
                <th className="py-2 px-3">Ingredients</th>
              </tr>
            </thead>
            <tbody>
              {recipes.map(
                ({
                  recipe,
                  effectiveXp,
                  firstTimeBonus,
                  canCraft,
                  craftableCount,
                  ingredientStatus,
                }) => (
                  <tr
                    key={recipe.id}
                    className={`border-b border-border/50 hover:bg-bg-secondary/50 ${
                      canCraft ? "bg-success/5" : ""
                    }`}
                  >
                    <td className="py-2 px-3 font-medium">{recipe.Name}</td>
                    <td className="py-2 px-3 text-text-secondary">
                      {recipe.SkillLevelReq}
                    </td>
                    <td className="py-2 px-3">
                      <span className={effectiveXp > 0 ? "text-success" : "text-danger"}>
                        {effectiveXp}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {firstTimeBonus > 0 && (
                        <span className="text-gold font-medium">
                          +{firstTimeBonus}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {canCraft ? (
                        <span className="text-success">
                          x{craftableCount}
                        </span>
                      ) : (
                        <span className="text-text-muted">No</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-xs text-text-secondary">
                      {ingredientStatus.map((s, i) => (
                        <span key={s.itemCode}>
                          {i > 0 && ", "}
                          <span
                            className={
                              s.sufficient ? "text-success" : "text-danger"
                            }
                          >
                            {s.name} ({s.have}/{s.needed})
                          </span>
                        </span>
                      ))}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedSkill && recipes.length === 0 && (
        <p className="text-text-muted text-center py-8">
          No recipes found for {selectedSkill} at the current level.
        </p>
      )}
    </div>
  );
}
