import { getAcquisitionMethods } from "../../lib/sourceResolver";
import type { StillNeededItem } from "./plannerUtils";

interface Props {
  purchaseNeeded: StillNeededItem[];
}

export function PurchasingTab({ purchaseNeeded }: Props) {
  if (purchaseNeeded.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">
        Nothing to purchase! All ingredients are available from other sources.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-text-muted mb-3">
        These items can be purchased from NPC vendors. Visit each vendor to buy the required quantities.
      </p>

      {purchaseNeeded.map((item) => {
        const vendors = getAcquisitionMethods(item.itemCode, 0).filter(
          (m) => m.kind === "vendor"
        ) as Extract<ReturnType<typeof getAcquisitionMethods>[number], { kind: "vendor" }>[];

        return (
          <div key={item.itemCode} className="bg-bg-secondary rounded border border-border px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-error font-medium shrink-0">×{item.shortfall}</span>
              <span className="text-text-primary font-medium">{item.itemName}</span>
            </div>
            {vendors.length > 0 && (
              <div className="mt-1 ml-6 space-y-0.5">
                {vendors.map((v, i) => (
                  <div key={i} className="flex items-baseline gap-1 text-xs">
                    <span className="text-text-muted">Vendor:</span>
                    <span className="text-accent">{v.npcName ?? "Vendor"}</span>
                    {v.area && <span className="text-text-muted">({v.area})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
