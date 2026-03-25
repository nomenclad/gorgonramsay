/**
 * Parses xptables.json from the CDN.
 *
 * Each XP table maps skill levels to XP amounts. Skills reference these
 * tables by InternalName to determine XP rewards at each level.
 *
 * To handle game data format changes:
 *   - Add new optional fields to RawXpTableData below and XpTable in types/xpTable.ts.
 */
import type { XpTable } from "../../types/xpTable";

interface RawXpTableData {
  InternalName: string;
  XpAmounts: number[];
}

export function parseXpTables(json: string): XpTable[] {
  const raw: Record<string, RawXpTableData> = JSON.parse(json);
  return Object.entries(raw).map(([key, data]) => ({
    id: key,
    ...data,
  }));
}
