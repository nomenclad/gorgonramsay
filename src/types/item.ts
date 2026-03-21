export interface Item {
  id: string;
  Name: string;
  InternalName: string;
  Description?: string;
  IconId?: number;
  Keywords: string[];
  MaxStackSize: number;
  Value: number;
  NumUses?: number;
}
