import type {
  InventoryExport,
  InventoryItem,
  AggregatedItem,
} from "../../types/inventory";

export function parseInventory(json: string): InventoryExport {
  const parsed = JSON.parse(json) as InventoryExport;
  // Guard against malformed or incomplete exports
  if (!Array.isArray(parsed.Items)) parsed.Items = [];
  return parsed;
}

export function aggregateInventory(items: InventoryItem[]): AggregatedItem[] {
  const grouped = new Map<
    number,
    { name: string; totalQuantity: number; value: number; locations: Map<string, number> }
  >();

  for (const item of items) {
    if (!item || item.TypeID == null) continue;
    const vaultKey = item.StorageVault ?? "__on_person__";
    const existing = grouped.get(item.TypeID);
    if (existing) {
      existing.totalQuantity += item.StackSize;
      const vaultQty = existing.locations.get(vaultKey) ?? 0;
      existing.locations.set(vaultKey, vaultQty + item.StackSize);
    } else {
      const locations = new Map<string, number>();
      locations.set(vaultKey, item.StackSize);
      grouped.set(item.TypeID, {
        name: item.Name ?? "Unknown Item",
        totalQuantity: item.StackSize,
        value: item.Value ?? 0,
        locations,
      });
    }
  }

  const result: AggregatedItem[] = [];
  for (const [typeId, data] of grouped) {
    const locations: { vault: string; quantity: number }[] = [];
    for (const [vault, quantity] of data.locations) {
      locations.push({ vault, quantity });
    }
    result.push({
      typeId,
      name: data.name,
      totalQuantity: data.totalQuantity,
      value: data.value,
      locations,
    });
  }

  return result;
}
