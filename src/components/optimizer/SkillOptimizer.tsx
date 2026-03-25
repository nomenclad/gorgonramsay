/**
 * Skill optimizer tab: selects a crafting skill, computes the best recipe sequence
 * to reach a target level, and renders the result via LevelingPlan. Features its
 * own skill sidebar (separate from the main SkillSidebar) and diagnostic messages
 * for edge cases like fully dropped-off XP or no available recipes.
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useCharacterStore } from "../../stores/characterStore";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import type { OptimizerResult } from "../../types/optimizer";
import { runOptimizer } from "../../lib/optimizer";
import { LevelingPlan } from "./LevelingPlan";

// EXCLUDED_SKILLS: combat/magic skills that have crafting recipes in the CDN data but
// aren't meaningfully optimizable through crafting alone (e.g. FireMagic has
// transmutation recipes but XP comes primarily from combat). Excluding them
// prevents confusing/useless optimization results.
// To exclude additional skills, add their InternalName to this set.
const EXCLUDED_SKILLS = new Set(["FireMagic", "IceMagic", "WeatherWitching"]);

export function SkillOptimizer() {
  const character = useCharacterStore((s) => s.character);
  const getRecipesForSkill = useGameDataStore((s) => s.getRecipesForSkill);
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const recipes = useGameDataStore((s) => s.recipes);
  const xpTables = useGameDataStore((s) => s.xpTables);
  const loaded = useGameDataStore((s) => s.loaded);
  const aggregated = useInventoryStore((s) => s.aggregated);

  const [selectedSkill, setSelectedSkill] = useState("");
  const [targetLevel, setTargetLevel] = useState(50);
  const [result, setResult] = useState<OptimizerResult | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return localStorage.getItem("skill-sidebar-open") !== "false";
  });

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      localStorage.setItem("skill-sidebar-open", String(!prev));
      return !prev;
    });
  }, []);

  // Only skills that have at least one crafting recipe
  const craftingSkills = useMemo(() => {
    if (!character) return [];
    const skillsWithRecipes = new Set(recipes.map((r) => r.Skill));
    return Object.entries(character.Skills)
      .filter(([name]) => skillsWithRecipes.has(name) && !EXCLUDED_SKILLS.has(name))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [character, recipes]);

  const currentSkill = character?.Skills[selectedSkill];

  const inventoryMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of aggregated) {
      map.set(item.typeId, item.totalQuantity);
    }
    return map;
  }, [aggregated]);

  // Skill diagnostics computation: determines recipe availability at the player's current level.
  // unlocked = recipes at or below current level; withXp = those that award base XP;
  // withEffXp = those still giving effective XP after drop-off (XP decays as you
  // out-level a recipe based on RewardSkillXpDropOffLevel/Pct/Rate fields).
  // nextUnlockLevel = the soonest level that unlocks a new recipe, shown as guidance.
  const skillDiagnostics = useMemo(() => {
    if (!selectedSkill || !currentSkill) return null;
    const skillRecipes = getRecipesForSkill(selectedSkill);
    if (skillRecipes.length === 0) return null;

    const level = currentSkill.Level;

    // Recipes unlocked at or below current level
    const unlocked = skillRecipes.filter((r) => r.SkillLevelReq <= level);
    // Recipes that give non-zero base XP (ignoring dropoff)
    const withXp = unlocked.filter((r) => r.RewardSkillXp > 0);
    // Recipes giving non-zero effective XP at current level
    const withEffXp = withXp.filter((r) => {
      if (!r.RewardSkillXpDropOffLevel || !r.RewardSkillXpDropOffPct || !r.RewardSkillXpDropOffRate) return true;
      if (level <= r.RewardSkillXpDropOffLevel) return true;
      const levelsAbove = level - r.RewardSkillXpDropOffLevel;
      const reductions = Math.floor(levelsAbove / r.RewardSkillXpDropOffRate);
      return 1 - r.RewardSkillXpDropOffPct * reductions > 0;
    });

    // Lowest level recipe not yet unlocked
    const nextUnlockLevel = skillRecipes
      .filter((r) => r.SkillLevelReq > level)
      .reduce<number | null>((min, r) => (min === null || r.SkillLevelReq < min ? r.SkillLevelReq : min), null);

    return { unlocked, withXp, withEffXp, nextUnlockLevel, totalRecipes: skillRecipes.length };
  }, [selectedSkill, currentSkill, getRecipesForSkill]);

  const runOptimization = useCallback(() => {
    if (!selectedSkill || !currentSkill || !character) return;
    const skillRecipes = getRecipesForSkill(selectedSkill);
    if (skillRecipes.length === 0) return;
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
      recipes: skillRecipes,
      recipeCompletions: character.RecipeCompletions,
      inventory: inventoryMap,
      getItemByCode,
    });
    setResult(res);
  }, [selectedSkill, currentSkill, character, getRecipesForSkill, getItemByCode, xpTables, targetLevel, inventoryMap]);

  useEffect(() => {
    setResult(null);
  }, [selectedSkill, targetLevel]);

  // Auto-run optimization whenever the skill or target level changes
  useEffect(() => {
    if (!selectedSkill || !currentSkill || !character) return;
    runOptimization();
  }, [selectedSkill, targetLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sidebar ──────────────────────────────────────────────────────────────
  const sidebar = (
    <aside
      className={`
        flex-shrink-0 flex flex-col border-r border-border bg-bg-secondary
        transition-all duration-200 overflow-hidden
        ${sidebarOpen ? "w-52" : "w-10"}
      `}
    >
      {sidebarOpen ? (
        <>
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Skills
            </span>
            <button
              onClick={toggleSidebar}
              title="Collapse sidebar"
              className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
            >
              ◀
            </button>
          </div>

          {/* Skill list */}
          {!loaded || !character ? (
            <div className="p-3 text-xs text-text-muted">
              Load data in Settings
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {craftingSkills.map(([name, state]) => (
                <button
                  key={name}
                  onClick={() => setSelectedSkill(name)}
                  className={`
                    w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2
                    hover:bg-bg-primary transition-colors
                    ${selectedSkill === name
                      ? "bg-accent/10 text-accent border-l-2 border-accent"
                      : "text-text-primary border-l-2 border-transparent"
                    }
                  `}
                >
                  <span className="truncate">{name}</span>
                  <span className="text-xs text-text-muted shrink-0">
                    {state.Level}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Collapsed — just show the expand button */
        <button
          onClick={toggleSidebar}
          title="Expand skills"
          className="flex-1 flex items-start justify-center pt-3 text-text-muted hover:text-text-primary transition-colors"
        >
          ▶
        </button>
      )}
    </aside>
  );

  // ── Main content ──────────────────────────────────────────────────────────
  const mainContent = (
    <div className="flex-1 overflow-y-auto p-4 min-w-0">
      {!loaded || !character ? (
        <div className="text-center py-16">
          <h2 className="text-xl font-semibold text-text-secondary mb-2">
            Skill Optimizer
          </h2>
          <p className="text-text-muted">
            Load game data and character files in Settings to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-4 max-w-screen-lg">
          {/* Controls */}
          <div className="bg-bg-secondary rounded-lg p-4 space-y-3">
            {selectedSkill ? (
              <>
                <div className="flex flex-wrap items-end gap-4">
                  {/* Selected skill display */}
                  <div>
                    <div className="text-xs text-text-secondary mb-1">Selected Skill</div>
                    <div className="bg-bg-primary rounded px-3 py-2 text-sm font-medium">
                      {selectedSkill}
                    </div>
                  </div>

                  {currentSkill && (
                    <>
                      <div>
                        <div className="text-xs text-text-secondary mb-1">Current Level</div>
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
                      <button
                        onClick={runOptimization}
                        disabled={targetLevel <= currentSkill.Level}
                        className="bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded text-sm font-medium transition-colors"
                      >
                        Optimize
                      </button>
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
                        )}%
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
              </>
            ) : (
              <p className="text-text-muted text-sm">
                ← Select a skill from the panel on the left to get started.
              </p>
            )}
          </div>

          {/* Explanation notices for skills that can't be fully optimized */}
          {selectedSkill && currentSkill && skillDiagnostics && !result && (
            <div className="bg-bg-secondary rounded-lg p-4 text-sm space-y-2">
              {skillDiagnostics.unlocked.length === 0 ? (
                <p className="text-text-muted">
                  {skillDiagnostics.nextUnlockLevel !== null
                    ? <>No recipes unlock for <span className="text-text-primary font-medium">{selectedSkill}</span> until level <span className="text-accent font-medium">{skillDiagnostics.nextUnlockLevel}</span>. Keep leveling another way to unlock your first recipe.</>
                    : <>No recipes are available for <span className="text-text-primary font-medium">{selectedSkill}</span> at any level.</>
                  }
                </p>
              ) : skillDiagnostics.withXp.length === 0 ? (
                <p className="text-text-muted">
                  You have <span className="text-text-primary font-medium">{skillDiagnostics.unlocked.length}</span> unlocked recipe{skillDiagnostics.unlocked.length !== 1 ? "s" : ""} for <span className="text-text-primary font-medium">{selectedSkill}</span>, but none award skill XP.
                </p>
              ) : skillDiagnostics.withEffXp.length === 0 ? (
                <p className="text-text-muted">
                  All <span className="text-text-primary font-medium">{skillDiagnostics.withXp.length}</span> recipe{skillDiagnostics.withXp.length !== 1 ? "s" : ""} for <span className="text-text-primary font-medium">{selectedSkill}</span> have fully dropped off in XP at your current level ({currentSkill.Level}).
                  {skillDiagnostics.nextUnlockLevel !== null && (
                    <> New recipes unlock at level <span className="text-accent font-medium">{skillDiagnostics.nextUnlockLevel}</span>.</>
                  )}
                </p>
              ) : (
                <p className="text-text-muted">
                  Click <span className="text-text-primary font-medium">Optimize</span> to generate a leveling plan for <span className="text-text-primary font-medium">{selectedSkill}</span>.
                </p>
              )}
            </div>
          )}

          {result && result.steps.length === 0 && skillDiagnostics && (
            <div className="bg-bg-secondary rounded-lg p-4 text-sm">
              <p className="text-text-muted">
                No craftable steps were found to reach level <span className="text-accent font-medium">{targetLevel}</span>.{" "}
                {skillDiagnostics.withEffXp.length === 0
                  ? <>All recipes have fully dropped off in XP at your current level ({currentSkill?.Level}).{skillDiagnostics.nextUnlockLevel !== null && <> New recipes unlock at level <span className="text-accent font-medium">{skillDiagnostics.nextUnlockLevel}</span>.</>}</>
                  : <>There may not be enough recipes to bridge the gap to level {targetLevel}.</>
                }
              </p>
            </div>
          )}

          {result && result.steps.length > 0 && result.toLevel < targetLevel && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-200">
              ⚠ The optimizer could only plan a route to level <span className="font-medium">{result.toLevel}</span> — recipes needed for levels {result.toLevel}–{targetLevel} are not yet available at your current level.
              {skillDiagnostics?.nextUnlockLevel !== null && skillDiagnostics?.nextUnlockLevel !== undefined && skillDiagnostics.nextUnlockLevel > result.toLevel && (
                <> The next recipe unlocks at level <span className="font-medium">{skillDiagnostics.nextUnlockLevel}</span>.</>
              )}
            </div>
          )}

          {result && (
            <LevelingPlan result={result} getItemByCode={getItemByCode} />
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {sidebar}
      {mainContent}
    </>
  );
}
