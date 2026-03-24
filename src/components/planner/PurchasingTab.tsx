import { pickBestVendor } from "./plannerUtils";
import type { StillNeededItem } from "./plannerUtils";

interface Props {
  purchaseNeeded: StillNeededItem[];
  cookingZone: string;
}

export function PurchasingTab({ purchaseNeeded, cookingZone }: Props) {
  if (purchaseNeeded.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">
        Nothing to purchase! All ingredients are available from other sources.
      </div>
    );
  }

  // Group items by vendor zone for a cleaner shopping list
  const byZone = new Map<string, { item: StillNeededItem; npcName: string }[]>();
  for (const item of purchaseNeeded) {
    const vendor = pickBestVendor(item.itemCode, cookingZone);
    if (!vendor) continue;
    const zone = vendor.area;
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone)!.push({ item, npcName: vendor.npcName });
  }

  // Sort zones: cooking zone first, then alphabetical
  const sortedZones = [...byZone.entries()].sort((a, b) => {
    if (cookingZone && a[0] === cookingZone) return -1;
    if (cookingZone && b[0] === cookingZone) return 1;
    return a[0].localeCompare(b[0]);
  });

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">
        These items can be purchased from NPC vendors.
        {cookingZone && " Vendors in your cooking zone are preferred where available."}
      </p>

      {sortedZones.map(([zone, entries]) => (
        <div key={zone} className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">{zone}</h3>
            {zone === cookingZone && (
              <span className="text-xs bg-accent/15 text-accent px-1.5 py-0.5 rounded">Cooking Zone</span>
            )}
          </div>
          {entries.map(({ item, npcName }) => (
            <div key={item.itemCode} className="bg-bg-secondary rounded border border-border px-3 py-2 flex items-center gap-2 text-sm">
              <span className="text-error font-medium shrink-0">×{item.shortfall}</span>
              <span className="text-text-primary font-medium">{item.itemName}</span>
              <span className="text-text-muted text-xs ml-auto">from <span className="text-accent">{npcName}</span></span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
