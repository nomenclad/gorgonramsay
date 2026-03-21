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
