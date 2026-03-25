/**
 * Parses sources_items.json and sources_recipes.json from the CDN.
 *
 * These files provide acquisition info — where to buy, learn, or find items
 * and recipes (vendors, trainers, monster drops, quests, etc.).
 *
 * To handle game data format changes:
 *   - Add new source types to SourceType in types/source.ts.
 *   - Add new optional fields to SourceEntry as needed.
 */
import type { SourcesData } from "../../types";

export function parseSourcesData(json: string): SourcesData {
  return JSON.parse(json) as SourcesData;
}

/**
 * Parse npcs.json and extract NPC name + area for display.
 */
export function parseNpcNames(json: string): Map<string, { name: string; area?: string }> {
  const raw: Record<string, { Name?: string; AreaFriendlyName?: string; AreaName?: string }> =
    JSON.parse(json);
  const map = new Map<string, { name: string; area?: string }>();

  for (const [npcId, npc] of Object.entries(raw)) {
    if (npc.Name) {
      map.set(npcId, {
        name: npc.Name,
        area: npc.AreaFriendlyName ?? npc.AreaName,
      });
    }
  }
  return map;
}
