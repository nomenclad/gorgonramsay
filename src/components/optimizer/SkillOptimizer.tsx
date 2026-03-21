import { useState, useMemo, useCallback, useEffect } from "react";
import { useCharacterStore } from "../../stores/characterStore";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import type { OptimizerResult } from "../../types/optimizer";
import { runOptimizer } from "../../lib/optimizer";
import { LevelingPlan } from "./LevelingPlan";
import { CombatSkillGuide } from "./CombatSkillGuide";

export function SkillOptimizer() {
  const character = useCharacterStore((s) => s.character);
  const getCraftingSkills = useCharacterStore((s) => s.getCraftingSkills);
  const getRecipesForSkill = useGameDataStore((s) => s.getRecipesForSkill);
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const xpTables = useGameDataStore((s) => s.xpTables);
  const loaded = useGameDataStore((s) => s.loaded);
  const aggregated = useInventoryStore((s) => s.aggregated);

  const [selectedSkill, setSelectedSkill] = useState("");
  const [targetLevel, setTargetLevel] = useState(50);
  const [result, setResult] = useState<OptimizerResult | null>(null);

  const craftingSkills = useMemo(() => getCraftingSkills(), [getCraftingSkills]);
  const currentSkill = character?.Skills[selectedSkill];

  const inventoryMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of aggregated) {
      map.set(item.typeId, item.totalQuantity);
    }
    return map;
  }, [aggregated]);

  const skillRecipes = useMemo(
    () => (selectedSkill ? getRecipesForSkill(selectedSkill) : []),
    [selectedSkill, getRecipesForSkill]
  );
  const isCombatSkill = selectedSkill !== "" && skillRecipes.length === 0;

  const runOptimization = useCallback(() => {
    if (!selectedSkill || !currentSkill || !character) return;
    const recipes = skillRecipes;
    if (recipes.length === 0) return;

    const xpTable =
      xpTables.find((t) => t.InternalName === "TypicalCombatSkill") ??
      xpTables[0];
    if (!xpTable) return;

    const res = runOptimizer({
      skill: selectedSkill,
      currentLevel: currentSkill.Level,
      currentXp: currentSkill.XpTowardNextLevel,
      xpNeededForNext: currentSkill.XpNeededForNextLevel,
      targetLevel,
      xpTable,
      recipes,
      recipeCompletions: character.RecipeCompletions,
      inventory: inventoryMap,
      getItemByCode,
    });
    setResult(res);
  }, [
    selectedSkill,
    currentSkill,
    character,
    skillRecipes,
    getRecipesForSkill,
    getItemByCode,
    xpTables,
    targetLevel,
    inventoryMap,
  ]);

  // Auto-run when skill/target changes and data is ready
  useEffect(() => {
    setResult(null);
  }, [selectedSkill, targetLevel]);

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
      <div className="bg-bg-secondary rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Skill</label>
            <select
              value={selectedSkill}
              onChange={(e) => setSelectedSkill(e.target.value)}
              className="bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary"
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
                <div className="bg-bg-primary rounded px-3 py-2 text-sm min-w-32">
                  <span className="font-medium">{currentSkill.Level}</span>
                  <span className="text-text-muted ml-2 text-xs">
                    {currentSkill.XpTowardNextLevel.toLocaleString()}/
                    {currentSkill.XpNeededForNextLevel.toLocaleString()} XP
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
                  max={125}
                  className="bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary w-24"
                />
              </div>
                      {!isCombatSkill && (
              <button
                onClick={runOptimization}
                disabled={!selectedSkill || targetLevel <= currentSkill.Level}
                className="bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded text-sm font-medium transition-colors"
              >
                Optimize
              </button>
              )}
            </>
          )}
        </div>

        {currentSkill && (
          <div>
            <div className="flex justify-between text-xs text-text-muted mb-1">
              <span>Level {currentSkill.Level} progress</span>
              <span>
                {Math.round(
                  (currentSkill.XpTowardNextLevel /
                    currentSkill.XpNeededForNextLevel) *
                    100
                )}
                %
              </span>
            </div>
            <div className="h-1.5 bg-bg-primary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    (currentSkill.XpTowardNextLevel /
                      currentSkill.XpNeededForNextLevel) *
                      100
                  )}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {isCombatSkill && selectedSkill && currentSkill && (
        <CombatSkillGuide skill={selectedSkill} currentLevel={currentSkill.Level} targetLevel={targetLevel} />
      )}
      {!isCombatSkill && result && <LevelingPlan result={result} getItemByCode={getItemByCode} />}
    </div>
  );
}
