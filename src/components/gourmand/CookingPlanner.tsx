/**
 * Cooking planner sub-component within the Gourmand tab. Resolves crafting chains
 * for planned recipes, builds vault-gathering routes, and renders a modal with
 * categorized ingredient lists (vendor, gather, craft, storage).
 * Distinct from planner/CookingPlanner.tsx which is the main Planner tab container.
 */
import { useState, useMemo, useCallback } from "react";
import { useGameDataStore, type RecipeIndexes } from "../../stores/gameDataStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { ItemTooltip } from "../common/ItemTooltip";
import { getVaultZone, getAllZones } from "../../lib/vaultResolver";
import { getAcquisitionMethods, type AcquisitionMethod } from "../../lib/sourceResolver";
import { FOOD_SKILLS, formatSkillName } from "../../lib/foodSkills";
import { useMonsterDrops } from "../../hooks/useMonsterDrops";
import type { FoodItem } from "../../lib/parsers/gourmandParser";
import type { Recipe } from "../../types/recipe";
import type { Item } from "../../types/item";

/** Produce a short human-readable source label for an ingredient. */
function sourceLabel(methods: AcquisitionMethod[]): string {
  const vendors = methods.filter((m) => m.kind === "vendor") as Extract<AcquisitionMethod, { kind: "vendor" }>[];
  if (vendors.length > 0) {
    const v = vendors[0];
    return v.area ? `${v.npcName ?? "Vendor"} (${v.area})` : (v.npcName ?? "Vendor");
  }
  const other = methods.find((m) => m.kind !== "inventory" && m.kind !== "vendor");
  if (!other) return "Unknown";
  switch (other.kind) {
    case "gather":  return "Gather / Harvest";
    case "monster": return "Monster drop";
    case "fishing": return "Fishing";
    case "quest":   return "Quest reward";
    case "craft":   return "Craftable";
    default:        return "Other";
  }
}

// ─── Crafting chain resolver ────────────────────────────────────────────────

interface CraftingStep {
  recipeId: string;
  recipeName: string;
  skill: string;
  levelReq: number;
  resultItemCode: number;
  resultItemName: string;
  resultQty: number;    // how many the recipe produces per run
  runs: number;         // how many times to execute the recipe
  ingredientsPerRun: { itemCode: number; itemName: string; qty: number }[];
}

const MAX_CRAFT_DEPTH = 8;

/**
 * Recursively expands a map of { itemCode → totalNeeded } through food-skill
 * crafting chains, collecting:
 *  - rawItems  : leaf ingredients that must be gathered / purchased
 *  - stepsMap  : intermediate crafting steps that must be performed
 */
function resolveIngredients(
  directTotals: Map<number, number>,
  recipeIndexes: RecipeIndexes | null,
  getItemByCode: (code: number) => Item | undefined,
  getItemQuantity: (code: number) => number = () => 0
): {
  rawItems: Map<number, { itemName: string; needed: number }>;
  stepsMap: Map<string, CraftingStep>;
} {
  const rawItems = new Map<number, { itemName: string; needed: number }>();
  const stepsMap = new Map<string, CraftingStep>();
  // Track how much of each item has already been "allocated" from inventory
  const allocated = new Map<number, number>();

  function expand(itemCode: number, qty: number, visited: Set<number>, depth: number) {
    const name = getItemByCode(itemCode)?.Name ?? `Item #${itemCode}`;

    // If inventory covers this need (accounting for prior allocations), treat as leaf
    const alreadyAllocated = allocated.get(itemCode) ?? 0;
    const available = Math.max(0, getItemQuantity(itemCode) - alreadyAllocated);
    if (available >= qty) {
      allocated.set(itemCode, alreadyAllocated + qty);
      const ex = rawItems.get(itemCode);
      if (ex) ex.needed += qty;
      else rawItems.set(itemCode, { itemName: name, needed: qty });
      return;
    }
    // Partially covered: allocate what we have, craft the rest
    const stillNeeded = qty - available;
    if (available > 0) {
      allocated.set(itemCode, alreadyAllocated + available);
      const ex = rawItems.get(itemCode);
      if (ex) ex.needed += available;
      else rawItems.set(itemCode, { itemName: name, needed: available });
    }

    const craftRecipe = recipeIndexes
      ? (recipeIndexes.byResultItem.get(itemCode) ?? []).find((r) => FOOD_SKILLS.has(r.Skill))
      : null;

    // Leaf: not craftable, cycle detected, or depth limit reached
    if (!craftRecipe || visited.has(itemCode) || depth >= MAX_CRAFT_DEPTH) {
      const ex = rawItems.get(itemCode);
      if (ex) ex.needed += stillNeeded;
      else rawItems.set(itemCode, { itemName: name, needed: stillNeeded });
      return;
    }

    const resultQty =
      craftRecipe.ResultItems.find((ri) => ri.ItemCode === itemCode)?.StackSize ?? 1;
    const runs = Math.ceil(stillNeeded / resultQty);

    // Aggregate this crafting step (same recipe may appear from multiple parent paths)
    const existing = stepsMap.get(craftRecipe.id);
    if (existing) {
      existing.runs += runs;
    } else {
      stepsMap.set(craftRecipe.id, {
        recipeId: craftRecipe.id,
        recipeName: craftRecipe.Name,
        skill: craftRecipe.Skill,
        levelReq: craftRecipe.SkillLevelReq,
        resultItemCode: itemCode,
        resultItemName: name,
        resultQty,
        runs,
        ingredientsPerRun: craftRecipe.Ingredients.map((ing) => ({
          itemCode: ing.ItemCode,
          itemName: getItemByCode(ing.ItemCode)?.Name ?? `Item #${ing.ItemCode}`,
          qty: ing.StackSize,
        })),
      });
    }

    // Recurse into sub-ingredients
    const newVisited = new Set(visited);
    newVisited.add(itemCode);
    for (const ing of craftRecipe.Ingredients) {
      expand(ing.ItemCode, ing.StackSize * runs, newVisited, depth + 1);
    }
  }

  for (const [itemCode, qty] of directTotals) {
    expand(itemCode, qty, new Set(), 0);
  }

  return { rawItems, stepsMap };
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  foods: FoodItem[];
  completions: Record<string, number>;
  recipeByName: Map<string, Recipe>;
  onClose: () => void;
}

interface VaultStop {
  vault: string;
  label: string;
  items: { itemName: string; itemCode: number; toCollect: number }[];
}

interface ZoneStop {
  zone: string;
  vaults: VaultStop[];
}

const ON_PERSON_VAULT = "__on_person__";
const SADDLEBAG_VAULT = "Saddlebag";

type IngredientFilter = "all" | "ready" | "gathering";

export function CookingPlanner({ foods, completions, recipeByName, onClose }: Props) {
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const fmtVault = useGameDataStore((s) => s.formatVaultName);
  const recipeIndexes = useGameDataStore((s) => s.recipeIndexes);
  const getItemQuantity = useInventoryStore((s) => s.getItemQuantity);
  const getItemLocations = useInventoryStore((s) => s.getItemLocations);
  const inventoryLoaded = useInventoryStore((s) => !!s.importTimestamp);
  const monsterDrops = useMonsterDrops();

  // Track which "Still Need to Acquire" rows are expanded
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const toggleExpanded = useCallback((code: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const [cookingZone, setCookingZone] = useState<string>(
    () => localStorage.getItem("cookingZone") ?? ""
  );
  const [ingredientFilter, setIngredientFilter] = useState<IngredientFilter>("all");

  function handleZoneChange(zone: string) {
    setCookingZone(zone);
    localStorage.setItem("cookingZone", zone);
  }

  // From the passed (already-filtered) list, keep foods with a known recipe
  const cookedFoods = useMemo(() => {
    const firstTime = foods.filter(
      (f) => f.hasTracking && f.recipeInternalName! in completions && !completions[f.recipeInternalName!]
    );
    if (firstTime.length === 0) {
      return foods.filter((f) => f.hasTracking && f.recipeInternalName! in completions);
    }
    return firstTime;
  }, [foods, completions]);

  // Apply ingredient availability filter before building the plan
  const filteredCookedFoods = useMemo(() => {
    if (ingredientFilter === "all" || !inventoryLoaded) return cookedFoods;
    return cookedFoods.filter((food) => {
      const recipe = recipeByName.get(food.recipeInternalName!);
      if (!recipe) return ingredientFilter === "gathering";
      const allAvailable = recipe.Ingredients.every(
        (ing) => getItemQuantity(ing.ItemCode) >= ing.StackSize
      );
      return ingredientFilter === "ready" ? allAvailable : !allAvailable;
    });
  }, [cookedFoods, ingredientFilter, inventoryLoaded, recipeByName, getItemQuantity]);

  // Badge counts for filter buttons
  const readyCount = useMemo(() => {
    if (!inventoryLoaded) return 0;
    return cookedFoods.filter((food) => {
      const recipe = recipeByName.get(food.recipeInternalName!);
      if (!recipe) return false;
      return recipe.Ingredients.every((ing) => getItemQuantity(ing.ItemCode) >= ing.StackSize);
    }).length;
  }, [cookedFoods, inventoryLoaded, recipeByName, getItemQuantity]);

  // ── Core data: food list, direct totals, expanded raw materials, crafting steps ──
  const { foodList, directTotals, rawMaterials, craftingSteps } = useMemo(() => {
    const foodList: { food: FoodItem; recipe: Recipe }[] = [];
    const directTotals = new Map<number, number>(); // aggregated direct ingredients

    for (const food of filteredCookedFoods) {
      const recipe = recipeByName.get(food.recipeInternalName!);
      if (!recipe) continue;
      foodList.push({ food, recipe });
      for (const ing of recipe.Ingredients) {
        directTotals.set(ing.ItemCode, (directTotals.get(ing.ItemCode) ?? 0) + ing.StackSize);
      }
    }

    foodList.sort(
      (a, b) =>
        a.recipe.SkillLevelReq - b.recipe.SkillLevelReq ||
        a.food.itemName.localeCompare(b.food.itemName)
    );

    // Expand crafting chains (pass getItemQuantity so already-owned intermediates aren't re-expanded)
    const { rawItems, stepsMap } = resolveIngredients(directTotals, recipeIndexes, getItemByCode, getItemQuantity);

    // Build display-ready raw materials list
    const rawMaterials = Array.from(rawItems.entries())
      .map(([itemCode, { itemName, needed }]) => {
        const inInventory = getItemQuantity(itemCode);
        const toGet = Math.max(0, needed - inInventory);
        const methods = getAcquisitionMethods(itemCode, inInventory);
        const source = toGet === 0 ? "In inventory" : sourceLabel(methods);
        return { itemCode, itemName, needed, inInventory, toGet, source };
      })
      .sort((a, b) => b.needed - a.needed || a.itemName.localeCompare(b.itemName));

    // Sort crafting steps: lowest level first (craft intermediates before finals)
    const craftingSteps = Array.from(stepsMap.values()).sort(
      (a, b) => a.levelReq - b.levelReq || a.recipeName.localeCompare(b.recipeName)
    );

    return { foodList, directTotals, rawMaterials, craftingSteps };
  }, [filteredCookedFoods, recipeByName, recipeIndexes, getItemByCode, getItemQuantity]);

  // ── Gathering route (based on expanded raw materials) ──
  const gatheringRoute = useMemo(() => {
    if (!inventoryLoaded || foodList.length === 0) return { zoneStops: [], stillNeeded: [], saddlebagItems: [], altTransfers: [] };

    const vaultItems = new Map<string, { itemName: string; itemCode: number; toCollect: number }[]>();
    const saddlebagItems: { itemName: string; itemCode: number; toCollect: number }[] = [];
    const stillNeeded: { itemName: string; itemCode: number; shortfall: number }[] = [];

    for (const rm of rawMaterials) {
      const locations = getItemLocations(rm.itemCode);
      const onPerson = locations.find((l) => l.vault === ON_PERSON_VAULT)?.quantity ?? 0;
      const inSaddlebag = locations.find((l) => l.vault === SADDLEBAG_VAULT)?.quantity ?? 0;
      let shortfall = Math.max(0, rm.needed - onPerson);
      if (shortfall <= 0) continue;

      // Draw from saddlebag before vaults (saddlebag travels with you)
      if (inSaddlebag > 0 && shortfall > 0) {
        const fromBag = Math.min(inSaddlebag, shortfall);
        saddlebagItems.push({ itemName: rm.itemName, itemCode: rm.itemCode, toCollect: fromBag });
        shortfall -= fromBag;
      }
      if (shortfall <= 0) continue;

      const storageLocations = locations
        .filter((l) => l.vault !== ON_PERSON_VAULT && l.vault !== SADDLEBAG_VAULT)
        .sort((a, b) => b.quantity - a.quantity);

      for (const loc of storageLocations) {
        if (shortfall <= 0) break;
        const toCollect = Math.min(loc.quantity, shortfall);
        if (!vaultItems.has(loc.vault)) vaultItems.set(loc.vault, []);
        vaultItems.get(loc.vault)!.push({ itemName: rm.itemName, itemCode: rm.itemCode, toCollect });
        shortfall -= toCollect;
      }

      if (shortfall > 0) stillNeeded.push({ itemName: rm.itemName, itemCode: rm.itemCode, shortfall });
    }

    const zoneMap = new Map<string, VaultStop[]>();
    for (const [vault, items] of vaultItems.entries()) {
      const zone = getVaultZone(vault) ?? "Unknown";
      if (!zoneMap.has(zone)) zoneMap.set(zone, []);
      zoneMap.get(zone)!.push({
        vault,
        label: fmtVault(vault),
        items: items.sort((a, b) => a.itemName.localeCompare(b.itemName)),
      });
    }

    const zoneStops: ZoneStop[] = Array.from(zoneMap.entries())
      .map(([zone, vaults]) => ({
        zone,
        vaults: vaults.sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => {
        if (cookingZone && a.zone === cookingZone) return 1;
        if (cookingZone && b.zone === cookingZone) return -1;
        if (a.zone === "Unknown") return 1;
        if (b.zone === "Unknown") return -1;
        return a.zone.localeCompare(b.zone);
      });

    return {
      zoneStops,
      stillNeeded,
      saddlebagItems: saddlebagItems.sort((a, b) => a.itemName.localeCompare(b.itemName)),
      altTransfers: [],
    };
  }, [foodList, rawMaterials, getItemLocations, inventoryLoaded, fmtVault, cookingZone]);

  const allZones = useMemo(() => getAllZones(), []);
  const alreadyHaveAll = rawMaterials.length > 0 && rawMaterials.every((i) => i.toGet === 0);
  const totalVaultStops = gatheringRoute.zoneStops.reduce((n, z) => n + z.vaults.length, 0);
  const hasRoute = gatheringRoute.zoneStops.length > 0 || gatheringRoute.stillNeeded.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-bg-primary border border-border rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold">Cooking Planner</h2>
            <p className="text-sm text-text-muted mt-0.5">
              {foodList.length === 0
                ? ingredientFilter === "ready"
                  ? "No foods cookable with current inventory"
                  : "No foods to cook right now"
                : `${foodList.length} food${foodList.length !== 1 ? "s" : ""} to cook for Gourmand XP`}
            </p>
          </div>

          {/* Ingredient availability filter */}
          {inventoryLoaded && (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <label className="text-xs text-text-muted">Ingredients</label>
              <div className="flex gap-1 bg-bg-secondary rounded-lg p-0.5">
                {(
                  [
                    { key: "all" as const,       label: "All" },
                    { key: "ready" as const,     label: `Can Make Now (${readyCount})` },
                    { key: "gathering" as const, label: "Needs Gathering" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setIngredientFilter(key)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      ingredientFilter === key
                        ? "bg-accent text-white"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cooking location selector */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <label className="text-xs text-text-muted">Cooking Location</label>
            <select
              value={cookingZone}
              onChange={(e) => handleZoneChange(e.target.value)}
              className="bg-bg-secondary border border-border rounded px-2 py-1 text-sm text-text-primary max-w-40"
            >
              <option value="">Select zone…</option>
              {allZones.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </div>

          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl p-1 shrink-0">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 text-sm">
          {foodList.length === 0 && (
            <p className="text-center text-text-muted py-8">
              Nothing to cook — either you've eaten everything you have a recipe for, or no recipe data matched.
            </p>
          )}

          {/* ── Gathering route ── */}
          {hasRoute && (
            <section>
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3 border-b border-border/50 pb-1">
                Gathering Route
                <span className="ml-2 normal-case font-normal text-text-muted">
                  — {gatheringRoute.zoneStops.length} zone{gatheringRoute.zoneStops.length !== 1 ? "s" : ""}, {totalVaultStops} stop{totalVaultStops !== 1 ? "s" : ""}
                  {cookingZone && <span className="ml-1">→ cook in {cookingZone}</span>}
                </span>
              </h3>
              <div className="space-y-2">
                {gatheringRoute.zoneStops.map((zoneStop, zIdx) => {
                  const isCookingZone = !!cookingZone && zoneStop.zone === cookingZone;
                  const isLast = zIdx === gatheringRoute.zoneStops.length - 1;
                  return (
                    <div
                      key={zoneStop.zone}
                      className={`rounded-lg border ${isCookingZone ? "border-accent/40 bg-accent/5" : "border-border/50 bg-bg-secondary"}`}
                    >
                      <div className={`flex items-center gap-2 px-3 py-2 border-b ${isCookingZone ? "border-accent/30" : "border-border/30"}`}>
                        <span className="text-xs font-semibold">
                          <span className="text-text-muted mr-1">{isLast && cookingZone ? "→" : `${zIdx + 1}.`}</span>
                          <span className={isCookingZone ? "text-accent" : "text-text-primary"}>{zoneStop.zone}</span>
                        </span>
                        {isCookingZone && (
                          <span className="text-[10px] text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded">🍳 Cook here</span>
                        )}
                      </div>
                      <div className="px-3 py-2 space-y-2">
                        {zoneStop.vaults.map((stop) => (
                          <div key={stop.vault}>
                            <div className="text-xs font-medium text-text-secondary mb-1">{stop.label}</div>
                            <ul className="space-y-1 ml-2">
                              {stop.items.map((item) => (
                                <li key={item.itemCode} className="flex items-center gap-2 text-xs">
                                  <span className="text-gold font-medium shrink-0">×{item.toCollect}</span>
                                  <ItemTooltip itemCode={item.itemCode} quantity={getItemQuantity(item.itemCode)}>
                                    <span className="text-text-primary cursor-default">{item.itemName}</span>
                                  </ItemTooltip>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {cookingZone && !gatheringRoute.zoneStops.find((z) => z.zone === cookingZone) && (
                  <div className="rounded-lg border border-accent/40 bg-accent/5 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-text-muted">→</span>
                      <span className="text-xs font-semibold text-accent">{cookingZone}</span>
                      <span className="text-[10px] text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded">🍳 Cook here</span>
                    </div>
                  </div>
                )}

                {gatheringRoute.stillNeeded.length > 0 && (
                  <div className="bg-bg-secondary rounded-lg p-3 border border-error/20">
                    <div className="text-xs font-medium text-error mb-1.5">
                      Still Need to Acquire ({gatheringRoute.stillNeeded.length})
                    </div>
                    <ul className="space-y-0.5">
                      {gatheringRoute.stillNeeded.map((item) => {
                        const cdnMethods = getAcquisitionMethods(item.itemCode, 0).filter(
                          (m) => m.kind === "vendor" || m.kind === "gather" || m.kind === "fishing"
                        );
                        const wikiDrops = monsterDrops[item.itemName] ?? null;
                        const hasDetails = cdnMethods.length > 0 || (wikiDrops && wikiDrops.length > 0);
                        const expanded = expandedItems.has(item.itemCode);

                        // Deduplicate monsters → zones
                        const byMonster = new Map<string, string[]>();
                        if (wikiDrops) {
                          for (const d of wikiDrops) {
                            if (!byMonster.has(d.monster)) byMonster.set(d.monster, []);
                            if (d.location && !byMonster.get(d.monster)!.includes(d.location))
                              byMonster.get(d.monster)!.push(d.location);
                          }
                        }

                        return (
                          <li key={item.itemCode} className="text-xs rounded">
                            {/* Row header — always visible */}
                            <button
                              className={`w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-bg-primary/50 text-left ${hasDetails ? "cursor-pointer" : "cursor-default"}`}
                              onClick={() => hasDetails && toggleExpanded(item.itemCode)}
                              disabled={!hasDetails}
                            >
                              <span className="text-error font-medium shrink-0">×{item.shortfall}</span>
                              <ItemTooltip itemCode={item.itemCode} quantity={0}>
                                <span className="text-text-primary">{item.itemName}</span>
                              </ItemTooltip>
                              {hasDetails && (
                                <span className="ml-auto text-text-muted shrink-0">
                                  {expanded ? "▲" : "▼"}
                                </span>
                              )}
                              {!hasDetails && (
                                <span className="ml-auto text-text-muted italic shrink-0">Unknown source</span>
                              )}
                            </button>

                            {/* Expanded source details */}
                            {expanded && hasDetails && (
                              <div className="ml-6 mt-0.5 mb-1 space-y-1 border-l border-border pl-2">
                                {/* Vendors */}
                                {cdnMethods.filter((m) => m.kind === "vendor").map((m, i) => {
                                  const v = m as Extract<typeof m, { kind: "vendor" }>;
                                  return (
                                    <div key={`v-${i}`} className="flex items-baseline gap-1">
                                      <span className="text-accent shrink-0">{v.npcName ?? "Vendor"}</span>
                                      {v.area && <span className="text-text-muted">({v.area})</span>}
                                    </div>
                                  );
                                })}
                                {/* Gather / Fishing */}
                                {cdnMethods.some((m) => m.kind === "gather") && (
                                  <div className="text-text-muted italic">Gather / harvest</div>
                                )}
                                {cdnMethods.some((m) => m.kind === "fishing") && (
                                  <div className="text-text-muted italic">Fishing</div>
                                )}
                                {/* Monster drops */}
                                {byMonster.size > 0 && (
                                  <div className="space-y-0.5">
                                    {[...byMonster.entries()].slice(0, 8).map(([monster, zones]) => (
                                      <div key={monster} className="flex items-baseline gap-1">
                                        <span className="text-text-primary shrink-0">{monster}</span>
                                        {zones.length > 0 && (
                                          <span className="text-text-muted truncate">
                                            — {zones.slice(0, 2).join(", ")}{zones.length > 2 ? "…" : ""}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                    {byMonster.size > 8 && (
                                      <div className="text-text-muted italic">+{byMonster.size - 8} more monsters</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Saddlebag items to retrieve before cooking ── */}
          {gatheringRoute.saddlebagItems.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-accent uppercase tracking-wide mb-3 border-b border-accent/20 pb-1">
                Retrieve from Saddlebag
                <span className="ml-2 normal-case font-normal text-text-muted">
                  — grab these items from your saddlebag before cooking
                </span>
              </h3>
              <div className="flex flex-wrap gap-1">
                {gatheringRoute.saddlebagItems.map((item) => (
                  <span
                    key={item.itemCode}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-accent/10 text-accent"
                  >
                    {item.toCollect}× {item.itemName}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* ── Crafting steps (intermediates) ── */}
          {craftingSteps.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3 border-b border-border/50 pb-1">
                Crafting Steps
                <span className="ml-2 normal-case font-normal text-text-muted">
                  — craft these intermediates before cooking
                </span>
              </h3>
              <div className="space-y-2">
                {craftingSteps.map((step) => {
                  const totalProduced = step.runs * step.resultQty;
                  const haveResult = getItemQuantity(step.resultItemCode);
                  const needResult = directTotals.get(step.resultItemCode) ?? 0;
                  const alreadyHaveEnough = inventoryLoaded && haveResult >= needResult && needResult > 0;

                  return (
                    <div
                      key={step.recipeId}
                      className={`rounded-lg border px-3 py-2.5 ${
                        alreadyHaveEnough
                          ? "border-success/20 bg-success/5 opacity-60"
                          : "border-border/50 bg-bg-secondary"
                      }`}
                    >
                      {/* Step header */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-text-primary text-sm">
                              {step.resultItemName}
                            </span>
                            {alreadyHaveEnough && (
                              <span className="text-[10px] text-success bg-success/10 border border-success/20 px-1.5 py-0.5 rounded">
                                ✓ Have enough
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-text-muted mt-0.5">
                            {formatSkillName(step.skill)} Lv {step.levelReq}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-semibold text-accent">
                            ×{step.runs} run{step.runs !== 1 ? "s" : ""}
                          </div>
                          <div className="text-[11px] text-text-muted">
                            → {totalProduced} produced
                          </div>
                        </div>
                      </div>

                      {/* Ingredients needed for all runs */}
                      <div className="flex flex-wrap gap-1.5">
                        {step.ingredientsPerRun.map((ing) => {
                          const totalNeeded = ing.qty * step.runs;
                          const have = inventoryLoaded ? getItemQuantity(ing.itemCode) : 0;
                          const onHand = have >= totalNeeded;
                          return (
                            <ItemTooltip key={ing.itemCode} itemCode={ing.itemCode} quantity={have}>
                              <span
                                className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border cursor-default select-none ${
                                  !inventoryLoaded
                                    ? "bg-bg-primary text-text-muted border-border"
                                    : onHand
                                    ? "bg-success/10 text-success border-success/30"
                                    : "bg-error/10 text-error border-error/30"
                                }`}
                              >
                                <span className="opacity-70">×{totalNeeded}</span>
                                {ing.itemName}
                              </span>
                            </ItemTooltip>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Raw materials shopping list ── */}
          {rawMaterials.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3 border-b border-border/50 pb-1">
                Raw Materials
                {alreadyHaveAll && (
                  <span className="ml-2 text-success normal-case font-normal">— you have everything!</span>
                )}
                {craftingSteps.length > 0 && (
                  <span className="ml-2 normal-case font-normal text-text-muted">
                    — fully expanded ingredient list
                  </span>
                )}
              </h3>
              <div className="bg-bg-secondary rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-text-secondary">
                      <th className="py-2 px-3">Ingredient</th>
                      <th className="py-2 px-3 text-right w-16">Need</th>
                      <th className="py-2 px-3 text-right w-16">Have</th>
                      <th className="py-2 px-3 text-right w-20">Still Need</th>
                      <th className="py-2 px-3">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawMaterials.map((ing) => (
                      <tr
                        key={ing.itemCode}
                        className={`border-b border-border/30 ${ing.toGet > 0 ? "" : "opacity-50"}`}
                      >
                        <td className="py-1.5 px-3">
                          <ItemTooltip itemCode={ing.itemCode} quantity={ing.inInventory}>
                            <span className="text-text-primary cursor-default">{ing.itemName}</span>
                          </ItemTooltip>
                        </td>
                        <td className="py-1.5 px-3 text-right text-text-muted">{ing.needed}</td>
                        <td className="py-1.5 px-3 text-right text-text-muted">{ing.inInventory}</td>
                        <td className="py-1.5 px-3 text-right">
                          {ing.toGet > 0 ? (
                            <span className="text-error font-medium">{ing.toGet}</span>
                          ) : (
                            <span className="text-success">✓</span>
                          )}
                        </td>
                        <td className="py-1.5 px-3">
                          <span className={`text-[11px] ${ing.toGet === 0 ? "text-success" : "text-text-secondary"}`}>
                            {ing.source}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Foods to cook (with direct ingredient pills) ── */}
          {foodList.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3 border-b border-border/50 pb-1">
                Foods to Cook ({foodList.length})
              </h3>
              <div className="space-y-2">
                {foodList.map(({ food, recipe }) => (
                  <div key={food.internalName} className="bg-bg-secondary rounded-lg px-3 py-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-medium text-text-primary">{food.itemName}</div>
                        <div className="text-xs text-text-muted mt-0.5">
                          {food.foodType} · +{food.gourmandXp.toLocaleString()} Gourmand XP
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-text-muted">{formatSkillName(recipe.Skill)} Lv</div>
                        <div className="text-sm font-medium text-text-primary">{recipe.SkillLevelReq}</div>
                      </div>
                    </div>

                    {/* Direct ingredient pills */}
                    <div className="flex flex-wrap gap-1.5">
                      {recipe.Ingredients.map((ing) => {
                        const qty = getItemQuantity(ing.ItemCode);
                        const onHand = qty >= ing.StackSize;
                        const item = getItemByCode(ing.ItemCode);
                        const name = item?.Name ?? `Item #${ing.ItemCode}`;
                        // Mark if this ingredient itself requires crafting
                        const isCraftedIntermediate = craftingSteps.some(
                          (s) => s.resultItemCode === ing.ItemCode
                        );
                        return (
                          <ItemTooltip key={ing.ItemCode} itemCode={ing.ItemCode} quantity={inventoryLoaded ? qty : 0}>
                            <span
                              className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border cursor-default select-none ${
                                !inventoryLoaded
                                  ? "bg-bg-primary text-text-muted border-border"
                                  : onHand
                                  ? "bg-success/10 text-success border-success/30"
                                  : "bg-error/10 text-error border-error/30"
                              }`}
                            >
                              {ing.StackSize > 1 && <span className="opacity-70">×{ing.StackSize}</span>}
                              {name}
                              {isCraftedIntermediate && (
                                <span className="opacity-50 text-[9px]">⚒</span>
                              )}
                            </span>
                          </ItemTooltip>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
