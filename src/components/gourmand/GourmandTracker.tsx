/**
 * Gourmand tab: tracks which foods grant first-time Gourmand XP. Displays a
 * filterable/sortable table of all foods with eaten status, craft readiness, and
 * recipe source info. Supports planner integration (star/unstar recipes).
 * To add new filter dimensions, extend the preStatusFiltered pipeline.
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useCharacterStore } from "../../stores/characterStore";
import { parseGourmandFoods, type FoodItem } from "../../lib/parsers/gourmandParser";
import { getRecipeSourceLabels, type RecipeSourceLabel } from "../../lib/sourceResolver";
import { ContextMenu, wikiUrl, openInBrowser } from "../common/ContextMenu";
import { useNavStore } from "../../stores/navStore";
import { FOOD_SKILLS, formatSkillName } from "../../lib/foodSkills";
import { usePlannerStore } from "../../stores/plannerStore";
import { useResizableColumns } from "../../hooks/useResizableColumns";
import { Pagination } from "../common/Pagination";
import { ResizableTh, SortableResizableTh, FilterableResizableTh } from "../common/ResizableTh";
import { useColumnFilters } from "../../hooks/useColumnFilters";
import { DEFAULT_PAGE_SIZE } from "../../lib/config";

type CategoryFilter = "all" | "meal" | "snack";
type SourceTypeFilter = "all" | "foraged" | "crafted";
type SortKey = "name" | "gourmandLvl" | "xp" | "qty" | "status" | "cancraft";
type SortDir = "asc" | "desc";

export function GourmandTracker() {
  const items = useGameDataStore((s) => s.items);
  const xpTables = useGameDataStore((s) => s.xpTables);
  const recipes = useGameDataStore((s) => s.recipes);
  const loaded = useGameDataStore((s) => s.loaded);
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const fmtVault = useGameDataStore((s) => s.formatVaultName);
  const getItemQuantity = useInventoryStore((s) => s.getItemQuantity);
  const getItemLocations = useInventoryStore((s) => s.getItemLocations);
  const recipeIndexes = useGameDataStore((s) => s.recipeIndexes);
  const character = useCharacterStore((s) => s.character);

  const aggregated = useInventoryStore((s) => s.aggregated);
  const navigateToCraft = useNavStore((s) => s.navigateToCraft);
  const selectedSkill = useNavStore((s) => s.selectedSkill);

  // Planner store
  const plannerEntries = usePlannerStore((s) => s.entries);
  const starRecipe = usePlannerStore((s) => s.starRecipe);
  const unstarRecipe = usePlannerStore((s) => s.unstarRecipe);
  const setRecipeQty = usePlannerStore((s) => s.setQuantity);
  const [ingCtxMenu, setIngCtxMenu] = useState<{ x: number; y: number; name: string } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; name: string; isCrafted?: boolean } | null>(null);
  const handleContextMenu = useCallback((e: React.MouseEvent, name: string, isCrafted: boolean) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, name, isCrafted });
  }, []);

  const [filterUneaten, setFilterUneaten] = useState(false);
  const [sourceTypeFilter, setSourceTypeFilter] = useState<SourceTypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [filterLearnable, setFilterLearnable] = useState(false);
  const [filterKnown, setFilterKnown] = useState(false);
  const [filterIngredients, setFilterIngredients] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("gourmandLvl");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const { widths: colW, startResize } = useResizableColumns("gourmand-v5", [40, 55, 200, 100, 70, 90, 110, 90, 70, 120, 160, 200]);
  const colFilters = useColumnFilters();

  const gourmandSkill = character?.Skills["Gourmand"];
  const gourmandLevel = gourmandSkill?.Level ?? 0;
  const completions = character?.RecipeCompletions ?? {};

  // Map: ItemCode -> first recipe that produces it.
  // Used to link food items to their crafting recipe (for "eaten" vs "recipe known" checks).
  // "Eaten" = the item's InternalName appears in completions (the food was consumed).
  // "Recipe known" = the recipe's InternalName appears in completions (the recipe was crafted at least once).
  const recipeByResultItem = useMemo(() => {
    const m = new Map<number, { InternalName: string }>();
    for (const r of recipes) {
      for (const ri of r.ResultItems) {
        if (!m.has(ri.ItemCode)) m.set(ri.ItemCode, r);
      }
    }
    return m;
  }, [recipes]);

  // Map from recipe InternalName → full Recipe object (for level/skill lookup and source labels)
  const recipeByName = useMemo(
    () => new Map(recipes.map((r) => [r.InternalName, r])),
    [recipes]
  );

  // Parse foods from items + xpTables
  const isFae = character?.Race?.toLowerCase() === "fae";
  const foods = useMemo(() => {
    const all = parseGourmandFoods(items, xpTables, recipeByResultItem);
    if (isFae) return all;
    // Filter out Fae-only foods for non-Fae characters
    return all.filter((f) => !f.itemName.startsWith("Fairy "));
  }, [items, xpTables, recipeByResultItem, isFae]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  }

  // Category counts
  const mealCount = useMemo(
    () => foods.filter((f) => f.foodType.toLowerCase().includes("meal")).length,
    [foods]
  );
  const snackCount = useMemo(
    () => foods.filter((f) => f.foodType.toLowerCase().includes("snack")).length,
    [foods]
  );

  // Global counts for the stat cards (unaffected by any active filter)
  const uneatenCount = useMemo(
    () => foods.filter((f) => !(f.internalName in completions)).length,
    [foods, completions]
  );
  const ownedUneatenCount = useMemo(
    () => foods.filter(
      (f) => !(f.internalName in completions) && getItemQuantity(f.itemCode) > 0
    ).length,
    [foods, completions, getItemQuantity, aggregated]
  );

  // Helper: check if all recipe ingredients are in inventory
  const hasAllIngredients = (food: FoodItem) => {
    const recipe = recipeByName.get(food.recipeInternalName!);
    if (!recipe) return false;
    return recipe.Ingredients.every((ing) => getItemQuantity(ing.ItemCode) >= ing.StackSize);
  };

  // Craft rank system: determines how "ready" a food is to be crafted.
  // 0 = fully craftable (recipe known + all ingredients in inventory)
  // 1 = partially ready (recipe known but missing items, OR recipe unknown but skill is high enough)
  // 2 = skill too low to learn the recipe
  // 3 = no recipe exists (raw/foraged food)
  const getCraftRank = (food: FoodItem): number => {
    if (!food.hasTracking) return 3;
    const recipe = recipeByName.get(food.recipeInternalName!);
    if (!recipe) return 3;
    const skillLevel = character?.Skills[recipe.Skill]?.Level ?? 0;
    if (skillLevel < recipe.SkillLevelReq) return 2;
    const isKnown = food.recipeInternalName! in completions;
    if (!isKnown) return 1;
    if (!hasAllIngredients(food)) return 1;
    return 0;
  };

  // Filter pipeline step 1: preStatusFiltered applies skill, category, search, source type,
  // and toggle filters (learnable/known/ingredients). The uneaten filter is applied separately
  // in the next step so that badge counts on the uneaten button reflect the pre-uneaten total.
  // Pipeline: foods -> preStatusFiltered -> filtered (adds uneaten + column filters) -> paginated
  const preStatusFiltered = useMemo(() => {
    let results = foods;

    // Filter by global selected skill
    if (selectedSkill) {
      results = results.filter((f) => {
        const sk = recipeByName.get(f.recipeInternalName!)?.Skill;
        if (!sk) return false;
        return sk === selectedSkill;
      });
    }

    // Category filter
    if (categoryFilter === "meal") {
      results = results.filter((f) => f.foodType.toLowerCase().includes("meal"));
    } else if (categoryFilter === "snack") {
      results = results.filter((f) => f.foodType.toLowerCase().includes("snack"));
    }

    // Search
    if (search) {
      const term = search.toLowerCase();
      results = results.filter(
        (f) =>
          f.itemName.toLowerCase().includes(term) ||
          f.foodType.toLowerCase().includes(term)
      );
    }

    // Source type filter (foraged vs crafted)
    if (sourceTypeFilter === "foraged") {
      results = results.filter((f) => !f.hasTracking);
    } else if (sourceTypeFilter === "crafted") {
      results = results.filter((f) => f.hasTracking);
    }

    // Toggle filters
    if (filterLearnable && character) {
      results = results.filter((f) => {
        if (!f.hasTracking) return false;
        // Must not already be known
        if (f.recipeInternalName! in completions) return false;
        const recipe = recipeByName.get(f.recipeInternalName!);
        if (!recipe) return false;
        return (character.Skills[recipe.Skill]?.Level ?? 0) >= recipe.SkillLevelReq;
      });
    }
    if (filterKnown) {
      results = results.filter((f) => f.hasTracking && f.recipeInternalName! in completions);
    }
    if (filterIngredients) {
      results = results.filter((f) => f.hasTracking && hasAllIngredients(f));
    }

    return results;
  }, [
    foods, selectedSkill, categoryFilter, search, sourceTypeFilter,
    filterLearnable, filterKnown, filterIngredients,
    completions, getItemQuantity, character, recipeByName,
  ]);

  // Badge counts for the status filter buttons — reflects current skill/category/etc. filters
  const filteredUneatenCount = useMemo(
    () => preStatusFiltered.filter((f) => !(f.internalName in completions)).length,
    [preStatusFiltered, completions]
  );

  // Unique filter options for column dropdowns
  const canCraftLabel = useCallback((food: FoodItem): string => {
    const recipe = recipeByName.get(food.recipeInternalName!);
    if (!recipe) return "No recipe";
    if (!character) return "Unknown";
    const skillLvl = character.Skills[recipe.Skill]?.Level ?? 0;
    if (skillLvl < recipe.SkillLevelReq) return "Skill Too Low";
    if (!(recipe.InternalName in completions)) return "Learn First";
    if (hasAllIngredients(food)) return "Yes";
    return "Missing Items";
  }, [recipeByName, character, completions, hasAllIngredients]);

  const canCraftOptions = useMemo(
    () => [...new Set(preStatusFiltered.map((f) => canCraftLabel(f)))].sort(),
    [preStatusFiltered, canCraftLabel]
  );
  const eatenOptions = ["Yes", "No"];
  const getFoodSkill = useCallback((food: FoodItem): string => {
    const recipe = recipeByName.get(food.recipeInternalName!);
    return recipe ? formatSkillName(recipe.Skill) : "—";
  }, [recipeByName]);

  const skillOptions = useMemo(
    () => [...new Set(preStatusFiltered.map((f) => getFoodSkill(f)).filter((s) => s !== "—"))].sort(),
    [preStatusFiltered, getFoodSkill]
  );

  // Readiness states for the Status column:
  // "Ready to Eat" = not yet eaten AND the item is in the player's inventory
  // "Eaten" = the food's recipe InternalName exists in completions (already consumed for XP)
  // "Not in Inventory" = not eaten and not currently held
  const getReadiness = useCallback((food: FoodItem): string => {
    const isEaten = food.internalName in completions;
    const qty = getItemQuantity(food.itemCode);
    if (!isEaten && qty > 0) return "Ready to Eat";
    if (isEaten) return "Eaten";
    return "Not in Inventory";
  }, [completions, getItemQuantity]);

  const readinessOptions = ["Ready to Eat", "Not in Inventory", "Eaten"];

  const filtered = useMemo(() => {
    let results = preStatusFiltered;

    // Apply uneaten filter
    if (filterUneaten) {
      results = results.filter((f) => !(f.internalName in completions));
    }

    // Column dropdown filters
    if (colFilters.isFiltered("cancraft")) {
      results = results.filter((f) => colFilters.passesFilter("cancraft", canCraftLabel(f)));
    }
    if (colFilters.isFiltered("eaten")) {
      results = results.filter((f) => {
        const eaten = f.internalName in completions ? "Yes" : "No";
        return colFilters.passesFilter("eaten", eaten);
      });
    }
    if (colFilters.isFiltered("foodType")) {
      results = results.filter((f) => colFilters.passesFilter("foodType", f.foodType));
    }
    if (colFilters.isFiltered("readiness")) {
      results = results.filter((f) => colFilters.passesFilter("readiness", getReadiness(f)));
    }
    if (colFilters.isFiltered("skill")) {
      results = results.filter((f) => colFilters.passesFilter("skill", getFoodSkill(f)));
    }

    return [...results].sort((a, b) => {
      let diff = 0;
      if (sortKey === "name") diff = a.itemName.localeCompare(b.itemName);
      else if (sortKey === "gourmandLvl") diff = (a.foodLevel ?? 0) - (b.foodLevel ?? 0);
      else if (sortKey === "xp") diff = a.gourmandXp - b.gourmandXp;
      else if (sortKey === "qty") diff = getItemQuantity(a.itemCode) - getItemQuantity(b.itemCode);
      else if (sortKey === "status") {
        const rank = (f: typeof a) => {
          if (!f.hasTracking) return 2;
          return f.internalName in completions ? 0 : 1;
        };
        diff = rank(a) - rank(b);
      }
      else if (sortKey === "cancraft") {
        diff = getCraftRank(a) - getCraftRank(b);
      }
      return sortDir === "asc" ? diff : -diff;
    });
  }, [preStatusFiltered, filterUneaten, sortKey, sortDir, completions, getItemQuantity, aggregated, colFilters, canCraftLabel, getFoodSkill, getReadiness]);

  // Reset page when filters change the result set
  useEffect(() => { setPage(0); }, [filtered.length]);

  if (!loaded) {
    return (
      <div className="text-center py-12 text-text-muted">
        Load game data in Settings to use the Gourmand Tracker.
      </div>
    );
  }

  if (foods.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted">
        No food data found. Try re-downloading game data in Settings.
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full">
      <div>
        <h2 className="text-xl font-semibold">Gourmand Tracker</h2>
        <p className="text-sm text-text-muted mt-1">
          Track which foods grant first-time Gourmand XP — eat them for the bonus!
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Gourmand Level" value={gourmandLevel.toString()} />
        <StatCard label="Total Foods" value={foods.length.toString()} />
        <StatCard label="Uneaten (tracked)" value={uneatenCount.toString()} highlight={uneatenCount > 0} />
        <StatCard label="Ready to Eat" value={ownedUneatenCount.toString()} highlight={ownedUneatenCount > 0} success />
      </div>

      {/* All filters on one row */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Category: All / Meals / Snacks */}
        <div className="flex gap-1 bg-bg-secondary rounded-lg p-1">
          {(
            [
              { key: "all" as const, label: `All (${foods.length})` },
              { key: "meal" as const, label: `Meals (${mealCount})` },
              { key: "snack" as const, label: `Snacks (${snackCount})` },
            ]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setCategoryFilter(key)}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                categoryFilter === key
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Source type: All / Crafted / Foraged/Raw */}
        <div className="flex gap-1 bg-bg-secondary rounded-lg p-1">
          {(["all", "crafted", "foraged"] as SourceTypeFilter[]).map((k) => (
            <button
              key={k}
              onClick={() => setSourceTypeFilter(k)}
              className={`px-3 py-1.5 rounded text-sm transition-colors capitalize ${
                sourceTypeFilter === k
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {k === "all" ? "All" : k === "crafted" ? "Crafted" : "Foraged / Raw"}
            </button>
          ))}
        </div>

        {/* Toggle filter chips */}
        {character && (
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { key: "uneaten",    label: `Uneaten (${filteredUneatenCount})`, active: filterUneaten,     set: setFilterUneaten },
                { key: "learnable",  label: "Learnable Now", active: filterLearnable,  set: setFilterLearnable },
                { key: "known",      label: "Recipe Known",  active: filterKnown,      set: setFilterKnown },
                { key: "ingr",       label: "On Hand",       active: filterIngredients, set: setFilterIngredients },
              ] as const
            ).map(({ key, label, active, set }) => (
              <button
                key={key}
                onClick={() => set((v) => !v)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? "bg-accent/20 border-accent text-accent"
                    : "bg-bg-secondary border-border text-text-secondary hover:text-text-primary"
                }`}
              >
                {active ? "✓ " : ""}{label}
              </button>
            ))}
          </div>
        )}

        <input
          type="text"
          placeholder="Search foods…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-bg-secondary border border-border rounded px-3 py-1.5 text-sm text-text-primary flex-1 min-w-36"
        />
        <span className="text-xs text-text-muted">{filtered.length} shown</span>
      </div>

      <Pagination page={page} totalItems={filtered.length} pageSize={DEFAULT_PAGE_SIZE} onPageChange={setPage} />

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="text-sm" style={{ tableLayout: "fixed", width: colW.reduce((a, b) => a + b, 0) }}>
          <thead>
            <tr className="border-b border-border text-left text-text-secondary text-xs">
              <ResizableTh width={colW[0]} onStartResize={(x) => startResize(0, x)}>Craft</ResizableTh>
              <ResizableTh width={colW[1]} onStartResize={(x) => startResize(1, x)}>Qty</ResizableTh>
              <SortableResizableTh label="Food" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width={colW[2]} onStartResize={(x) => startResize(2, x)} />
              <SortableResizableTh label="Gourmand Lvl" col="gourmandLvl" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right width={colW[3]} onStartResize={(x) => startResize(3, x)} />
              <SortableResizableTh label="Qty" col="qty" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right width={colW[4]} onStartResize={(x) => startResize(4, x)} />
              <FilterableResizableTh label="Status" width={colW[5]} onStartResize={(x) => startResize(5, x)}
                filterOptions={readinessOptions} filterSelected={colFilters.filters["readiness"] ?? new Set()} onFilterChange={(s) => colFilters.setFilter("readiness", s)} />
              <FilterableResizableTh label="Skill" width={colW[6]} onStartResize={(x) => startResize(6, x)}
                filterOptions={skillOptions} filterSelected={colFilters.filters["skill"] ?? new Set()} onFilterChange={(s) => colFilters.setFilter("skill", s)} />
              <SortableResizableTh label="Can Craft" col="cancraft" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width={colW[7]} onStartResize={(x) => startResize(7, x)}
                filterOptions={canCraftOptions} filterSelected={colFilters.filters["cancraft"] ?? new Set()} onFilterChange={(s) => colFilters.setFilter("cancraft", s)} />
              <FilterableResizableTh label="Eaten?" width={colW[8]} onStartResize={(x) => startResize(8, x)}
                filterOptions={eatenOptions} filterSelected={colFilters.filters["eaten"] ?? new Set()} onFilterChange={(s) => colFilters.setFilter("eaten", s)} />
              <SortableResizableTh label="Recipe" col="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width={colW[9]} onStartResize={(x) => startResize(9, x)} />
              <ResizableTh width={colW[10]} onStartResize={(x) => startResize(10, x)}>Recipe Source</ResizableTh>
              <ResizableTh width={colW[11]} onStartResize={(x) => startResize(11, x)}>Effects</ResizableTh>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(page * DEFAULT_PAGE_SIZE, (page + 1) * DEFAULT_PAGE_SIZE).map((food) => {
              const qty = getItemQuantity(food.itemCode);
              const eaten = food.internalName in completions;
              const recipe = recipeByName.get(food.recipeInternalName!);
              const sourceLabels = recipe
                ? getRecipeSourceLabels(recipe.id, getItemByCode)
                : [];
              const locations = qty > 0 ? getItemLocations(food.itemCode) : [];

              // Compute can-craft badge
              const craftRank = getCraftRank(food);
              let canCraftBadge: React.ReactNode = <span className="text-text-muted text-xs">—</span>;
              if (food.hasTracking) {
                if (craftRank === 0) {
                  canCraftBadge = <span className="text-xs bg-success/10 text-success px-1.5 py-0.5 rounded font-medium">Yes</span>;
                } else if (craftRank === 1) {
                  const isKnown = food.recipeInternalName! in completions;
                  if (isKnown && recipe) {
                    // has recipe + skill + known but missing items
                    canCraftBadge = <span className="text-xs bg-amber-400/10 text-amber-400 px-1.5 py-0.5 rounded font-medium">Missing Items</span>;
                  } else {
                    // has recipe + skill but not known
                    canCraftBadge = <span className="text-xs bg-bg-secondary text-text-muted px-1.5 py-0.5 rounded font-medium">Learn First</span>;
                  }
                } else if (craftRank === 2) {
                  canCraftBadge = <span className="text-xs bg-error/10 text-error px-1.5 py-0.5 rounded font-medium">Skill Too Low</span>;
                }
              }

              // Build ingredient list for recipe hover tooltip
              const ingredientTooltip = recipe ? (
                <span className="absolute hidden group-hover:block z-20 bg-bg-secondary border border-border rounded p-2 text-xs whitespace-nowrap -top-8 left-0 min-w-24">
                  {recipe.Ingredients.map((ing) => {
                    const ingItem = getItemByCode(ing.ItemCode);
                    const ingName = ingItem?.Name ?? `#${ing.ItemCode}`;
                    const have = getItemQuantity(ing.ItemCode);
                    const ingIsCraftable = recipeIndexes?.byResultItem.get(ing.ItemCode)?.some(r => FOOD_SKILLS.has(r.Skill)) ?? false;
                    const colorClass = have >= ing.StackSize ? "text-success" : have > 0 ? "text-amber-400" : "text-error";
                    return (
                      <div
                        key={ing.ItemCode}
                        className={`${colorClass} ${ingIsCraftable ? "cursor-context-menu underline decoration-dotted" : ""}`}
                        onContextMenu={ingIsCraftable ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIngCtxMenu({ x: e.clientX, y: e.clientY, name: ingName });
                        } : undefined}
                      >
                        {ingName} ×{ing.StackSize} (have {have})
                      </div>
                    );
                  })}
                </span>
              ) : null;

              return (
                <tr
                  key={food.itemCode}
                  onContextMenu={(e) => handleContextMenu(e, food.itemName, food.hasTracking)}
                  className={`border-b border-border/50 hover:bg-bg-secondary/50 cursor-context-menu ${
                    ""
                  }`}
                >
                  {/* Star cell */}
                  <td className="py-1 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                    {recipe && (
                      <button
                        onClick={() =>
                          recipe.id in plannerEntries
                            ? unstarRecipe(recipe.id)
                            : starRecipe(recipe.id, recipe.InternalName, 1)
                        }
                        className={`text-lg leading-none ${
                          recipe.id in plannerEntries ? "text-gold" : "text-text-muted hover:text-gold/60"
                        }`}
                        title={recipe.id in plannerEntries ? "Remove from queue" : "Add to queue"}
                      >
                        {recipe.id in plannerEntries ? "★" : "☆"}
                      </button>
                    )}
                  </td>
                  {/* Qty cell */}
                  <td className="py-1 px-1" onClick={(e) => e.stopPropagation()}>
                    {recipe && recipe.id in plannerEntries && (
                      <input
                        type="number"
                        min={1}
                        value={plannerEntries[recipe.id]?.quantity ?? 1}
                        onChange={(e) => setRecipeQty(recipe.id, Math.max(1, Number(e.target.value)))}
                        className="qty-input w-full bg-bg-primary border border-accent/40 rounded px-1.5 py-1 text-sm text-center text-text-primary"
                      />
                    )}
                  </td>
                  <td className="py-2 px-3 font-medium">
                    <div>{food.itemName}</div>
                    <div className="text-xs text-text-muted">{food.foodType}</div>
                    {locations.length > 0 && (
                      <div className="text-xs text-accent mt-0.5">
                        📦 {locations.map((l) => `${fmtVault(l.vault)} (${l.quantity})`).join(", ")}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="font-medium">{food.foodLevel}</div>
                    <div className="text-xs text-text-muted">+{food.gourmandXp.toLocaleString()} XP</div>
                  </td>
                  <td className="py-2 px-3 text-right">
                    {qty > 0 ? (
                      <span className="text-success font-medium">{qty}</span>
                    ) : (
                      <span className="text-text-muted">0</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {(() => {
                      const readiness = getReadiness(food);
                      if (readiness === "Ready to Eat") return <span className="text-xs bg-success/10 text-success px-1.5 py-0.5 rounded font-medium">Ready to Eat</span>;
                      if (readiness === "Eaten") return <span className="text-xs text-text-muted">Eaten</span>;
                      return <span className="text-xs text-text-muted">Not in Inventory</span>;
                    })()}
                  </td>
                  <td className="py-2 px-3 text-xs text-text-secondary">
                    {recipe ? formatSkillName(recipe.Skill) : "—"}
                  </td>
                  <td className="py-2 px-3">
                    {canCraftBadge}
                  </td>
                  <td className="py-2 px-3">
                    {eaten ? (
                      <span className="text-xs text-text-muted">✓ Yes</span>
                    ) : (
                      <span className="text-xs text-success font-medium">No ★</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <span className="relative group">
                      {!food.hasTracking ? (
                        <span className="text-text-muted text-xs italic">No recipe</span>
                      ) : food.recipeInternalName! in completions ? (
                        <span className="text-success text-xs bg-success/10 px-1.5 py-0.5 rounded">Known ✓</span>
                      ) : (
                        <span className="text-text-muted text-xs bg-bg-secondary px-1.5 py-0.5 rounded">Unknown</span>
                      )}
                      {ingredientTooltip}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    {food.hasTracking ? (
                      sourceLabels.length > 0 ? (
                        <RecipeSourceDisplay labels={sourceLabels} />
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )
                    ) : (
                      <span className="text-xs text-text-muted italic">Raw / foraged</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs text-text-muted max-w-xs truncate">
                    {food.effects
                      .filter(
                        (e) =>
                          !e.includes("Gourmand bonus") &&
                          !e.toLowerCase().includes("meal level") &&
                          !e.toLowerCase().includes("snack level")
                      )
                      .slice(0, 2)
                      .join(", ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-text-muted text-sm">
            No foods match this filter.
          </div>
        )}
      </div>

      <Pagination page={page} totalItems={filtered.length} pageSize={DEFAULT_PAGE_SIZE} onPageChange={setPage} />

      {ingCtxMenu && (
        <ContextMenu
          x={ingCtxMenu.x}
          y={ingCtxMenu.y}
          onClose={() => setIngCtxMenu(null)}
          items={[
            { label: "🍳 View Crafting Recipe", onClick: () => { navigateToCraft(ingCtxMenu.name); setIngCtxMenu(null); } },
            { label: "🔗 View on Wiki", onClick: () => openInBrowser(wikiUrl(ingCtxMenu.name)) },
          ]}
        />
      )}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            ...(ctxMenu.isCrafted
              ? [{ label: "🍳 View Crafting Recipe", onClick: () => navigateToCraft(ctxMenu.name) }]
              : []),
            { label: "🔗 View on Wiki", onClick: () => openInBrowser(wikiUrl(ctxMenu.name)) },
          ]}
        />
      )}

    </div>
  );
}

function RecipeSourceDisplay({ labels }: { labels: RecipeSourceLabel[] }) {
  return (
    <div className="space-y-0.5">
      {labels.map((l, i) => (
        <div key={i} className="text-xs flex items-baseline gap-1">
          <RecipeSourceIcon kind={l.kind} />
          <span className="text-text-primary">{l.label}</span>
          {l.detail && <span className="text-text-muted">({l.detail})</span>}
        </div>
      ))}
    </div>
  );
}

function RecipeSourceIcon({ kind }: { kind: RecipeSourceLabel["kind"] }) {
  switch (kind) {
    case "trainer":  return <span>🎓</span>;
    case "scroll":   return <span>📜</span>;
    case "skill":    return <span>⭐</span>;
    case "quest":    return <span>📋</span>;
    case "hangout":  return <span>💬</span>;
    case "gift":     return <span>🎁</span>;
    default:         return <span className="text-text-muted">?</span>;
  }
}

function StatCard({
  label,
  value,
  highlight,
  success,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  success?: boolean;
}) {
  return (
    <div className="bg-bg-secondary rounded-lg p-3">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div
        className={`text-xl font-bold ${
          success ? "text-success" : highlight ? "text-accent" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

