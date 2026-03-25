/**
 * Types for inventory export data from the in-game /exportinventory command.
 *
 * Lists every item the character owns across all storage locations.
 * If the export format changes, add new optional fields here and update inventoryParser.ts.
 */
export interface InventoryItem {
  /** Numeric item type — maps to item code for cross-referencing with items.json (e.g. "item_{TypeID}"). */
  TypeID: number;
  /** Which vault/container the item is stored in (e.g. "MainInventory", "StorageVault_Serbule"). */
  StorageVault: string;
  StackSize: number;
  Value: number;
  Name: string;
  PetHusbandryState?: string;
  AttunedTo?: string;
}

export interface InventoryExport {
  Character: string;
  ServerName: string;
  Timestamp: string;
  Report: string;
  ReportVersion: number;
  Items: InventoryItem[];
}

/** An item aggregated across all storage locations, with per-vault breakdowns. */
export interface AggregatedItem {
  typeId: number;
  name: string;
  totalQuantity: number;
  value: number;
  locations: {
    vault: string;
    quantity: number;
  }[];
}
