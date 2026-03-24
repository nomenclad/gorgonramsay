import { useState, useMemo } from "react";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { usePlannerStore } from "../../stores/plannerStore";
import { getAllAreaZones } from "../../lib/vaultResolver";
import {
  resolveIngredients,
  buildRawMaterials,
  buildGatheringRoute,
  buildGardenItemSet,
  type CraftingStep,
  type RawMaterial,
  type GatheringRoute,
} from "./plannerUtils";
import { StorageTab } from "./StorageTab";
import { GardeningTab } from "./GardeningTab";
import { ForagingTab } from "./ForagingTab";
import { PurchasingTab } from "./PurchasingTab";
import { CookingTab } from "./CookingTab";
import { RouteTab } from "./RouteTab";
import { getAcquisitionMethods } from "../../lib/sourceResolver";
import type { Recipe } from "../../types/recipe";

type SubTab = "storage" | "gardening" | "foraging" | "purchasing" | "cooking" | "route";

export function CookingPlannerPage() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("storage");

  // Stores
  const entries = usePlannerStore((s) => s.entries);
  const gardeningZone = usePlannerStore((s) => s.gardeningZone);
  const cookingZone = usePlannerStore((s) => s.cookingZone);
  const setGardeningZone = usePlannerStore((s) => s.setGardeningZone);
  const setCookingZone = usePlannerStore((s) => s.setCookingZone);
  const clearAll = usePlannerStore((s) => s.clearAll);

  const recipes = useGameDataStore((s) => s.recipes);
  const items = useGameDataStore((s) => s.items);
  const recipeIndexes = useGameDataStore((s) => s.recipeIndexes);
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const loaded = useGameDataStore((s) => s.loaded);
  const fmtVault = useGameDataStore((s) => s.formatVaultName);

  const getItemQuantity = useInventoryStore((s) => s.getItemQuantity);
  const getItemLocations = useInventoryStore((s) => s.getItemLocations);

  const allZones = useMemo(() => getAllAreaZones(), [loaded]);


  // Resolve planned recipes → full Recipe objects with quantities
  const plannedRecipes = useMemo(() => {
    if (!loaded || recipes.length === 0) return [];
    const recipeMap = new Map(recipes.map((r) => [r.id, r]));
    const result: { recipe: Recipe; quantity: number }[] = [];
    for (const entry of Object.values(entries)) {
      const recipe = recipeMap.get(entry.recipeId);
      if (recipe) {
        result.push({ recipe, quantity: entry.quantity });
      }
    }
    result.sort((a, b) => a.recipe.Skill.localeCompare(b.recipe.Skill) || a.recipe.SkillLevelReq - b.recipe.SkillLevelReq);
    return result;
  }, [entries, recipes, loaded]);

  // Aggregate direct ingredient totals
  const directTotals = useMemo(() => {
    const totals = new Map<number, number>();
    for (const pr of plannedRecipes) {
      for (const ing of pr.recipe.Ingredients) {
        totals.set(ing.ItemCode, (totals.get(ing.ItemCode) ?? 0) + ing.StackSize * pr.quantity);
      }
    }
    return totals;
  }, [plannedRecipes]);

  // Resolve crafting chains
  const { rawItems, stepsMap } = useMemo(
    () => resolveIngredients(directTotals, recipeIndexes, getItemByCode, getItemQuantity),
    [directTotals, recipeIndexes, getItemByCode, getItemQuantity]
  );

  const rawMaterials: RawMaterial[] = useMemo(
    () => buildRawMaterials(rawItems, getItemQuantity, recipeIndexes),
    [rawItems, getItemQuantity, recipeIndexes]
  );

  const craftingSteps: CraftingStep[] = useMemo(
    () =>
      Array.from(stepsMap.values()).sort(
        (a, b) => a.levelReq - b.levelReq || a.recipeName.localeCompare(b.recipeName)
      ),
    [stepsMap]
  );

  const gardeningSteps = useMemo(
    () => craftingSteps.filter((s) => s.skill === "Gardening"),
    [craftingSteps]
  );

  const gatheringRoute: GatheringRoute = useMemo(
    () =>
      plannedRecipes.length === 0
        ? { zoneStops: [], stillNeeded: [] }
        : buildGatheringRoute(rawMaterials, getItemLocations, fmtVault, cookingZone),
    [plannedRecipes, rawMaterials, getItemLocations, fmtVault, cookingZone]
  );

  // Identify garden-growable items and split stillNeeded into garden vs forage
  const gardenItemSet = useMemo(
    () => buildGardenItemSet(recipeIndexes, items),
    [recipeIndexes, items]
  );

  const { gardenNeeded, purchaseNeeded, forageNeeded } = useMemo(() => {
    const gardenNeeded = gatheringRoute.stillNeeded.filter((i) => gardenItemSet.has(i.itemCode));
    const nonGarden = gatheringRoute.stillNeeded.filter((i) => !gardenItemSet.has(i.itemCode));
    const purchaseNeeded = nonGarden.filter((i) =>
      getAcquisitionMethods(i.itemCode, 0).some((m) => m.kind === "vendor")
    );
    const purchaseSet = new Set(purchaseNeeded.map((i) => i.itemCode));
    const forageNeeded = nonGarden.filter((i) => !purchaseSet.has(i.itemCode));
    return { gardenNeeded, purchaseNeeded, forageNeeded };
  }, [gatheringRoute.stillNeeded, gardenItemSet]);

  const entryCount = Object.keys(entries).length;

  const subTabs: { key: SubTab; label: string; badge?: number }[] = [
    { key: "storage", label: "Storage", badge: gatheringRoute.zoneStops.length },
    { key: "gardening", label: "Gardening", badge: gardeningSteps.length + gardenNeeded.length },
    { key: "foraging", label: "Foraging", badge: forageNeeded.length },
    { key: "purchasing", label: "Purchasing", badge: purchaseNeeded.length },
    { key: "cooking", label: "Cooking", badge: plannedRecipes.length },
    { key: "route", label: "Route" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">Cooking Planner</h2>
          {entryCount > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-error hover:text-error/80 border border-error/30 hover:border-error/50 px-2 py-1 rounded transition-colors"
          >
            Clear All ({entryCount})
          </button>
        )}
        </div>
        <p className="text-sm text-text-muted mt-1">
          Your queued recipes broken down into storage runs, gardening, foraging, purchasing, and cooking steps.
        </p>
      </div>

      {/* Empty state */}
      {entryCount === 0 && (
        <div className="text-center py-16 text-text-muted">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-sm">
            No recipes planned yet.
          </p>
          <p className="text-xs mt-1">
            Star recipes on the <strong>Recipes</strong> tab or check foods on the <strong>Gourmand</strong> tab to start planning.
          </p>
        </div>
      )}

      {/* Active planner */}
      {entryCount > 0 && (
        <>
          {/* Zone selectors */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-text-secondary">Gardening Zone:</span>
              <select
                value={gardeningZone}
                onChange={(e) => setGardeningZone(e.target.value)}
                className="bg-bg-secondary border border-border rounded px-2 py-1 text-sm text-text-primary"
              >
                <option value="">Select zone…</option>
                {allZones.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-text-secondary">Cooking Zone:</span>
              <select
                value={cookingZone}
                onChange={(e) => setCookingZone(e.target.value)}
                className="bg-bg-secondary border border-border rounded px-2 py-1 text-sm text-text-primary"
              >
                <option value="">Select zone…</option>
                {allZones.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Sub-tab bar */}
          <div className="flex gap-1 bg-bg-secondary rounded-lg p-1">
            {subTabs.map(({ key, label, badge }) => (
              <button
                key={key}
                onClick={() => setActiveSubTab(key)}
                className={`px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-1.5 ${
                  activeSubTab === key
                    ? "bg-accent text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {label}
                {badge != null && badge > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeSubTab === key ? "bg-white/20" : "bg-bg-primary text-text-muted"
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Sub-tab content */}
          <div>
            {activeSubTab === "storage" && (
              <StorageTab gatheringRoute={gatheringRoute} cookingZone={cookingZone} />
            )}
            {activeSubTab === "gardening" && (
              <GardeningTab gardeningSteps={gardeningSteps} gardeningZone={gardeningZone} gardenNeeded={gardenNeeded} />
            )}
            {activeSubTab === "foraging" && (
              <ForagingTab stillNeeded={forageNeeded} />
            )}
            {activeSubTab === "purchasing" && (
              <PurchasingTab purchaseNeeded={purchaseNeeded} cookingZone={cookingZone} />
            )}
            {activeSubTab === "cooking" && (
              <CookingTab
                plannedRecipes={plannedRecipes}
                craftingSteps={craftingSteps}
              />
            )}
            {activeSubTab === "route" && (
              <RouteTab
                gatheringRoute={gatheringRoute}
                gardeningSteps={gardeningSteps}
                cookingSteps={craftingSteps}
                plannedRecipes={plannedRecipes}
                stillNeeded={forageNeeded}
                gardenNeeded={gardenNeeded}
                purchaseNeeded={purchaseNeeded}
                gardeningZone={gardeningZone}
                cookingZone={cookingZone}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
