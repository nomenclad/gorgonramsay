import type {
  InventoryExport,
  InventoryItem,
  AggregatedItem,
} from "../../types/inventory";

export function parseInventory(json: string): InventoryExport {
  return JSON.parse(json) as InventoryExport;
}

export function aggregateInventory(items: InventoryItem[]): AggregatedItem[] {
  const grouped = new Map<
    number,
    { name: string; totalQuantity: number; value: number; locations: Map<string, number> }
  >();

  for (const item of items) {
    const existing = grouped.get(item.TypeID);
    if (existing) {
      existing.totalQuantity += item.StackSize;
      const vaultQty = existing.locations.get(item.StorageVault) ?? 0;
      existing.locations.set(item.StorageVault, vaultQty + item.StackSize);
    } else {
      const locations = new Map<string, number>();
      locations.set(item.StorageVault, item.StackSize);
      grouped.set(item.TypeID, {
        name: item.Name,
        totalQuantity: item.StackSize,
        value: item.Value,
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
