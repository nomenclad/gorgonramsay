import { useState, useMemo, useCallback } from "react";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useCharacterStore } from "../../stores/characterStore";
import { recipeGoldEfficiency } from "../../lib/optimizer";
import { ContextMenu, wikiUrl, openInBrowser } from "../common/ContextMenu";
import { FOOD_SKILLS } from "../../lib/foodSkills";
import { useResizableColumns } from "../../hooks/useResizableColumns";
import { ResizableTh, SortableResizableTh } from "../common/ResizableTh";

type SortKey = "goldPerXp" | "effectiveXp" | "profit" | "ingredientCost";
type SortDir = "asc" | "desc";


export function GoldEfficiency() {
  const recipes = useGameDataStore((s) => s.recipes);
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const getSkillNames = useGameDataStore((s) => s.getSkillNames);
  const loaded = useGameDataStore((s) => s.loaded);
  const getItemQuantity = useInventoryStore((s) => s.getItemQuantity);
  const character = useCharacterStore((s) => s.character);

  const skillNames = useMemo(
    () => getSkillNames().filter((s) => FOOD_SKILLS.has(s)),
    [getSkillNames, loaded]
  );

  const [selectedSkill, setSelectedSkill] = useState<string>("Cooking");
  const [sortKey, setSortKey] = useState<SortKey>("goldPerXp");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [maxResults, setMaxResults] = useState(50);
  const { widths: colW, startResize } = useResizableColumns("gold", [220, 70, 90, 90, 100, 100]);

  const currentLevel = character?.Skills[selectedSkill]?.Level ?? 1;

  const rows = useMemo(() => {
    if (!loaded) return [];
    const skillRecipes = recipes.filter(
      (r) => r.Skill === selectedSkill && r.SkillLevelReq <= currentLevel + 10
    );
    return skillRecipes.map((r) => {
      const stats = recipeGoldEfficiency(
        r,
        currentLevel,
        getItemByCode,
        getItemQuantity
      );
      return { recipe: r, ...stats };
    });
  }, [recipes, selectedSkill, currentLevel, loaded, getItemByCode, getItemQuantity]);

  const sorted = useMemo(() => {
    const copy = [...rows].filter((r) => r.effectiveXp > 0);
    copy.sort((a, b) => {
      let diff = 0;
      if (sortKey === "goldPerXp") {
        // Treat Infinity as very large
        const av = isFinite(a.goldPerXp) ? a.goldPerXp : 1e9;
        const bv = isFinite(b.goldPerXp) ? b.goldPerXp : 1e9;
        diff = av - bv;
      } else {
        diff = a[sortKey] - b[sortKey];
      }
      return sortDir === "asc" ? diff : -diff;
    });
    return copy.slice(0, maxResults);
  }, [rows, sortKey, sortDir, maxResults]);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; name: string } | null>(null);
  const handleContextMenu = useCallback((e: React.MouseEvent, name: string) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, name });
  }, []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "goldPerXp" || key === "ingredientCost" ? "asc" : "desc");
    }
  }

  if (!loaded) {
    return (
      <div className="text-center py-12 text-text-muted">
        Load game data in Settings to use Council Efficiency.
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full">
      <div>
        <h2 className="text-xl font-semibold">Council Efficiency</h2>
        <p className="text-sm text-text-muted mt-1">
          Compare recipes by council cost per XP. Lower is better for leveling on a budget.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-text-muted block mb-1">Skill</label>
          <select
            value={selectedSkill}
            onChange={(e) => setSelectedSkill(e.target.value)}
            className="bg-bg-secondary border border-border rounded px-3 py-1.5 text-sm"
          >
            {skillNames.map((s) => (
              <option key={s} value={s}>
                {s} {character?.Skills[s] ? `(Lv ${character.Skills[s].Level})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="text-xs text-text-muted self-center">
          {character
            ? `Showing recipes up to Lv ${currentLevel + 10} at your current level ${currentLevel}`
            : "Load character to see level-appropriate recipes"}
        </div>
      </div>

      {/* Summary stats */}
      {sorted.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-bg-secondary rounded-lg p-3">
            <div className="text-xs text-text-muted mb-1">Best Councils/XP</div>
            <div className="font-bold text-success">
              {isFinite(sorted[0].goldPerXp)
                ? `${sorted[0].goldPerXp.toFixed(2)}c/xp`
                : "Free!"}
            </div>
            <div className="text-xs text-text-muted truncate">{sorted[0].recipe.Name}</div>
          </div>
          <div className="bg-bg-secondary rounded-lg p-3">
            <div className="text-xs text-text-muted mb-1">Best XP/craft</div>
            <div className="font-bold text-accent">
              {Math.max(...sorted.map((r) => r.effectiveXp)).toLocaleString()}
            </div>
          </div>
          <div className="bg-bg-secondary rounded-lg p-3">
            <div className="text-xs text-text-muted mb-1">Most Profitable</div>
            {(() => {
              const best = [...sorted].sort((a, b) => b.profit - a.profit)[0];
              return (
                <>
                  <div className={`font-bold ${best.profit >= 0 ? "text-success" : "text-danger"}`}>
                    {best.profit >= 0 ? "+" : ""}{best.profit.toLocaleString()}c
                  </div>
                  <div className="text-xs text-text-muted truncate">{best.recipe.Name}</div>
                </>
              );
            })()}
          </div>
          <div className="bg-bg-secondary rounded-lg p-3">
            <div className="text-xs text-text-muted mb-1">Recipes shown</div>
            <div className="font-bold">{sorted.length}</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="text-sm" style={{ tableLayout: "fixed", width: colW.reduce((a, b) => a + b, 0) }}>
          <thead>
            <tr className="border-b border-border text-left text-text-secondary text-xs">
              <ResizableTh width={colW[0]} onStartResize={(x) => startResize(0, x)}>Recipe</ResizableTh>
              <ResizableTh width={colW[1]} onStartResize={(x) => startResize(1, x)} right>Req Lv</ResizableTh>
              <SortableResizableTh label="XP/craft" col="effectiveXp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right width={colW[2]} onStartResize={(x) => startResize(2, x)} />
              <SortableResizableTh label="Ing. Cost" col="ingredientCost" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right width={colW[3]} onStartResize={(x) => startResize(3, x)} />
              <SortableResizableTh label="Result Value" col="profit" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right width={colW[4]} onStartResize={(x) => startResize(4, x)} />
              <SortableResizableTh label="Councils/XP" col="goldPerXp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right width={colW[5]} onStartResize={(x) => startResize(5, x)} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isEfficient = isFinite(row.goldPerXp) && row.goldPerXp < 0.5;
              const isFree = row.ingredientCost === 0;
              const isProfitable = row.profit > 0;
              return (
                <tr
                  key={row.recipe.id}
                  onContextMenu={(e) => handleContextMenu(e, row.recipe.Name)}
                  className={`border-b border-border/50 hover:bg-bg-secondary/50 cursor-context-menu ${
                    isFree || isEfficient ? "bg-success/5" : ""
                  }`}
                >
                  <td className="py-2 px-3">
                    <div className="font-medium">{row.recipe.Name}</div>
                  </td>
                  <td className="py-2 px-3 text-right text-text-muted">
                    {row.recipe.SkillLevelReq}
                  </td>
                  <td className="py-2 px-3 text-right font-medium text-success">
                    {row.effectiveXp.toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {row.ingredientCost > 0 ? (
                      <span className="text-gold">{row.ingredientCost.toLocaleString()}c</span>
                    ) : (
                      <span className="text-success text-xs">Free</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span className={isProfitable ? "text-success" : "text-text-muted"}>
                      {isProfitable ? "+" : ""}
                      {row.profit.toLocaleString()}c
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    {isFinite(row.goldPerXp) ? (
                      <span
                        className={
                          row.goldPerXp < 0.1
                            ? "text-success font-medium"
                            : row.goldPerXp < 1
                            ? "text-accent"
                            : "text-text-muted"
                        }
                      >
                        {row.goldPerXp.toFixed(3)}
                      </span>
                    ) : (
                      <span className="text-text-muted text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div className="text-center py-8 text-text-muted text-sm">
            No recipes found for {selectedSkill}.
          </div>
        )}

        {rows.filter((r) => r.effectiveXp > 0).length > maxResults && (
          <div className="text-center mt-4">
            <button
              onClick={() => setMaxResults((n) => n + 50)}
              className="text-sm text-accent hover:text-accent-hover"
            >
              Show more ({rows.filter((r) => r.effectiveXp > 0).length - maxResults} remaining)
            </button>
          </div>
        )}
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            {
              label: "🔗 View on Wiki",
              onClick: () => openInBrowser(wikiUrl(ctxMenu.name)),
            },
          ]}
        />
      )}
    </div>
  );
}
