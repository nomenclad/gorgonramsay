import type { GatheringRoute } from "./plannerUtils";

interface Props {
  gatheringRoute: GatheringRoute;
  cookingZone: string;
}

export function StorageTab({ gatheringRoute, cookingZone }: Props) {
  const { zoneStops } = gatheringRoute;

  if (zoneStops.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">
        No items need to be retrieved from storage. Everything is on your person or needs to be acquired.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">
        Visit these vaults to collect ingredients. Zones are ordered to minimize travel —
        your cooking zone ({cookingZone || "not set"}) is listed last.
      </p>

      {zoneStops.map((zs) => (
        <div key={zs.zone} className="bg-bg-secondary rounded-lg p-3 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-sm font-semibold ${zs.zone === cookingZone ? "text-accent" : "text-text-primary"}`}>
              {zs.zone}
            </span>
            {zs.zone === cookingZone && (
              <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded">Cooking Zone</span>
            )}
          </div>

          <div className="space-y-2">
            {zs.vaults.map((vs) => (
              <div key={vs.vault} className="ml-2">
                <div className="text-xs font-medium text-text-secondary mb-0.5">{vs.label}</div>
                <ul className="ml-3 space-y-0.5">
                  {vs.items.map((item) => (
                    <li key={item.itemCode} className="flex items-center gap-2 text-xs">
                      <span className="text-accent font-medium">×{item.toCollect}</span>
                      <span className="text-text-primary">{item.itemName}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
