/**
 * Floating action bar with Quick Cook, Recipe Hunter, and Plan Cooking buttons.
 * Displayed in the tab bar on every page. Uses useQuickCook to find the best
 * Gourmand meal/snack craftable from current inventory.
 * To add new quick-action buttons, append to the button list in the returned JSX.
 */
import { useState, useMemo } from "react";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useCharacterStore } from "../../stores/characterStore";
import { useNavStore } from "../../stores/navStore";
import { usePlannerStore } from "../../stores/plannerStore";
import { useQuickCook } from "../../hooks/useQuickCook";
import { useQuickCookAll } from "../../hooks/useQuickCookAll";
import { parseGourmandFoods } from "../../lib/parsers/gourmandParser";
import { RecipePlanner } from "../gourmand/RecipePlanner";

export function ActionBar() {
  const [showRecipeHunter, setShowRecipeHunter] = useState(false);

  const navigateToPlanner = useNavStore((s) => s.navigateToPlanner);
  const plannerEntries = usePlannerStore((s) => s.entries);
  const plannerCount = Object.keys(plannerEntries).length;

  const character = useCharacterStore((s) => s.character);
  const recipes = useGameDataStore((s) => s.recipes);
  const items = useGameDataStore((s) => s.items);
  const xpTables = useGameDataStore((s) => s.xpTables);
  const loaded = useGameDataStore((s) => s.loaded);

  const { meal: quickMeal, snack: quickSnack, handleQuickCook } = useQuickCook(navigateToPlanner);
  const { recipeCount: quickCookAllCount, handleQuickCookAll } = useQuickCookAll(navigateToPlanner);

  // Data needed for RecipePlanner modal
  const recipeByResultItem = useMemo(() => {
    const m = new Map<number, { InternalName: string }>();
    for (const r of recipes) {
      for (const ri of r.ResultItems) {
        if (!m.has(ri.ItemCode)) m.set(ri.ItemCode, r);
      }
    }
    return m;
  }, [recipes]);
  const recipeByName = useMemo(
    () => new Map(recipes.map((r) => [r.InternalName, r])),
    [recipes]
  );
  const foods = useMemo(
    () =>
      loaded && items.length > 0 && xpTables.length > 0
        ? parseGourmandFoods(items, xpTables, recipeByResultItem)
        : [],
    [loaded, items, xpTables, recipeByResultItem]
  );
  const completions = character?.RecipeCompletions ?? {};

  if (!character) return null;

  return (
    <>
      <div className="flex items-stretch gap-1.5 shrink-0 h-8">
        {/* Quick Cook — auto-select max recipes using all available ingredients */}
        {quickCookAllCount > 0 && (
          <button
            onClick={handleQuickCookAll}
            className="px-2.5 bg-success text-white rounded text-xs font-medium hover:bg-success/90 transition-colors flex items-center"
            title="Auto-queue known recipes to maximize ingredient usage from storage and vendors"
          >
            ⚡ Quick Cook
          </button>
        )}

        {/* Max Lvl Cook — picks best single meal + snack for Gourmand XP */}
        {(quickMeal || quickSnack) && (
          <button
            onClick={handleQuickCook}
            className="px-2.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent/90 transition-colors flex items-center"
            title="Queue the highest-level uneaten meal and snack you can cook right now"
          >
            ⚡ Max Lvl Cook
          </button>
        )}

        {/* Recipe Hunter */}
        <button
          onClick={() => setShowRecipeHunter(true)}
          className="px-2.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent/90 transition-colors flex items-center"
        >
          🔍 Recipe Hunter
        </button>

        {/* Plan Cooking */}
        <button
          onClick={navigateToPlanner}
          className="px-2.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent/90 transition-colors flex items-center gap-1"
        >
          🍳 Plan Cooking
          {plannerCount > 0 && (
            <span className="bg-white/20 px-1 py-0.5 rounded-full text-[10px]">{plannerCount}</span>
          )}
        </button>
      </div>

      {/* Recipe Hunter modal */}
      {showRecipeHunter && (
        <RecipePlanner
          foods={foods}
          completions={completions}
          recipeByName={recipeByName}
          onClose={() => setShowRecipeHunter(false)}
        />
      )}
    </>
  );
}
