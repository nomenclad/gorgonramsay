import type { SourcesData, SourceEntry } from "../types";

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
let npcNames: Map<string, { name: string; area?: string }> = new Map();

export function loadSourcesData(data: SourcesData): void {
  sourcesData = data;
}

export function loadNpcNames(
  map: Map<string, { name: string; area?: string }>
): void {
  npcNames = map;
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
