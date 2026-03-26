/**
 * Planner utility functions: ingredient resolution, raw material aggregation,
 * vault-based gathering routes, and garden-item identification. Extracted from
 * the old CookingPlanner modal and shared across all Planner sub-tabs.
 * To add a new material source type, extend buildRawMaterials and buildGatheringRoute.
 */

import { getVaultZone } from "../../lib/vaultResolver";
import { getAcquisitionMethods, type AcquisitionMethod } from "../../lib/sourceResolver";
import { CRAFT_SKILLS, MERGED_FISHING } from "../../lib/foodSkills";
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
  /** Total quantity needed across all planned recipes */
  totalNeeded: number;
  /** Quantity available in storage vaults (not on person) */
  inStorage: number;
}

/** An item that needs to be transferred from an alt character via Transfer Chest. */
export interface AltTransferItem {
  itemName: string;
  itemCode: number;
  quantity: number;
  /** Name of the alt character who has this item. */
  fromCharacter: string;
  /** Vault where the alt has it stored. */
  fromVault: string;
}

export interface GatheringRoute {
  zoneStops: ZoneStop[];
  stillNeeded: StillNeededItem[];
  /** Items to retrieve from the saddlebag at the cooking zone (always with you). */
  saddlebagItems: { itemName: string; itemCode: number; toCollect: number }[];
  /** Items to transfer from alt characters via Transfer Chest. */
  altTransfers: AltTransferItem[];
}

// ─── Vendor selection helper ────────────────────────────────────────────────

export type VendorInfo = { npcId: string; npcName: string; area: string };

/**
 * Pick the best single vendor for an item.
 * Prefers a vendor in the cooking zone; falls back to the first available.
 */
export function pickBestVendor(
  itemCode: number,
  cookingZone: string
): VendorInfo | null {
  const vendors = getAcquisitionMethods(itemCode, 0).filter(
    (m) => m.kind === "vendor"
  ) as Extract<ReturnType<typeof getAcquisitionMethods>[number], { kind: "vendor" }>[];

  if (vendors.length === 0) return null;

  const inCookingZone = cookingZone
    ? vendors.find((v) => v.area === cookingZone)
    : undefined;
  const best = inCookingZone ?? vendors[0];

  return {
    npcId: best.npcId,
    npcName: best.npcName ?? "Vendor",
    area: best.area ?? "Unknown",
  };
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
      ? (recipeIndexes.byResultItem.get(itemCode) ?? []).find((r) => CRAFT_SKILLS.has(r.Skill))
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
 * Crop names that can be grown via Gardening in Project Gorgon.
 * Sourced from the wiki: https://wiki.projectgorgon.com/wiki/Gardening
 *
 * Vegetables:
 *   Potato, Onion, Cabbage, Beet, Squash, Broccoli, Carrot,
 *   Green Pepper, Red Pepper, Corn, Escarole, Basil, Cantaloupe,
 *   Peas, Soybeans, Tomato, Red-Leaf Lettuce
 *
 * Unique:
 *   Horse Apple, Cotton, Sugarcane, Barley, Pumpkin, Flax,
 *   Oat Groats, Tundra Rye, Evil Pumpkin, Orcish Wheat, Treant Apple
 */
const GARDEN_CROP_NAMES = new Set([
  // Vegetables
  "Potato",
  "Onion",
  "Cabbage",
  "Beet",
  "Squash",
  "Broccoli",
  "Carrot",
  "Green Pepper",
  "Red Pepper",
  "Corn",
  "Escarole",
  "Basil",
  "Cantaloupe",
  "Peas",
  "Soybeans",
  "Tomato",
  "Red-Leaf Lettuce",
  // Unique
  "Horse Apple",
  "Cotton",
  "Sugarcane",
  "Barley",
  "Pumpkin",
  "Flax",
  "Oat Groats",
  "Tundra Rye",
  "Evil Pumpkin",
  "Orcish Wheat",
  "Treant Apple",
]);

/**
 * Build a set of item codes for items that can be grown via Gardening.
 * Uses two signals:
 *  1. Any Gardening-skill recipe that produces the item (via byResultItem).
 *  2. The item's name matches a known garden crop from the wiki.
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

  // 2. Match item names against the known garden crop list
  for (const item of items) {
    if (!GARDEN_CROP_NAMES.has(item.Name)) continue;
    const m = item.id.match(/(\d+)$/);
    if (m) gardenCodes.add(parseInt(m[1], 10));
  }

  return gardenCodes;
}

// ─── Gathering route builder ────────────────────────────────────────────────

const ON_PERSON_VAULT = "__on_person__";
const SADDLEBAG_VAULT = "Saddlebag";

export function buildGatheringRoute(
  rawMaterials: RawMaterial[],
  getItemLocations: (code: number) => { vault: string; quantity: number }[],
  fmtVault: (key: string) => string,
  cookingZone: string,
  /** Optional: item locations from alt characters for cross-character gathering. */
  altItemLocations?: (typeId: number) => import("../../stores/altStore").AltItemLocation[],
): GatheringRoute {
  const vaultItems = new Map<string, { itemName: string; itemCode: number; toCollect: number }[]>();
  const saddlebagItems: { itemName: string; itemCode: number; toCollect: number }[] = [];
  const altTransfers: AltTransferItem[] = [];
  const stillNeeded: StillNeededItem[] = [];

  for (const rm of rawMaterials) {
    const locations = getItemLocations(rm.itemCode);
    // Items on person and in saddlebag are both "with you" — subtract both first
    const onPerson =
      locations.find((l) => l.vault === ON_PERSON_VAULT)?.quantity ?? 0;
    const inSaddlebag =
      locations.find((l) => l.vault === SADDLEBAG_VAULT)?.quantity ?? 0;
    let shortfall = Math.max(0, rm.needed - onPerson);
    if (shortfall <= 0) continue;

    // Draw from saddlebag before going to vaults (saddlebag travels with you)
    if (inSaddlebag > 0 && shortfall > 0) {
      const fromBag = Math.min(inSaddlebag, shortfall);
      saddlebagItems.push({ itemName: rm.itemName, itemCode: rm.itemCode, toCollect: fromBag });
      shortfall -= fromBag;
    }
    if (shortfall <= 0) continue;

    const storageLocations = locations
      .filter((l) => l.vault !== ON_PERSON_VAULT && l.vault !== SADDLEBAG_VAULT)
      .sort((a, b) => b.quantity - a.quantity);
    const totalInStorage = storageLocations.reduce((s, l) => s + l.quantity, 0);

    for (const loc of storageLocations) {
      if (shortfall <= 0) break;
      const toCollect = Math.min(loc.quantity, shortfall);
      if (!vaultItems.has(loc.vault)) vaultItems.set(loc.vault, []);
      vaultItems
        .get(loc.vault)!
        .push({ itemName: rm.itemName, itemCode: rm.itemCode, toCollect });
      shortfall -= toCollect;
    }

    // Check alt characters for remaining shortfall
    if (shortfall > 0 && altItemLocations) {
      const altLocs = altItemLocations(rm.itemCode);
      for (const altLoc of altLocs) {
        if (shortfall <= 0) break;
        const fromAlt = Math.min(altLoc.quantity, shortfall);
        altTransfers.push({
          itemName: rm.itemName,
          itemCode: rm.itemCode,
          quantity: fromAlt,
          fromCharacter: altLoc.charName,
          fromVault: fmtVault(altLoc.vault),
        });
        shortfall -= fromAlt;
      }
    }

    if (shortfall > 0) {
      stillNeeded.push({
        itemName: rm.itemName,
        itemCode: rm.itemCode,
        shortfall,
        totalNeeded: rm.needed,
        inStorage: totalInStorage,
      });
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

  return {
    zoneStops,
    stillNeeded,
    saddlebagItems: saddlebagItems.sort((a, b) => a.itemName.localeCompare(b.itemName)),
    altTransfers: altTransfers.sort((a, b) => a.fromCharacter.localeCompare(b.fromCharacter) || a.itemName.localeCompare(b.itemName)),
  };
}
