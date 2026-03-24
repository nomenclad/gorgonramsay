/**
 * Extracted algorithms from the old CookingPlanner modal.
 * Used by the new tabbed Planner page and its sub-tabs.
 */

import { getVaultZone } from "../../lib/vaultResolver";
import { getAcquisitionMethods, type AcquisitionMethod } from "../../lib/sourceResolver";
import { FOOD_SKILLS, MERGED_FISHING } from "../../lib/foodSkills";
import type { RecipeIndexes } from "../../stores/gameDataStore";
import type { Item } from "../../types/item";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CraftingStep {
  recipeId: string;
  recipeName: string;
  skill: string;
  levelReq: number;
  resultItemCode: number;
  resultItemName: string;
  resultQty: number;
  runs: number;
  ingredientsPerRun: { itemCode: number; itemName: string; qty: number }[];
}

export interface RawMaterial {
  itemCode: number;
  itemName: string;
  needed: number;
  inInventory: number;
  toGet: number;
  source: string;
}

export interface VaultStop {
  vault: string;
  label: string;
  items: { itemName: string; itemCode: number; toCollect: number }[];
}

export interface ZoneStop {
  zone: string;
  vaults: VaultStop[];
}

export interface StillNeededItem {
  itemName: string;
  itemCode: number;
  shortfall: number;
}

export interface GatheringRoute {
  zoneStops: ZoneStop[];
  stillNeeded: StillNeededItem[];
}

// ─── Source label helper ────────────────────────────────────────────────────

export function sourceLabel(methods: AcquisitionMethod[]): string {
  const vendors = methods.filter((m) => m.kind === "vendor") as Extract<
    AcquisitionMethod,
    { kind: "vendor" }
  >[];
  if (vendors.length > 0) {
    const v = vendors[0];
    return v.area ? `${v.npcName ?? "Vendor"} (${v.area})` : (v.npcName ?? "Vendor");
  }
  const other = methods.find((m) => m.kind !== "inventory" && m.kind !== "vendor");
  if (!other) return "Unknown";
  switch (other.kind) {
    case "gather":
      return "Gather / Harvest";
    case "monster":
      return "Monster drop";
    case "fishing":
      return "Fishing";
    case "quest":
      return "Quest reward";
    case "craft":
      return "Craftable";
    default:
      return "Other";
  }
}

// ─── Crafting chain resolver ────────────────────────────────────────────────

const MAX_CRAFT_DEPTH = 8;

export function resolveIngredients(
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
  const allocated = new Map<number, number>();

  function expand(itemCode: number, qty: number, visited: Set<number>, depth: number) {
    const name = getItemByCode(itemCode)?.Name ?? `Item #${itemCode}`;

    const alreadyAllocated = allocated.get(itemCode) ?? 0;
    const available = Math.max(0, getItemQuantity(itemCode) - alreadyAllocated);
    if (available >= qty) {
      allocated.set(itemCode, alreadyAllocated + qty);
      const ex = rawItems.get(itemCode);
      if (ex) ex.needed += qty;
      else rawItems.set(itemCode, { itemName: name, needed: qty });
      return;
    }
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

    if (!craftRecipe || visited.has(itemCode) || depth >= MAX_CRAFT_DEPTH) {
      const ex = rawItems.get(itemCode);
      if (ex) ex.needed += stillNeeded;
      else rawItems.set(itemCode, { itemName: name, needed: stillNeeded });
      return;
    }

    const resultQty =
      craftRecipe.ResultItems.find((ri) => ri.ItemCode === itemCode)?.StackSize ?? 1;
    const runs = Math.ceil(stillNeeded / resultQty);

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

// ─── Raw materials builder ──────────────────────────────────────────────────

export function buildRawMaterials(
  rawItems: Map<number, { itemName: string; needed: number }>,
  getItemQuantity: (code: number) => number,
  recipeIndexes?: RecipeIndexes | null
): RawMaterial[] {
  return Array.from(rawItems.entries())
    .map(([itemCode, { itemName, needed }]) => {
      const inInventory = getItemQuantity(itemCode);
      const toGet = Math.max(0, needed - inInventory);
      const methods = getAcquisitionMethods(itemCode, inInventory);

      // If this item is used as bait in a Fishing/Angling recipe, label it as such
      let source: string;
      if (toGet === 0) {
        source = "In inventory";
      } else {
        const isBait = recipeIndexes
          ? (recipeIndexes.byIngredient.get(itemCode) ?? []).some((r) => MERGED_FISHING.has(r.Skill))
          : false;
        source = isBait ? "Fishing / Angling bait" : sourceLabel(methods);
      }

      return { itemCode, itemName, needed, inInventory, toGet, source };
    })
    .sort((a, b) => b.needed - a.needed || a.itemName.localeCompare(b.itemName));
}

// ─── Garden item identification ─────────────────────────────────────────────

/**
 * Build a set of item codes for items that can be grown via Gardening.
 * Uses two signals:
 *  1. Any Gardening-skill recipe that produces the item (via byResultItem).
 *  2. A matching seed item exists (e.g. "Carrot Seeds" → Carrot is growable).
 */
export function buildGardenItemSet(
  recipeIndexes: RecipeIndexes | null,
  items: Item[]
): Set<number> {
  const gardenCodes = new Set<number>();

  // 1. Items produced by Gardening recipes
  if (recipeIndexes) {
    for (const [itemCode, recipes] of recipeIndexes.byResultItem) {
      if (recipes.some((r) => r.Skill === "Gardening")) {
        gardenCodes.add(itemCode);
      }
    }
  }

  // 2. Items that have a corresponding seed item (e.g. "Carrot Seeds" → "Carrot")
  // Build a name→code lookup for all items
  const nameToCode = new Map<string, number>();
  for (const item of items) {
    const m = item.id.match(/(\d+)$/);
    if (m) nameToCode.set(item.Name.toLowerCase(), parseInt(m[1], 10));
  }

  for (const item of items) {
    // Match patterns like "Carrot Seeds", "Beet Seed", "Potato Eyes"
    const seedMatch = item.Name.match(/^(.+?)\s+(?:Seeds?|Eyes|Cuttings?)$/i);
    if (!seedMatch) continue;
    const cropName = seedMatch[1].toLowerCase();
    const cropCode = nameToCode.get(cropName);
    if (cropCode != null) {
      gardenCodes.add(cropCode);
    }
  }

  return gardenCodes;
}

// ─── Gathering route builder ────────────────────────────────────────────────

const ON_PERSON_VAULT = "__on_person__";

export function buildGatheringRoute(
  rawMaterials: RawMaterial[],
  getItemLocations: (code: number) => { vault: string; quantity: number }[],
  fmtVault: (key: string) => string,
  cookingZone: string
): GatheringRoute {
  const vaultItems = new Map<string, { itemName: string; itemCode: number; toCollect: number }[]>();
  const stillNeeded: StillNeededItem[] = [];

  for (const rm of rawMaterials) {
    const onPerson =
      getItemLocations(rm.itemCode).find((l) => l.vault === ON_PERSON_VAULT)?.quantity ?? 0;
    let shortfall = Math.max(0, rm.needed - onPerson);
    if (shortfall <= 0) continue;

    const storageLocations = getItemLocations(rm.itemCode)
      .filter((l) => l.vault !== ON_PERSON_VAULT)
      .sort((a, b) => b.quantity - a.quantity);

    for (const loc of storageLocations) {
      if (shortfall <= 0) break;
      const toCollect = Math.min(loc.quantity, shortfall);
      if (!vaultItems.has(loc.vault)) vaultItems.set(loc.vault, []);
      vaultItems
        .get(loc.vault)!
        .push({ itemName: rm.itemName, itemCode: rm.itemCode, toCollect });
      shortfall -= toCollect;
    }

    if (shortfall > 0) {
      stillNeeded.push({ itemName: rm.itemName, itemCode: rm.itemCode, shortfall });
    }
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

  return { zoneStops, stillNeeded };
}
