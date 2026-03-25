/**
 * Recipes tab: browsable, sortable table of all food crafting recipes with
 * knowledge filters, ingredient availability, planner integration (star/unstar),
 * and XP drop-off calculations. Supports skill filtering via the sidebar.
 * To add new filter categories, extend the KnowledgeFilter type and the filtered memo.
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useCharacterStore } from "../../stores/characterStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { computeEffectiveXp } from "../../lib/xpCalculator";
import { getRecipeSourceLabels, type RecipeSourceLabel } from "../../lib/sourceResolver";
import { ContextMenu, wikiUrl, openInBrowser } from "../common/ContextMenu";
import { ItemTooltip } from "../common/ItemTooltip";
import { FOOD_SKILLS, matchesSelectedSkill, formatSkillName } from "../../lib/foodSkills";
import { useNavStore } from "../../stores/navStore";
import { usePlannerStore } from "../../stores/plannerStore";
import { useResizableColumns } from "../../hooks/useResizableColumns";
import { useColumnFilters } from "../../hooks/useColumnFilters";
import { ResizableTh, SortableResizableTh } from "../common/ResizableTh";
import { Pagination } from "../common/Pagination";
import { DEFAULT_PAGE_SIZE } from "../../lib/config";

// Knowledge filter categories:
// "all" = no filter; "known" = recipe InternalName in completions; "unknown" = not known;
// "firstcraft" = never crafted (completion count === 0, even if recipe is known);
// "canlearn" = not known but skill level is high enough; "toolow" = skill too low;
// "starred" = currently in the planner queue.
type KnowledgeFilter = "all" | "known" | "unknown" | "firstcraft" | "canlearn" | "toolow" | "starred";
type SortKey = "name" | "type" | "skill" | "level" | "xp" | "effXp" | "dropoff";
type SortDir = "asc" | "desc";
type FoodCategory = "all" | "meal" | "snack";

// FAE_ONLY_SKILLS: skills that only Fae-race characters can access. Recipes belonging
// to these skills are hidden from the recipe list for non-Fae characters to avoid
// showing unlearnable recipes. Determined by checking character.Race.
const FAE_ONLY_SKILLS = new Set(["Race_Fae", "Phrenology_Fae"]);

export function RecipeBrowser() {
  const recipes = useGameDataStore((s) => s.recipes);
  const loaded = useGameDataStore((s) => s.loaded);
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const character = useCharacterStore((s) => s.character);
  const getItemQuantity = useInventoryStore((s) => s.getItemQuantity);
  const recipeIndexes = useGameDataStore((s) => s.recipeIndexes);

  const selectedSkill = useNavStore((s) => s.selectedSkill);
  const recipeIngredientFilter = useNavStore((s) => s.recipeIngredientFilter);
  const clearRecipeIngredientFilter = useNavStore((s) => s.clearRecipeIngredientFilter);
  const pendingRecipeNameSearch = useNavStore((s) => s.pendingRecipeNameSearch);
  const clearRecipeNameSearch = useNavStore((s) => s.clearRecipeNameSearch);

  const [search, setSearch] = useState("");
  const [foodCategory, setFoodCategory] = useState<FoodCategory>("all");
  const [knowledgeFilter, setKnowledgeFilter] = useState<KnowledgeFilter>("all");
  const [showCraftableOnly, setShowCraftableOnly] = useState(false);
  const [minLevel, setMinLevel] = useState(0);
  const [maxLevel, setMaxLevel] = useState(125);
  const [sortKey, setSortKey] = useState<SortKey>("level");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const { widths: colW, startResize } = useResizableColumns("recipes-v4", [40, 55, 220, 70, 130, 70, 80, 80, 90, 160, 220]);
  const colFilters = useColumnFilters();
  const navigateToCraft = useNavStore((s) => s.navigateToCraft);
  const navigateToIngredient = useNavStore((s) => s.navigateToIngredient);

  // Planner store
  const plannerEntries = usePlannerStore((s) => s.entries);
  const starRecipe = usePlannerStore((s) => s.starRecipe);
  const unstarRecipe = usePlannerStore((s) => s.unstarRecipe);
  const setRecipeQty = usePlannerStore((s) => s.setQuantity);
  const starredCount = Object.keys(plannerEntries).length;

  // Pre-fill search when navigated here from Crafting tab's "View Recipe"
  useEffect(() => {
    if (!pendingRecipeNameSearch) return;
    setSearch(pendingRecipeNameSearch);
    setPage(0);
    clearRecipeNameSearch();
  }, [pendingRecipeNameSearch, clearRecipeNameSearch]);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; name: string } | null>(null);
  const handleContextMenu = useCallback((e: React.MouseEvent, name: string) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, name });
  }, []);
  const [ingCtxMenu, setIngCtxMenu] = useState<{ x: number; y: number; name: string } | null>(null);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" || key === "skill" ? "asc" : key === "effXp" || key === "xp" ? "desc" : "asc"); }
    setPage(0);
  }

  const isFae = character?.Race?.toLowerCase() === "fae";

  // Set of known recipe internal names (present in RecipeCompletions regardless of count)
  const knownRecipes = useMemo(() => {
    if (!character) return new Set<string>();
    return new Set(Object.keys(character.RecipeCompletions));
  }, [character]);

  const visibleRecipes = useMemo(
    () => recipes.filter((r) => FOOD_SKILLS.has(r.Skill) && (isFae || !FAE_ONLY_SKILLS.has(r.Skill))),
    [recipes, isFae]
  );

  // Determine food type (Meal/Snack) from the result item's FoodDesc
  const getRecipeFoodType = useCallback((recipe: typeof recipes[0]): "meal" | "snack" | null => {
    const resultItem = recipe.ResultItems?.[0];
    if (!resultItem) return null;
    const item = getItemByCode(resultItem.ItemCode);
    if (!item?.FoodDesc) return null;
    const desc = item.FoodDesc.toLowerCase();
    if (desc.includes("meal")) return "meal";
    if (desc.includes("snack")) return "snack";
    return null;
  }, [getItemByCode]);

  const mealCount = useMemo(
    () => visibleRecipes.filter((r) => getRecipeFoodType(r) === "meal").length,
    [visibleRecipes, getRecipeFoodType]
  );
  const snackCount = useMemo(
    () => visibleRecipes.filter((r) => getRecipeFoodType(r) === "snack").length,
    [visibleRecipes, getRecipeFoodType]
  );

  const knownCount = useMemo(
    () => visibleRecipes.filter((r) => knownRecipes.has(r.InternalName)).length,
    [visibleRecipes, knownRecipes]
  );

  const unknownCount = useMemo(
    () => visibleRecipes.filter((r) => !knownRecipes.has(r.InternalName)).length,
    [visibleRecipes, knownRecipes]
  );

  const firstCraftCount = useMemo(
    () => visibleRecipes.filter(
      (r) => (character?.RecipeCompletions[r.InternalName] ?? 0) === 0
    ).length,
    [visibleRecipes, character]
  );

  const canLearnCount = useMemo(
    () => visibleRecipes.filter(
      (r) => !knownRecipes.has(r.InternalName) && (character?.Skills[r.Skill]?.Level ?? 0) >= r.SkillLevelReq
    ).length,
    [visibleRecipes, knownRecipes, character]
  );

  const tooLowCount = useMemo(
    () => visibleRecipes.filter(
      (r) => !knownRecipes.has(r.InternalName) && (character?.Skills[r.Skill]?.Level ?? 0) < r.SkillLevelReq
    ).length,
    [visibleRecipes, knownRecipes, character]
  );

  // Unique filter options for column dropdowns
  const skillOptions = useMemo(
    () => [...new Set(visibleRecipes.map((r) => formatSkillName(r.Skill)))].sort(),
    [visibleRecipes]
  );

  const filtered = useMemo(() => {
    let results = recipes.filter(
      (r) => FOOD_SKILLS.has(r.Skill) && (isFae || !FAE_ONLY_SKILLS.has(r.Skill))
    );

    if (foodCategory !== "all") {
      results = results.filter((r) => getRecipeFoodType(r) === foodCategory);
    }

    if (search) {
      const term = search.toLowerCase();
      results = results.filter(
        (r) =>
          r.Name.toLowerCase().includes(term) ||
          r.InternalName.toLowerCase().includes(term) ||
          r.Skill.toLowerCase().includes(term)
      );
    }

    if (selectedSkill) {
      results = results.filter((r) => matchesSelectedSkill(r.Skill, selectedSkill));
    }

    if (knowledgeFilter === "known") {
      results = results.filter((r) => knownRecipes.has(r.InternalName));
    } else if (knowledgeFilter === "unknown") {
      results = results.filter((r) => !knownRecipes.has(r.InternalName));
    } else if (knowledgeFilter === "firstcraft") {
      results = results.filter(
        (r) => (character?.RecipeCompletions[r.InternalName] ?? 0) === 0
      );
    } else if (knowledgeFilter === "canlearn") {
      results = results.filter(
        (r) => !knownRecipes.has(r.InternalName) && (character?.Skills[r.Skill]?.Level ?? 0) >= r.SkillLevelReq
      );
    } else if (knowledgeFilter === "toolow") {
      results = results.filter(
        (r) => !knownRecipes.has(r.InternalName) && (character?.Skills[r.Skill]?.Level ?? 0) < r.SkillLevelReq
      );
    } else if (knowledgeFilter === "starred") {
      results = results.filter((r) => r.id in plannerEntries);
    }

    if (showCraftableOnly) {
      results = results.filter((r) =>
        r.Ingredients.every(
          (ing) => getItemQuantity(ing.ItemCode) >= ing.StackSize
        )
      );
    }

    // Ingredient filter — only recipes that use a specific ingredient (from Ingredients tab)
    if (recipeIngredientFilter) {
      results = results.filter((r) =>
        r.Ingredients.some((ing) => ing.ItemCode === recipeIngredientFilter.typeId)
      );
    }

    results = results.filter(
      (r) => r.SkillLevelReq >= minLevel && r.SkillLevelReq <= maxLevel
    );

    // Column dropdown filters
    if (colFilters.isFiltered("skill")) {
      results = results.filter((r) => colFilters.passesFilter("skill", formatSkillName(r.Skill)));
    }

    return [...results].sort((a, b) => {
      let diff = 0;
      if (sortKey === "name") diff = a.Name.localeCompare(b.Name);
      else if (sortKey === "type") {
        const ta = getRecipeFoodType(a) ?? "";
        const tb = getRecipeFoodType(b) ?? "";
        diff = ta.localeCompare(tb);
      }
      else if (sortKey === "skill") diff = a.Skill.localeCompare(b.Skill) || a.SkillLevelReq - b.SkillLevelReq;
      else if (sortKey === "level") diff = a.SkillLevelReq - b.SkillLevelReq || a.Name.localeCompare(b.Name);
      else if (sortKey === "xp") diff = a.RewardSkillXp - b.RewardSkillXp;
      else if (sortKey === "effXp") {
        const getEffXp = (r: typeof a) => {
          const sk = character?.Skills[r.Skill];
          return sk ? computeEffectiveXp(r, sk.Level) : r.RewardSkillXp;
        };
        diff = getEffXp(a) - getEffXp(b);
      }
      else if (sortKey === "dropoff") {
        const ad = a.RewardSkillXpDropOffLevel ?? 999;
        const bd = b.RewardSkillXpDropOffLevel ?? 999;
        diff = ad - bd;
      }
      return sortDir === "asc" ? diff : -diff;
    });
  }, [
    recipes,
    isFae,
    foodCategory,
    getRecipeFoodType,
    search,
    selectedSkill,
    knowledgeFilter,
    knownRecipes,
    showCraftableOnly,
    recipeIngredientFilter,
    minLevel,
    maxLevel,
    sortKey,
    sortDir,
    character,
    getItemQuantity,
    plannerEntries,
    colFilters,
  ]);

  if (!loaded) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-text-secondary mb-2">
          Recipe Browser
        </h2>
        <p className="text-text-muted">
          Load game data in Settings to browse recipes.
        </p>
      </div>
    );
  }

  const paginated = filtered.slice(page * DEFAULT_PAGE_SIZE, (page + 1) * DEFAULT_PAGE_SIZE);

  const knowledgeButtons: { key: KnowledgeFilter; label: string; count: number | null }[] = [
    { key: "all", label: "All", count: visibleRecipes.length },
    { key: "starred", label: "★ Queued", count: starredCount },
    { key: "known", label: "Known", count: character ? knownCount : null },
    { key: "unknown", label: "Unknown", count: character ? unknownCount : null },
    { key: "firstcraft", label: "First Craft", count: character ? firstCraftCount : null },
    { key: "canlearn", label: "Can Learn", count: character ? canLearnCount : null },
    { key: "toolow", label: "Too Low", count: character ? tooLowCount : null },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Recipes</h2>
        <p className="text-sm text-text-muted mt-1">
          Browse and queue food recipes — star what you want to cook and plan your crafting session.
        </p>
      </div>

      {/* Stats */}
      {character && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Recipes" value={visibleRecipes.length.toLocaleString()} />
          <StatCard label="Known" value={knownCount.toLocaleString()} />
          <StatCard label="Can Learn" value={canLearnCount.toLocaleString()} highlight={canLearnCount > 0} />
          <StatCard label="Queued" value={starredCount.toLocaleString()} highlight={starredCount > 0} success />
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Category: All / Meals / Snacks */}
        <div className="flex gap-1 bg-bg-secondary rounded-lg p-1">
          {([
            { key: "all" as FoodCategory, label: `All (${visibleRecipes.length})` },
            { key: "meal" as FoodCategory, label: `Meals (${mealCount})` },
            { key: "snack" as FoodCategory, label: `Snacks (${snackCount})` },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setFoodCategory(key); setPage(0); }}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                foodCategory === key
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Knowledge filter */}
        <div className="flex gap-1 bg-bg-secondary rounded-lg p-1 flex-wrap">
          {knowledgeButtons.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => { setKnowledgeFilter(key); setPage(0); }}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                knowledgeFilter === key
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {label}{count !== null ? ` (${count.toLocaleString()})` : ""}
            </button>
          ))}
        </div>

        {/* Craftable Now toggle */}
        <button
          onClick={() => { setShowCraftableOnly((v) => !v); setPage(0); }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            showCraftableOnly
              ? "bg-accent/15 text-accent"
              : "bg-bg-secondary text-text-secondary hover:text-text-primary"
          }`}
        >
          <span
            className={`relative inline-flex shrink-0 w-9 h-5 rounded-full transition-colors ${
              showCraftableOnly ? "bg-accent" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-[3px] left-[3px] w-[14px] h-[14px] rounded-full bg-white transition-all ${
                showCraftableOnly ? "translate-x-[16px]" : "translate-x-0"
              }`}
            />
          </span>
          Craftable Now
        </button>

      </div>

      {/* Search + level range + count */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search recipes..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="bg-bg-secondary border border-border rounded px-3 py-1.5 text-sm text-text-primary flex-1 min-w-36"
        />
        <div className="flex items-center gap-1.5 text-sm text-text-secondary">
          <span className="text-xs text-text-muted">Lv</span>
          <input
            type="number"
            value={minLevel}
            onChange={(e) => { setMinLevel(Number(e.target.value)); setPage(0); }}
            min={0}
            max={125}
            className="bg-bg-secondary border border-border rounded px-2 py-1.5 text-sm text-text-primary w-16"
          />
          <span className="text-xs text-text-muted">–</span>
          <input
            type="number"
            value={maxLevel}
            onChange={(e) => { setMaxLevel(Number(e.target.value)); setPage(0); }}
            min={0}
            max={125}
            className="bg-bg-secondary border border-border rounded px-2 py-1.5 text-sm text-text-primary w-16"
          />
        </div>
        <span className="text-xs text-text-muted">{filtered.length.toLocaleString()} shown</span>
      </div>

      {/* Ingredient filter banner */}
      {recipeIngredientFilter && (
        <div className="flex items-center gap-2 bg-accent/10 border border-accent/30 rounded-lg px-3 py-2 text-sm">
          <span className="text-accent font-medium">🔍</span>
          <span className="text-text-primary">
            Showing recipes that use <span className="font-semibold text-accent">{recipeIngredientFilter.name}</span>
          </span>
          <button
            onClick={() => { clearRecipeIngredientFilter(); setPage(0); }}
            className="ml-auto text-xs text-text-muted hover:text-text-primary border border-border hover:border-border/60 px-2 py-0.5 rounded transition-colors"
          >
            ✕ Clear
          </button>
        </div>
      )}

      <Pagination page={page} totalItems={filtered.length} pageSize={DEFAULT_PAGE_SIZE} onPageChange={setPage} />

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="text-sm" style={{ tableLayout: "fixed", width: colW.slice(0, character ? 11 : 10).reduce((a, b) => a + b, 0) }}>
          <thead>
            <tr className="border-b border-border text-left text-text-secondary text-xs">
              <ResizableTh width={colW[0]} onStartResize={(x) => startResize(0, x)}>Craft</ResizableTh>
              <ResizableTh width={colW[1]} onStartResize={(x) => startResize(1, x)}>Qty</ResizableTh>
              <SortableResizableTh label="Recipe" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width={colW[2]} onStartResize={(x) => startResize(2, x)} />
              <SortableResizableTh label="Type" col="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width={colW[3]} onStartResize={(x) => startResize(3, x)} />
              <SortableResizableTh label="Skill" col="skill" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width={colW[4]} onStartResize={(x) => startResize(4, x)}
                filterOptions={skillOptions} filterSelected={colFilters.filters["skill"] ?? new Set()} onFilterChange={(s) => colFilters.setFilter("skill", s)} />
              <SortableResizableTh label="Lvl Req" col="level" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right width={colW[5]} onStartResize={(x) => startResize(5, x)} />
              <SortableResizableTh label="Base XP" col="xp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right width={colW[6]} onStartResize={(x) => startResize(6, x)} />
              {character && <SortableResizableTh label="Eff XP" col="effXp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right width={colW[7]} onStartResize={(x) => startResize(7, x)} />}
              <SortableResizableTh label="Dropoff Lvl" col="dropoff" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right width={colW[8]} onStartResize={(x) => startResize(8, x)} />
              <ResizableTh width={colW[9]} onStartResize={(x) => startResize(9, x)}>Recipe Source</ResizableTh>
              <ResizableTh width={colW[10]} onStartResize={(x) => startResize(10, x)}>Ingredients</ResizableTh>
            </tr>
          </thead>
          <tbody>
            {paginated.map((recipe) => {
              const skillState = character?.Skills[recipe.Skill];
              const effXp = skillState
                ? computeEffectiveXp(recipe, skillState.Level)
                : null;
              const isKnown = knownRecipes.has(recipe.InternalName);
              const completionCount = character?.RecipeCompletions[recipe.InternalName];
              const isFirstTime = isKnown && completionCount === 0;

              const sourcesLabels = !isKnown
                ? getRecipeSourceLabels(recipe.id, getItemByCode)
                : [];

              const isStarred = recipe.id in plannerEntries;
              const starQty = plannerEntries[recipe.id]?.quantity ?? 1;

              return (
                <tr
                  key={recipe.id}
                  onContextMenu={(e) => handleContextMenu(e, recipe.Name)}
                  className={`border-b border-border/50 hover:bg-bg-secondary/50 ${
                    isFirstTime
                      ? "bg-gold/5"
                      : !isKnown
                      ? "opacity-75"
                      : ""
                  }`}
                >
                  {/* Star cell */}
                  <td className="py-1 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() =>
                        isStarred
                          ? unstarRecipe(recipe.id)
                          : starRecipe(recipe.id, recipe.InternalName, 1)
                      }
                      className={`text-lg leading-none ${
                        isStarred ? "text-gold" : "text-text-muted hover:text-gold/60"
                      }`}
                      title={isStarred ? "Remove from queue" : "Add to queue"}
                    >
                      {isStarred ? "★" : "☆"}
                    </button>
                  </td>
                  {/* Qty cell */}
                  <td className="py-1 px-1" onClick={(e) => e.stopPropagation()}>
                    {isStarred && (
                      <input
                        type="number"
                        min={1}
                        value={starQty}
                        onChange={(e) => setRecipeQty(recipe.id, Math.max(1, Number(e.target.value)))}
                        className="qty-input w-full bg-bg-primary border border-accent/40 rounded px-1.5 py-1 text-sm text-center text-text-primary"
                      />
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <div className="font-medium">
                      {recipe.Name}
                      {isFirstTime && (
                        <span className="ml-1.5 text-xs bg-gold/20 text-gold px-1 py-0.5 rounded">
                          NEW
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-xs">
                    {(() => {
                      const ft = getRecipeFoodType(recipe);
                      if (ft === "meal") return <span className="text-accent">Meal</span>;
                      if (ft === "snack") return <span className="text-gold">Snack</span>;
                      return <span className="text-text-muted">—</span>;
                    })()}
                  </td>
                  <td className="py-2 px-3 text-text-secondary text-xs">
                    {formatSkillName(recipe.Skill)}
                  </td>
                  <td className="py-2 px-3 text-right">{recipe.SkillLevelReq}</td>
                  <td className="py-2 px-3 text-right">
                    {recipe.RewardSkillXp.toLocaleString()}
                  </td>
                  {character && (
                    <td className="py-2 px-3 text-right">
                      {effXp !== null ? (
                        <span
                          className={
                            effXp === 0
                              ? "text-danger"
                              : effXp < recipe.RewardSkillXp
                              ? "text-gold"
                              : "text-success"
                          }
                        >
                          {effXp.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  )}
                  <td className="py-2 px-3 text-right text-text-muted text-xs">
                    {recipe.RewardSkillXpDropOffLevel ?? "—"}
                  </td>
                  <td className="py-2 px-3">
                    {isKnown ? (
                      <span className="text-xs text-success">✓ Known</span>
                    ) : (
                      <SourceDisplay labels={sourcesLabels} />
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs text-text-secondary">
                    {recipe.Ingredients.map((ing, i) => {
                      const item = getItemByCode(ing.ItemCode);
                      const have = getItemQuantity(ing.ItemCode);
                      const isCraftable = recipeIndexes?.byResultItem.get(ing.ItemCode)?.some(r => FOOD_SKILLS.has(r.Skill)) ?? false;
                      const colorClass =
                        have >= ing.StackSize
                          ? "text-success"
                          : have > 0
                          ? "text-amber-400"
                          : "text-error";
                      return (
                        <span key={ing.ItemCode}>
                          {i > 0 && ", "}
                          <ItemTooltip itemCode={ing.ItemCode} quantity={have}>
                            <span
                              className={`${colorClass} cursor-pointer hover:underline ${isCraftable ? "decoration-dotted" : ""}`}
                              onClick={() => navigateToIngredient(item?.Name ?? "")}
                              onContextMenu={isCraftable ? (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIngCtxMenu({ x: e.clientX, y: e.clientY, name: item?.Name ?? `#${ing.ItemCode}` });
                              } : undefined}
                            >
                              {item?.Name ?? `#${ing.ItemCode}`} ×{ing.StackSize}
                            </span>
                          </ItemTooltip>
                        </span>
                      );
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-text-muted text-sm">
          No recipes match the current filters.
        </div>
      )}

      <Pagination page={page} totalItems={filtered.length} pageSize={DEFAULT_PAGE_SIZE} onPageChange={setPage} />

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            { label: "🍳 View Crafting Recipe", onClick: () => navigateToCraft(ctxMenu.name) },
            { label: "🔗 View on Wiki", onClick: () => openInBrowser(wikiUrl(ctxMenu.name)) },
          ]}
        />
      )}

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
    </div>
  );
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


function SourceDisplay({ labels }: { labels: RecipeSourceLabel[] }) {
  if (labels.length === 0) {
    return <span className="text-xs text-text-muted">—</span>;
  }

  return (
    <div className="space-y-0.5">
      {labels.map((l, i) => (
        <div key={i} className="text-xs">
          <SourceBadgeIcon kind={l.kind} />
          <span className="ml-1 text-text-primary">{l.label}</span>
          {l.detail && (
            <span className="text-text-muted ml-1">({l.detail})</span>
          )}
        </div>
      ))}
    </div>
  );
}

function SourceBadgeIcon({ kind }: { kind: RecipeSourceLabel["kind"] }) {
  switch (kind) {
    case "trainer":
      return <span className="text-accent">🎓</span>;
    case "scroll":
      return <span className="text-gold">📜</span>;
    case "skill":
      return <span className="text-success">⭐</span>;
    case "quest":
      return <span className="text-text-secondary">📋</span>;
    case "hangout":
      return <span className="text-accent">💬</span>;
    case "gift":
      return <span className="text-text-secondary">🎁</span>;
    default:
      return <span className="text-text-muted">?</span>;
  }
}
