import { useState, useMemo } from "react";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useCharacterStore } from "../../stores/characterStore";
import { recipeGoldEfficiency } from "../../lib/optimizer";

type SortKey = "goldPerXp" | "effectiveXp" | "profit" | "ingredientCost";
type SortDir = "asc" | "desc";

export function GoldEfficiency() {
  const recipes = useGameDataStore((s) => s.recipes);
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const getSkillNames = useGameDataStore((s) => s.getSkillNames);
  const loaded = useGameDataStore((s) => s.loaded);
  const getItemQuantity = useInventoryStore((s) => s.getItemQuantity);
  const character = useCharacterStore((s) => s.character);

  const skillNames = useMemo(() => getSkillNames(), [getSkillNames, loaded]);

  const [selectedSkill, setSelectedSkill] = useState<string>("Cooking");
  const [sortKey, setSortKey] = useState<SortKey>("goldPerXp");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [maxResults, setMaxResults] = useState(50);

  const currentLevel = character?.Skills[selectedSkill] ?? 1;

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

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "goldPerXp" || key === "ingredientCost" ? "asc" : "desc");
    }
  }

  function SortHeader({
    label,
    colKey,
  }: {
    label: string;
    colKey: SortKey;
  }) {
    const active = sortKey === colKey;
    return (
      <th
        className="py-2 px-3 text-right cursor-pointer hover:text-text-primary select-none"
        onClick={() => toggleSort(colKey)}
      >
        {label} {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </th>
    );
  }

  if (!loaded) {
    return (
      <div className="text-center py-12 text-text-muted">
        Load game data in Settings to use Gold Efficiency.
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div>
        <h2 className="text-xl font-semibold">Gold Efficiency</h2>
        <p className="text-sm text-text-muted mt-1">
          Compare recipes by gold cost per XP. Lower is better for leveling on a budget.
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
                {s} {character?.Skills[s] ? `(Lv ${character.Skills[s]})` : ""}
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
            <div className="text-xs text-text-muted mb-1">Best Gold/XP</div>
            <div className="font-bold text-success">
              {isFinite(sorted[0].goldPerXp)
                ? `${sorted[0].goldPerXp.toFixed(2)}g/xp`
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
                    {best.profit >= 0 ? "+" : ""}{best.profit.toLocaleString()}g
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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary text-xs">
              <th className="py-2 px-3">Recipe</th>
              <th className="py-2 px-3 text-right">Req Lv</th>
              <SortHeader label="XP/craft" colKey="effectiveXp" />
              <SortHeader label="Ing. Cost" colKey="ingredientCost" />
              <SortHeader label="Result Value" colKey="profit" />
              <SortHeader label="Gold/XP" colKey="goldPerXp" />
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
                  className={`border-b border-border/50 hover:bg-bg-secondary/50 ${
                    isFree || isEfficient ? "bg-success/5" : ""
                  }`}
                >
                  <td className="py-2 px-3">
                    <div className="font-medium">{row.recipe.Name}</div>
                    <div className="text-xs text-text-muted">
                      {row.recipe.InternalName}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right text-text-muted">
                    {row.recipe.SkillLevelReq}
                  </td>
                  <td className="py-2 px-3 text-right font-medium text-success">
                    {row.effectiveXp.toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {row.ingredientCost > 0 ? (
                      <span className="text-gold">{row.ingredientCost.toLocaleString()}g</span>
                    ) : (
                      <span className="text-success text-xs">Free</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span className={isProfitable ? "text-success" : "text-text-muted"}>
                      {isProfitable ? "+" : ""}
                      {row.profit.toLocaleString()}g
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
    </div>
  );
}
