/**
 * Parse a user-imported inventory JSON export.
 *
 * The inventory JSON comes from the Project Gorgon in-game /exportinventory
 * command. It lists every item across all storage vaults with quantities.
 *
 * To handle game-data format changes:
 *   - Add new optional fields to InventoryItem in types/inventory.ts.
 *   - The parser validates the top-level shape but trusts individual item
 *     fields — add per-item validation here if new required fields appear.
 */
import type {
  InventoryExport,
  InventoryItem,
  AggregatedItem,
} from "../../types/inventory";

/**
 * Parse and validate an inventory export JSON string.
 * Throws on fundamentally invalid JSON; gracefully handles missing Items array.
 */
export function parseInventory(json: string): InventoryExport {
  const parsed = JSON.parse(json);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid inventory data: expected a JSON object");
  }
  // Guard against malformed or incomplete exports
  if (!Array.isArray(parsed.Items)) parsed.Items = [];
  return parsed as InventoryExport;
}

/**
 * Aggregate inventory items by TypeID across all storage vaults.
 * Combines duplicate item stacks into a single entry with per-vault quantity breakdowns.
 */
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
