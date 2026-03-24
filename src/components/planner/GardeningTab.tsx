import { useInventoryStore } from "../../stores/inventoryStore";
import type { CraftingStep } from "./plannerUtils";

interface Props {
  gardeningSteps: CraftingStep[];
  gardeningZone: string;
}

export function GardeningTab({ gardeningSteps, gardeningZone }: Props) {
  const getItemQuantity = useInventoryStore((s) => s.getItemQuantity);

  if (gardeningSteps.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">
        No gardening is needed for the planned recipes.
      </div>
    );
  }

  // Aggregate all ingredients across all gardening steps for a totals summary
  const totals = new Map<number, { itemName: string; needed: number }>();
  for (const step of gardeningSteps) {
    const totalRuns = step.runs;
    for (const ing of step.ingredientsPerRun) {
      const existing = totals.get(ing.itemCode);
      const needed = ing.qty * totalRuns;
      if (existing) existing.needed += needed;
      else totals.set(ing.itemCode, { itemName: ing.itemName, needed });
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">
        Plant these crops in your garden
        {gardeningZone ? ` in ${gardeningZone}` : ""}.
        Each crop shows the required seeds, water, and fertilizer per batch.
      </p>

      {/* Per-crop details */}
      {gardeningSteps.map((step) => (
        <div key={step.recipeId} className="bg-bg-secondary rounded-lg p-3 border border-border">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-sm font-semibold text-text-primary">{step.resultItemName}</span>
            <span className="text-xs text-text-muted">
              {step.runs} batch{step.runs !== 1 ? "es" : ""} × {step.resultQty} = {step.runs * step.resultQty} total
            </span>
            <span className="text-xs text-text-muted ml-auto">Lv {step.levelReq}</span>
          </div>

          <div className="text-xs text-text-secondary mb-1">Ingredients per batch:</div>
          <div className="flex flex-wrap gap-1.5">
            {step.ingredientsPerRun.map((ing) => {
              const totalNeeded = ing.qty * step.runs;
              const have = getItemQuantity(ing.itemCode);
              const enough = have >= totalNeeded;
              return (
                <span
                  key={ing.itemCode}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${
                    enough
                      ? "bg-success/10 border-success/30 text-success"
                      : "bg-error/10 border-error/30 text-error"
                  }`}
                >
                  <span className="font-medium">{ing.qty}×</span>
                  {ing.itemName}
                  <span className="text-text-muted ml-1">
                    (need {totalNeeded}, have {have})
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      ))}

      {/* Totals summary */}
      <div className="bg-bg-secondary rounded-lg p-3 border border-border">
        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
          Total Gardening Materials Needed
        </div>
        <div className="space-y-1">
          {Array.from(totals.entries())
            .sort((a, b) => a[1].itemName.localeCompare(b[1].itemName))
            .map(([itemCode, { itemName, needed }]) => {
              const have = getItemQuantity(itemCode);
              const shortfall = Math.max(0, needed - have);
              return (
                <div key={itemCode} className="flex items-center gap-2 text-xs">
                  <span className={`font-medium w-10 text-right ${shortfall > 0 ? "text-error" : "text-success"}`}>
                    ×{needed}
                  </span>
                  <span className="text-text-primary">{itemName}</span>
                  <span className="text-text-muted ml-auto">
                    {shortfall > 0 ? `need ${shortfall} more` : "have enough"}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
