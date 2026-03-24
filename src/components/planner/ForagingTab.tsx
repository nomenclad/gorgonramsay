import { useState, useCallback } from "react";
import { getAcquisitionMethods } from "../../lib/sourceResolver";
import { useMonsterDrops } from "../../hooks/useMonsterDrops";
import type { StillNeededItem } from "./plannerUtils";

interface Props {
  stillNeeded: StillNeededItem[];
}

export function ForagingTab({ stillNeeded }: Props) {
  const monsterDrops = useMonsterDrops();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = useCallback((code: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  if (stillNeeded.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">
        Nothing to forage! All ingredients are available in your storage vaults.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-text-muted mb-3">
        These items are not in any of your storage vaults and must be gathered, purchased from vendors, or farmed from monsters.
      </p>

      {stillNeeded.map((item) => {
        const methods = getAcquisitionMethods(item.itemCode, 0).filter(
          (m) => m.kind === "vendor" || m.kind === "gather" || m.kind === "fishing"
        );
        const wikiDrops = monsterDrops[item.itemName] ?? null;
        const hasDetails = methods.length > 0 || (wikiDrops && wikiDrops.length > 0);
        const isExpanded = expanded.has(item.itemCode);

        // Deduplicate monsters → zones
        const byMonster = new Map<string, string[]>();
        if (wikiDrops) {
          for (const d of wikiDrops) {
            if (!byMonster.has(d.monster)) byMonster.set(d.monster, []);
            if (d.location && !byMonster.get(d.monster)!.includes(d.location))
              byMonster.get(d.monster)!.push(d.location);
          }
        }

        return (
          <div key={item.itemCode} className="bg-bg-secondary rounded border border-border">
            <button
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm ${
                hasDetails ? "cursor-pointer hover:bg-bg-primary/50" : "cursor-default"
              }`}
              onClick={() => hasDetails && toggle(item.itemCode)}
              disabled={!hasDetails}
            >
              <span className="text-error font-medium shrink-0">×{item.shortfall}</span>
              <span className="text-text-primary font-medium">{item.itemName}</span>
              {hasDetails && (
                <span className="ml-auto text-text-muted shrink-0 text-xs">
                  {isExpanded ? "▲" : "▼"}
                </span>
              )}
              {!hasDetails && (
                <span className="ml-auto text-text-muted italic text-xs shrink-0">Unknown source</span>
              )}
            </button>

            {isExpanded && hasDetails && (
              <div className="px-3 pb-2 space-y-1 border-t border-border/50 pt-2 ml-6">
                {/* Vendors */}
                {methods
                  .filter((m) => m.kind === "vendor")
                  .map((m, i) => {
                    const v = m as Extract<typeof m, { kind: "vendor" }>;
                    return (
                      <div key={`v-${i}`} className="flex items-baseline gap-1 text-xs">
                        <span className="text-text-muted">Vendor:</span>
                        <span className="text-accent">{v.npcName ?? "Vendor"}</span>
                        {v.area && <span className="text-text-muted">({v.area})</span>}
                      </div>
                    );
                  })}

                {/* Gather / Fishing */}
                {methods.some((m) => m.kind === "gather") && (
                  <div className="text-xs text-text-muted italic">Gather / harvest</div>
                )}
                {methods.some((m) => m.kind === "fishing") && (
                  <div className="text-xs text-text-muted italic">Fishing</div>
                )}

                {/* Monster drops */}
                {byMonster.size > 0 && (
                  <div className="space-y-0.5">
                    <div className="text-xs text-text-muted font-medium">
                      Monster drops ({byMonster.size}):
                    </div>
                    {[...byMonster.entries()].slice(0, 10).map(([monster, zones]) => (
                      <div key={monster} className="flex items-baseline gap-1 text-xs ml-2">
                        <span className="text-text-primary">{monster}</span>
                        {zones.length > 0 && (
                          <span className="text-text-muted truncate">
                            — {zones.slice(0, 2).join(", ")}
                            {zones.length > 2 ? "…" : ""}
                          </span>
                        )}
                      </div>
                    ))}
                    {byMonster.size > 10 && (
                      <div className="text-xs text-text-muted italic ml-2">
                        +{byMonster.size - 10} more monsters
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
