/**
 * Sidebar for filtering recipes/foods by crafting skill. Lists all food-related
 * skills with recipe counts and character levels. Merges Fishing + Angling into
 * a single entry. Collapsible with a drag-to-resize handle.
 */
import { useMemo, useState, useCallback } from "react";
import { useNavStore } from "../../stores/navStore";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useCharacterStore } from "../../stores/characterStore";
import { FOOD_SKILLS, MERGED_FISHING, formatSkillName } from "../../lib/foodSkills";

const SIDEBAR_MIN = 140;
const SIDEBAR_MAX = 360;

export function SkillSidebar() {
  const selectedSkill = useNavStore((s) => s.selectedSkill);
  const setSelectedSkill = useNavStore((s) => s.setSelectedSkill);
  const skillSidebarOpen = useNavStore((s) => s.skillSidebarOpen);
  const toggleSkillSidebar = useNavStore((s) => s.toggleSkillSidebar);

  const [sidebarWidth, setSidebarWidth] = useState(208);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;

    function onMove(ev: MouseEvent) {
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + ev.clientX - startX)));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);

  const recipes = useGameDataStore((s) => s.recipes);
  const loaded = useGameDataStore((s) => s.loaded);
  const character = useCharacterStore((s) => s.character);

  // Combine Fishing + Angling into a single "Fishing" sidebar entry
  const skillList = useMemo(() => {
    const s = new Set(
      recipes
        .filter((r) => FOOD_SKILLS.has(r.Skill))
        .map((r) => (MERGED_FISHING.has(r.Skill) ? "Fishing" : r.Skill))
    );
    return Array.from(s).sort();
  }, [recipes]);

  const completions = character?.RecipeCompletions ?? {};

  // "All" counts: all food-skill recipes
  const allFoodRecipes = useMemo(
    () => recipes.filter((r) => FOOD_SKILLS.has(r.Skill)),
    [recipes]
  );
  const allKnown = useMemo(
    () => allFoodRecipes.filter((r) => r.InternalName in completions).length,
    [allFoodRecipes, completions]
  );

  return (
    <aside
      className={`flex-shrink-0 flex flex-col border-r border-border bg-bg-secondary overflow-hidden relative ${
        skillSidebarOpen ? "" : "w-10"
      }`}
      style={skillSidebarOpen ? { width: sidebarWidth } : undefined}
    >
      {skillSidebarOpen ? (
        <>
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Skills
            </span>
            <button
              onClick={toggleSkillSidebar}
              title="Collapse sidebar"
              className="text-text-muted hover:text-text-primary p-0.5 rounded transition-colors"
            >
              ◀
            </button>
          </div>

          {!loaded ? (
            <div className="p-3 text-xs text-text-muted">Load data in Settings</div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* All item */}
              <button
                onClick={() => setSelectedSkill("")}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-bg-primary transition-colors ${
                  selectedSkill === ""
                    ? "bg-accent/10 text-accent border-l-2 border-accent"
                    : "text-text-primary border-l-2 border-transparent"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">All</span>
                </div>
                {character && (
                  <div className="text-xs text-text-muted mt-0.5">
                    {allKnown}/{allFoodRecipes.length} recipes
                  </div>
                )}
              </button>

              {/* Per-skill items */}
              {skillList.map((name) => {
                const matchSkills = name === "Fishing" ? MERGED_FISHING : new Set([name]);
                const skillRecipes = recipes.filter((r) => matchSkills.has(r.Skill));
                const knownInSkill = skillRecipes.filter(
                  (r) => r.InternalName in completions
                ).length;
                // For merged Fishing, show the higher of the two levels
                const level = name === "Fishing"
                  ? Math.max(character?.Skills["Fishing"]?.Level ?? 0, character?.Skills["Angling"]?.Level ?? 0) || undefined
                  : character?.Skills[name]?.Level;
                return (
                  <button
                    key={name}
                    onClick={() => setSelectedSkill(name)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-bg-primary transition-colors ${
                      selectedSkill === name
                        ? "bg-accent/10 text-accent border-l-2 border-accent"
                        : "text-text-primary border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{name === "Fishing" ? "Fishing / Angling" : formatSkillName(name)}</span>
                      {level !== undefined && (
                        <span className="text-xs text-text-muted shrink-0">{level}</span>
                      )}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {knownInSkill}/{skillRecipes.length} recipes
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Drag handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/40 active:bg-accent/60 transition-colors"
            onMouseDown={onResizeStart}
          />
        </>
      ) : (
        <button
          onClick={toggleSkillSidebar}
          title="Expand skills"
          className="flex-1 flex items-start justify-center pt-3 text-text-muted hover:text-text-primary transition-colors"
        >
          ▶
        </button>
      )}
    </aside>
  );
}
