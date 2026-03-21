export interface InventoryItem {
  TypeID: number;
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
