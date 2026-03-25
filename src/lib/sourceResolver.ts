/**
 * Item and recipe source resolver — determines where items can be acquired
 * and where recipes can be learned in Project Gorgon.
 *
 * Uses sources_items.json and sources_recipes.json from the CDN to map items
 * and recipes to their acquisition methods (vendors, crafting, monsters, quests,
 * NPC training, scroll items, etc.).
 *
 * The module maintains three pieces of state loaded at startup:
 *  - sourcesData:       item acquisition sources (vendors, drops, gathering, etc.)
 *  - recipeSourcesData: recipe learning sources (trainers, scrolls, quests, etc.)
 *  - npcNames:          NPC display names and area locations for friendly labels
 *
 * How to change:
 *  - To handle a new source type from the CDN data, add a case to the switch
 *    statements in `getAcquisitionMethods()` or `getRecipeSourceLabels()`.
 *  - The priority order in `getBestMethod()` controls which source is shown
 *    when only one can be displayed (e.g., tooltips).
 */
import type { SourcesData } from "../types";

export type AcquisitionMethod =
  | { kind: "inventory"; quantity: number }
  | { kind: "vendor"; npcId: string; npcName?: string; area?: string }
  | { kind: "craft"; recipeId: number; recipeName?: string }
  | { kind: "monster"; description?: string }
  | { kind: "quest"; questId?: number }
  | { kind: "fishing" }
  | { kind: "gather" }
  | { kind: "other"; description: string };

let sourcesData: SourcesData | null = null;
let recipeSourcesData: SourcesData | null = null;
let npcNames: Map<string, { name: string; area?: string }> = new Map();

export function loadSourcesData(data: SourcesData): void {
  sourcesData = data;
}

export function loadRecipeSourcesData(data: SourcesData): void {
  recipeSourcesData = data;
}

export function loadNpcNames(
  map: Map<string, { name: string; area?: string }>
): void {
  npcNames = map;
}

/** Get NPC display info for a given npc ID string. */
export function getNpcInfo(npcId: string): { name: string; area?: string } {
  return npcNames.get(npcId) ?? { name: formatNpcId(npcId) };
}

export interface RecipeSourceLabel {
  kind: "trainer" | "scroll" | "skill" | "quest" | "hangout" | "gift" | "other";
  label: string;
  detail?: string; // area, item name, etc.
}

/**
 * Get human-readable source labels for where a recipe can be learned.
 * recipeId should match Recipe.id (e.g. "recipe_1").
 */
export function getRecipeSourceLabels(
  recipeId: string,
  getItemByCode: (code: number) => { Name: string } | undefined
): RecipeSourceLabel[] {
  if (!recipeSourcesData) return [];
  const entry = recipeSourcesData[recipeId];
  if (!entry) return [];

  const labels: RecipeSourceLabel[] = [];
  const seen = new Set<string>();

  for (const src of entry.entries) {
    switch (src.type) {
      case "Training": {
        if (!src.npc) break;
        const npc = getNpcInfo(src.npc);
        const key = `trainer:${src.npc}`;
        if (!seen.has(key)) {
          seen.add(key);
          labels.push({ kind: "trainer", label: npc.name, detail: npc.area });
        }
        break;
      }
      case "Item": {
        if (src.itemTypeId == null) break;
        const item = getItemByCode(src.itemTypeId);
        const key = `scroll:${src.itemTypeId}`;
        if (!seen.has(key)) {
          seen.add(key);
          labels.push({
            kind: "scroll",
            label: item?.Name ?? `Item #${src.itemTypeId}`,
          });
        }
        break;
      }
      case "Skill": {
        const key = `skill:${src.skill ?? "?"}`;
        if (!seen.has(key)) {
          seen.add(key);
          labels.push({
            kind: "skill",
            label: src.skill ?? "Skill progression",
          });
        }
        break;
      }
      case "Quest": {
        const key = `quest:${src.questId ?? "?"}`;
        if (!seen.has(key)) {
          seen.add(key);
          labels.push({ kind: "quest", label: "Quest reward" });
        }
        break;
      }
      case "HangOut": {
        if (!src.npc) break;
        const npc = getNpcInfo(src.npc);
        const key = `hangout:${src.npc}`;
        if (!seen.has(key)) {
          seen.add(key);
          labels.push({ kind: "hangout", label: npc.name, detail: npc.area });
        }
        break;
      }
      case "NpcGift": {
        if (!src.npc) break;
        const npc = getNpcInfo(src.npc);
        const key = `gift:${src.npc}`;
        if (!seen.has(key)) {
          seen.add(key);
          labels.push({ kind: "gift", label: npc.name, detail: npc.area });
        }
        break;
      }
      default:
        if (!seen.has("other")) {
          seen.add("other");
          labels.push({ kind: "other", label: "Special unlock" });
        }
    }
  }

  return labels;
}

/**
 * Get acquisition methods for an item by its numeric TypeID.
 * Returns methods sorted by priority (inventory > vendor > craft > other).
 */
export function getAcquisitionMethods(
  typeId: number,
  currentQuantity: number
): AcquisitionMethod[] {
  const methods: AcquisitionMethod[] = [];

  if (currentQuantity > 0) {
    methods.push({ kind: "inventory", quantity: currentQuantity });
  }

  if (!sourcesData) return methods;

  const key = `item_${typeId}`;
  const sources = sourcesData[key];
  if (!sources) return methods;

  for (const entry of sources.entries) {
    switch (entry.type) {
      case "Vendor":
        if (entry.npc) {
          const npcInfo = npcNames.get(entry.npc);
          methods.push({
            kind: "vendor",
            npcId: entry.npc,
            npcName: npcInfo?.name ?? formatNpcId(entry.npc),
            area: npcInfo?.area,
          });
        }
        break;
      case "Barter":
        if (entry.npc) {
          const npcInfo = npcNames.get(entry.npc);
          methods.push({
            kind: "vendor",
            npcId: entry.npc,
            npcName: npcInfo?.name ?? formatNpcId(entry.npc),
            area: npcInfo?.area,
          });
        }
        break;
      case "Recipe":
        if (entry.recipeId) {
          methods.push({ kind: "craft", recipeId: entry.recipeId });
        }
        break;
      case "Monster":
        methods.push({ kind: "monster" });
        break;
      case "Quest":
      case "HangOut":
        methods.push({ kind: "quest", questId: entry.questId ?? entry.hangOutId });
        break;
      case "Angling":
        methods.push({ kind: "fishing" });
        break;
      case "CorpseButchering":
      case "CorpseSkinning":
      case "ResourceInteractor":
        methods.push({ kind: "gather" });
        break;
      default:
        methods.push({ kind: "other", description: entry.type });
    }
  }

  // Deduplicate (keep first of each kind/npc)
  const seen = new Set<string>();
  return methods.filter((m) => {
    const key =
      m.kind === "vendor" ? `vendor:${m.npcId}` : m.kind;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface RecipePurchaseInfo {
  kind: "trainer" | "scroll";
  npcName?: string;
  area?: string;
  /** Council coin cost — only available for scroll items (item.Value). Trainers cost is not in CDN data. */
  cost?: number;
  scrollName?: string;
  /** Item type ID of the scroll — use getAcquisitionMethods to find where it's sold. */
  scrollItemTypeId?: number;
}

/**
 * Returns purchasable sources for a recipe (trainer NPCs and/or scroll items for sale).
 * recipeId format: "recipe_123"
 */
export function getRecipePurchaseInfo(
  recipeId: string,
  getItemByCode: (code: number) => { Name: string; Value: number } | undefined
): RecipePurchaseInfo[] {
  if (!recipeSourcesData) return [];
  const entry = recipeSourcesData[recipeId];
  if (!entry) return [];

  const results: RecipePurchaseInfo[] = [];
  const seen = new Set<string>();

  for (const src of entry.entries) {
    if (src.type === "Training" && src.npc) {
      const npc = getNpcInfo(src.npc);
      const key = `trainer:${src.npc}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ kind: "trainer", npcName: npc.name, area: npc.area });
      }
    } else if (src.type === "Item" && src.itemTypeId != null) {
      const item = getItemByCode(src.itemTypeId);
      const key = `scroll:${src.itemTypeId}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          kind: "scroll",
          scrollName: item?.Name ?? `Item #${src.itemTypeId}`,
          cost: item && item.Value > 0 ? item.Value : undefined,
          scrollItemTypeId: src.itemTypeId,
        });
      }
    }
  }

  return results;
}

/**
 * Get the best single acquisition method for display.
 */
export function getBestMethod(
  typeId: number,
  currentQuantity: number
): AcquisitionMethod {
  const methods = getAcquisitionMethods(typeId, currentQuantity);

  // Priority: inventory > vendor > craft > monster > other
  for (const kind of [
    "inventory",
    "vendor",
    "craft",
    "fishing",
    "gather",
    "monster",
    "quest",
    "other",
  ] as const) {
    const match = methods.find((m) => m.kind === kind);
    if (match) return match;
  }

  return { kind: "other", description: "Unknown" };
}

function formatNpcId(npcId: string): string {
  // Convert "NPC_BriocheTheBarber" to "Brioche The Barber"
  return npcId
    .replace(/^NPC_/, "")
    .replace(/([A-Z])/g, " $1")
    .trim();
}
