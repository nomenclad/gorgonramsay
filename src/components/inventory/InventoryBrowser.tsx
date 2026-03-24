import { useState, useMemo, useCallback, useEffect } from "react";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useNavStore } from "../../stores/navStore";
import { ContextMenu, wikiUrl, openInBrowser } from "../common/ContextMenu";
import { FOOD_SKILLS, matchesSelectedSkill } from "../../lib/foodSkills";
import { getAcquisitionMethods } from "../../lib/sourceResolver";
import { useMonsterDrops } from "../../hooks/useMonsterDrops";
import { IngredientDetailModal } from "./IngredientDetailModal";
import type { AggregatedItem } from "../../types";
import { useResizableColumns } from "../../hooks/useResizableColumns";
import { useColumnFilters } from "../../hooks/useColumnFilters";
import { ResizableTh, SortableResizableTh } from "../common/ResizableTh";
import { Pagination } from "../common/Pagination";

type SortKey = "name" | "acquisition" | "qty" | "value" | "totalValue" | "recipes";
type SortDir = "asc" | "desc";
type StockFilter = "all" | "have" | "missing";
type AcquisitionFilter = "all" | "foraged" | "crafted";

export function InventoryBrowser() {
  const aggregated = useInventoryStore((s) => s.aggregated);
  const getVaultNames = useInventoryStore((s) => s.getVaultNames);
  const loaded = useGameDataStore((s) => s.loaded);
  const items = useGameDataStore((s) => s.items);
  const recipeIndexes = useGameDataStore((s) => s.recipeIndexes);
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const fmtVault = useGameDataStore((s) => s.formatVaultName);
  const selectedSkill = useNavStore((s) => s.selectedSkill);
  const pendingIngredientSearch = useNavStore((s) => s.pendingIngredientSearch);
  const clearPendingIngredientSearch = useNavStore((s) => s.clearPendingIngredientSearch);

  const monsterDrops = useMonsterDrops();
  const filterRecipesByIngredient = useNavStore((s) => s.filterRecipesByIngredient);
  const navigateToRecipeSearch = useNavStore((s) => s.navigateToRecipeSearch);

  const [selectedItem, setSelectedItem] = useState<AggregatedItem | null>(null);
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [acquisitionFilter, setAcquisitionFilter] = useState<AcquisitionFilter>("all");
  const [search, setSearch] = useState("");

  // Consume pending ingredient search navigation
  useEffect(() => {
    if (pendingIngredientSearch) {
      setSearch(pendingIngredientSearch);
      setPage(0);
      clearPendingIngredientSearch();
    }
  }, [pendingIngredientSearch, clearPendingIngredientSearch]);
  const [vaultFilter, setVaultFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 100;
  const colFilters = useColumnFilters();
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; name: string } | null>(null);
  const handleContextMenu = useCallback((e: React.MouseEvent, name: string) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, name });
  }, []);

  const { widths: colW, startResize } = useResizableColumns("inventory", [180, 100, 70, 90, 90, 220, 70]);

  const vaultKeys = useMemo(() => getVaultNames(), [getVaultNames]);

  // Item codes that appear in any food-skill recipe (as ingredient or result)
  const foodItemCodes = useMemo(() => {
    if (!recipeIndexes) return null;
    const codes = new Set<number>();
    for (const [itemCode, recipes] of recipeIndexes.byIngredient) {
      if (recipes.some((r) => FOOD_SKILLS.has(r.Skill))) codes.add(itemCode);
    }
    for (const [itemCode, recipes] of recipeIndexes.byResultItem) {
      if (recipes.some((r) => FOOD_SKILLS.has(r.Skill))) codes.add(itemCode);
    }
    return codes;
  }, [recipeIndexes]);

  // Item codes filtered to the selected skill (when non-empty)
  const skillItemCodes = useMemo(() => {
    if (!selectedSkill || !recipeIndexes) return null;
    const codes = new Set<number>();
    for (const [itemCode, recipes] of recipeIndexes.byIngredient) {
      if (recipes.some((r) => matchesSelectedSkill(r.Skill, selectedSkill))) codes.add(itemCode);
    }
    for (const [itemCode, recipes] of recipeIndexes.byResultItem) {
      if (recipes.some((r) => matchesSelectedSkill(r.Skill, selectedSkill))) codes.add(itemCode);
    }
    return codes;
  }, [selectedSkill, recipeIndexes]);

  // Quick lookup: typeId → aggregated inventory entry
  const aggByTypeId = useMemo(
    () => new Map(aggregated.map((a) => [a.typeId, a])),
    [aggregated]
  );

  /**
   * Full list of food-related items from game data, merged with inventory quantities.
   * Items not in the player's inventory appear with totalQuantity = 0.
   * This lets us show "missing" ingredients too.
   */
  const allFoodItems = useMemo((): AggregatedItem[] => {
    if (!loaded || !recipeIndexes) return [];
    const codes = skillItemCodes ?? foodItemCodes;
    if (!codes) return [];

    const result: AggregatedItem[] = [];
    for (const gameItem of items) {
      const codeMatch = gameItem.id.match(/(\d+)$/);
      if (!codeMatch) continue;
      const typeId = parseInt(codeMatch[1], 10);
      if (!codes.has(typeId)) continue;

      const inv = aggByTypeId.get(typeId);
      result.push(
        inv ?? {
          typeId,
          name: gameItem.Name,
          totalQuantity: 0,
          value: gameItem.Value ?? 0,
          locations: [],
        }
      );
    }
    // Only keep items that are used as an ingredient in at least one food recipe
    return result.filter((item) => {
      const usedIn = recipeIndexes!.byIngredient.get(item.typeId);
      return usedIn?.some((r) => FOOD_SKILLS.has(r.Skill));
    });
  }, [loaded, items, recipeIndexes, foodItemCodes, skillItemCodes, aggByTypeId]);

  // Helper: determine acquisition type for an item
  const getAcquisition = useCallback((typeId: number): "Crafted" | "Foraged" => {
    if (!recipeIndexes) return "Foraged";
    const resultRecipes = recipeIndexes.byResultItem.get(typeId);
    if (resultRecipes?.some((r) => FOOD_SKILLS.has(r.Skill))) return "Crafted";
    return "Foraged";
  }, [recipeIndexes]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
    setPage(0);
  }

  // Unique filter options for column dropdowns
  const acquisitionOptions = useMemo(
    () => [...new Set(allFoodItems.map((i) => getAcquisition(i.typeId)))].sort(),
    [allFoodItems, getAcquisition]
  );
  const nameOptions = useMemo(
    () => [...new Set(allFoodItems.map((i) => i.name))].sort(),
    [allFoodItems]
  );

  const haveCount     = useMemo(() => allFoodItems.filter((i) => i.totalQuantity > 0).length, [allFoodItems]);
  const missingCount  = useMemo(() => allFoodItems.filter((i) => i.totalQuantity === 0).length, [allFoodItems]);
  const foragedCount  = useMemo(() => allFoodItems.filter((i) => getAcquisition(i.typeId) === "Foraged").length, [allFoodItems, getAcquisition]);
  const craftedCount  = useMemo(() => allFoodItems.filter((i) => getAcquisition(i.typeId) === "Crafted").length, [allFoodItems, getAcquisition]);

  const filtered = useMemo(() => {
    let results = allFoodItems;

    // Stock filter
    if (stockFilter === "have") {
      results = results.filter((item) => item.totalQuantity > 0);
    } else if (stockFilter === "missing") {
      results = results.filter((item) => item.totalQuantity === 0);
    }

    // Acquisition filter
    if (acquisitionFilter === "foraged") {
      results = results.filter((item) => getAcquisition(item.typeId) === "Foraged");
    } else if (acquisitionFilter === "crafted") {
      results = results.filter((item) => getAcquisition(item.typeId) === "Crafted");
    }

    if (search) {
      const term = search.toLowerCase();
      results = results.filter((item) =>
        item.name.toLowerCase().includes(term)
      );
    }

    if (vaultFilter) {
      results = results.filter((item) =>
        item.locations.some((l) => l.vault === vaultFilter)
      );
    }

    // Column dropdown filters
    if (colFilters.isFiltered("name")) {
      results = results.filter((item) => colFilters.passesFilter("name", item.name));
    }
    if (colFilters.isFiltered("acquisition")) {
      results = results.filter((item) => colFilters.passesFilter("acquisition", getAcquisition(item.typeId)));
    }

    return [...results].sort((a, b) => {
      let diff = 0;
      if (sortKey === "name") diff = a.name.localeCompare(b.name);
      else if (sortKey === "acquisition") {
        const aRank = getAcquisition(a.typeId) === "Crafted" ? 0 : 1;
        const bRank = getAcquisition(b.typeId) === "Crafted" ? 0 : 1;
        diff = aRank - bRank;
      }
      else if (sortKey === "qty") diff = a.totalQuantity - b.totalQuantity;
      else if (sortKey === "value") diff = a.value - b.value;
      else if (sortKey === "totalValue") diff = (a.value * a.totalQuantity) - (b.value * b.totalQuantity);
      else if (sortKey === "recipes") {
        const ar = recipeIndexes?.byIngredient.get(a.typeId)?.filter((r) => FOOD_SKILLS.has(r.Skill)).length ?? 0;
        const br = recipeIndexes?.byIngredient.get(b.typeId)?.filter((r) => FOOD_SKILLS.has(r.Skill)).length ?? 0;
        diff = ar - br;
      }
      return sortDir === "asc" ? diff : -diff;
    });
  }, [allFoodItems, stockFilter, acquisitionFilter, search, vaultFilter, sortKey, sortDir, recipeIndexes, getAcquisition, colFilters]);

  if (!loaded) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-text-secondary mb-2">
          Ingredients
        </h2>
        <p className="text-text-muted">
          Load game data in Settings to browse ingredients.
        </p>
      </div>
    );
  }

  const inventoryLoaded = aggregated.length > 0;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Ingredients</h2>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3">
        {/* Stock filter */}
        <div className="flex gap-1 bg-bg-secondary rounded-lg p-1">
          {(
            [
              { key: "all"     as StockFilter, label: `All (${allFoodItems.length})` },
              { key: "have"    as StockFilter, label: `Have (${haveCount})`,       disabled: !inventoryLoaded },
              { key: "missing" as StockFilter, label: `Missing (${missingCount})`, disabled: !inventoryLoaded },
            ]
          ).map(({ key, label, disabled }) => (
            <button
              key={key}
              onClick={() => { if (!disabled) { setStockFilter(key); setPage(0); } }}
              disabled={disabled}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                stockFilter === key
                  ? "bg-accent text-white"
                  : disabled
                  ? "text-text-muted cursor-not-allowed opacity-50"
                  : "text-text-secondary hover:text-text-primary"
              }`}
              title={disabled ? "Load inventory data in Settings" : undefined}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Acquisition filter */}
        <div className="flex gap-1 bg-bg-secondary rounded-lg p-1">
          {(
            [
              { key: "all"     as AcquisitionFilter, label: "All Types" },
              { key: "foraged" as AcquisitionFilter, label: `Foraged (${foragedCount})` },
              { key: "crafted" as AcquisitionFilter, label: `Crafted (${craftedCount})` },
            ]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setAcquisitionFilter(key); setPage(0); }}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                acquisitionFilter === key
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary flex-1 min-w-48"
        />
        {inventoryLoaded && (
          <select
            value={vaultFilter}
            onChange={(e) => { setVaultFilter(e.target.value); setPage(0); }}
            className="bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary"
          >
            <option value="">All vaults</option>
            {vaultKeys.map((v) => (
              <option key={v} value={v}>{fmtVault(v)}</option>
            ))}
          </select>
        )}
      </div>

      <div className="text-xs text-text-muted">
        {filtered.length.toLocaleString()} items
        {search && ` matching "${search}"`}
      </div>

      <Pagination page={page} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />

      <div className="overflow-x-auto">
        <table className="text-sm" style={{ tableLayout: "fixed", width: colW.slice(0, loaded ? 7 : 6).reduce((a, b) => a + b, 0) }}>
          <thead>
            <tr className="border-b border-border text-left text-text-secondary text-xs">
              <SortableResizableTh label="Ingredient" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width={colW[0]} onStartResize={(x) => startResize(0, x)}
                filterOptions={nameOptions} filterSelected={colFilters.filters["name"] ?? new Set()} onFilterChange={(s) => colFilters.setFilter("name", s)} />
              <SortableResizableTh label="Acquisition" col="acquisition" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} width={colW[1]} onStartResize={(x) => startResize(1, x)}
                filterOptions={acquisitionOptions} filterSelected={colFilters.filters["acquisition"] ?? new Set()} onFilterChange={(s) => colFilters.setFilter("acquisition", s)} />
              <SortableResizableTh label="Qty" col="qty" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right width={colW[2]} onStartResize={(x) => startResize(2, x)} />
              <SortableResizableTh label="Unit Value" col="value" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right width={colW[3]} onStartResize={(x) => startResize(3, x)} />
              <SortableResizableTh label="Total Value" col="totalValue" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right width={colW[4]} onStartResize={(x) => startResize(4, x)} />
              <ResizableTh width={colW[5]} onStartResize={(x) => startResize(5, x)}>Where Found</ResizableTh>
              {loaded && <SortableResizableTh label="Recipes" col="recipes" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right width={colW[6]} onStartResize={(x) => startResize(6, x)} />}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((item) => {
              const acquisition = getAcquisition(item.typeId);
              const usedInCount = recipeIndexes?.byIngredient.get(item.typeId)?.filter((r) => FOOD_SKILLS.has(r.Skill)).length ?? 0;

              // Wiki drop data — real monster names + locations
              const wikiDrops = monsterDrops[item.name] ?? null;
              // Show vendor / gather / fishing / craft — no quests or misc
              const cdnSources = getAcquisitionMethods(item.typeId, 0).filter(
                (m) => m.kind === "vendor" || m.kind === "fishing" || m.kind === "gather" || m.kind === "craft"
              );
              // Fishing/Angling recipe → show "Fished/Angled in [zone from recipe name]"
              const fishingRecipe = recipeIndexes?.byResultItem.get(item.typeId)?.find(
                (r) => r.Skill === "Fishing" || r.Skill === "Angling"
              ) ?? null;
              // Gardening recipe → show "Gardened from [seedling]"
              const gardenRecipe = !fishingRecipe
                ? (recipeIndexes?.byResultItem.get(item.typeId)?.find(
                    (r) => r.Skill === "Gardening"
                  ) ?? null)
                : null;
              const gardenSeedlings = gardenRecipe
                ? gardenRecipe.Ingredients.map((ing) => getItemByCode(ing.ItemCode)?.Name ?? `Item #${ing.ItemCode}`)
                : [];
              // Other food-skill crafting recipe (non-Gardening, non-Fishing/Angling)
              const craftRecipe = !gardenRecipe && !fishingRecipe
                ? (recipeIndexes?.byResultItem.get(item.typeId)?.find(
                    (r) => FOOD_SKILLS.has(r.Skill) && r.Skill !== "Gardening" && r.Skill !== "Fishing" && r.Skill !== "Angling"
                  ) ?? null)
                : null;
              return (
                <tr
                  key={item.typeId}
                  onClick={() => setSelectedItem(item)}
                  onContextMenu={(e) => handleContextMenu(e, item.name)}
                  className="border-b border-border/50 hover:bg-bg-secondary/50 cursor-pointer"
                >
                  <td className="py-2 px-3 font-medium">{item.name}</td>
                  <td className="py-2 px-3">
                    {acquisition === "Crafted" ? (
                      <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded">Crafted</span>
                    ) : (
                      <span className="text-xs bg-success/10 text-success px-1.5 py-0.5 rounded">Foraged</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">{item.totalQuantity.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-gold">{item.value.toLocaleString()}c</td>
                  <td className="py-2 px-3 text-right text-gold">{(item.value * item.totalQuantity).toLocaleString()}c</td>
                  <td className="py-2 px-3 text-xs text-text-secondary max-w-xs">
                    {wikiDrops === null && cdnSources.length === 0 ? (
                      <span className="text-text-muted">—</span>
                    ) : (
                      <div className="space-y-0.5">
                        {/* CDN vendor / gather / fishing / craft sources */}
                        {cdnSources.map((m, i) => (
                          <div key={`cdn-${i}`}>
                            {m.kind === "vendor" ? (
                              <span>
                                <span className="text-accent">{m.npcName ?? "Vendor"}</span>
                                {m.area && <span className="text-text-muted ml-1">({m.area})</span>}
                              </span>
                            ) : m.kind === "fishing" ? (
                              fishingRecipe ? (
                                <span>
                                  <span className="text-blue-400 italic">
                                    {fishingRecipe.Skill === "Angling" ? "Angled" : "Fished"}:
                                  </span>
                                  <span className="text-text-primary ml-1">{fishingRecipe.Name}</span>
                                </span>
                              ) : (
                                <span className="text-blue-400 italic">Fishing</span>
                              )
                            ) : m.kind === "gather" ? (
                              <span className="text-text-muted italic">Gather / harvest</span>
                            ) : m.kind === "craft" ? (
                              fishingRecipe ? (
                                // Fish produced by Fishing/Angling recipe — show fishing info, not bait
                                <span>
                                  <span className="text-blue-400 italic">
                                    {fishingRecipe.Skill === "Angling" ? "Angled" : "Fished"}:
                                  </span>
                                  <span className="text-text-primary ml-1">{fishingRecipe.Name}</span>
                                </span>
                              ) : gardenRecipe ? (
                                <span>
                                  <span className="text-text-muted italic">Gardened from </span>
                                  <button
                                    className="text-success hover:underline"
                                    onClick={(e) => { e.stopPropagation(); navigateToRecipeSearch(gardenRecipe.Name); }}
                                  >
                                    {gardenSeedlings.join(", ")}
                                  </button>
                                </span>
                              ) : (
                                <span>
                                  <span className="text-text-muted italic">Crafted: </span>
                                  {craftRecipe ? (
                                    <button
                                      className="text-accent hover:underline"
                                      onClick={(e) => { e.stopPropagation(); navigateToRecipeSearch(craftRecipe.Name); }}
                                    >
                                      {craftRecipe.Name}
                                    </button>
                                  ) : (
                                    <span className="text-text-muted">Recipe</span>
                                  )}
                                </span>
                              )
                            ) : (
                              <span className="text-text-muted capitalize">{(m as { kind: string }).kind}</span>
                            )}
                          </div>
                        ))}
                        {/* Wiki monster/location drops — collapsed if many */}
                        {wikiDrops && wikiDrops.length > 0 && (() => {
                          // Deduplicate by monster (keep unique zone list)
                          const byMonster = new Map<string, string[]>();
                          for (const d of wikiDrops) {
                            if (!byMonster.has(d.monster)) byMonster.set(d.monster, []);
                            if (d.location && !byMonster.get(d.monster)!.includes(d.location)) {
                              byMonster.get(d.monster)!.push(d.location);
                            }
                          }
                          const entries = [...byMonster.entries()];
                          const showAll = entries.length <= 4;
                          const visible = showAll ? entries : entries.slice(0, 3);
                          return (
                            <>
                              {visible.map(([monster, zones]) => (
                                <div key={monster}>
                                  <span className="text-text-primary">{monster}</span>
                                  {zones.length > 0 && (
                                    <span className="text-text-muted ml-1">
                                      ({zones.slice(0, 2).join(", ")}{zones.length > 2 ? "…" : ""})
                                    </span>
                                  )}
                                </div>
                              ))}
                              {!showAll && (
                                <div className="text-text-muted italic">
                                  +{entries.length - 3} more monsters
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </td>
                  {loaded && (
                    <td className="py-2 px-3 text-right">
                      {usedInCount > 0 ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            filterRecipesByIngredient(item.typeId, item.name);
                          }}
                          className="text-accent text-xs hover:underline hover:text-accent/80 cursor-pointer"
                          title={`Show all recipes using ${item.name}`}
                        >
                          {usedInCount}
                        </button>
                      ) : (
                        <span className="text-text-muted text-xs">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[{ label: "🔗 View on Wiki", onClick: () => openInBrowser(wikiUrl(ctxMenu.name)) }]}
        />
      )}

      {selectedItem && (
        <IngredientDetailModal
          item={selectedItem}
          wikiDrops={monsterDrops[selectedItem.name] ?? null}
          onClose={() => setSelectedItem(null)}
        />
      )}

      <Pagination page={page} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}

