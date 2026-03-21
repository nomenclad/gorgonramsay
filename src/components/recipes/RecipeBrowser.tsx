import { useState, useMemo } from "react";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useCharacterStore } from "../../stores/characterStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { computeEffectiveXp } from "../../lib/xpCalculator";

export function RecipeBrowser() {
  const recipes = useGameDataStore((s) => s.recipes);
  const loaded = useGameDataStore((s) => s.loaded);
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const character = useCharacterStore((s) => s.character);
  const getItemQuantity = useInventoryStore((s) => s.getItemQuantity);

  const [search, setSearch] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [showCraftableOnly, setShowCraftableOnly] = useState(false);
  const [showFirstTimeOnly, setShowFirstTimeOnly] = useState(false);
  const [minLevel, setMinLevel] = useState(0);
  const [maxLevel, setMaxLevel] = useState(125);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 100;

  const skills = useMemo(() => {
    const s = new Set(recipes.map((r) => r.Skill));
    return Array.from(s).sort();
  }, [recipes]);

  const filtered = useMemo(() => {
    let results = recipes;

    if (search) {
      const term = search.toLowerCase();
      results = results.filter(
        (r) =>
          r.Name.toLowerCase().includes(term) ||
          r.InternalName.toLowerCase().includes(term)
      );
    }

    if (skillFilter) {
      results = results.filter((r) => r.Skill === skillFilter);
    }

    if (showFirstTimeOnly && character) {
      results = results.filter(
        (r) => character.RecipeCompletions[r.InternalName] === 0
      );
    }

    if (showCraftableOnly) {
      results = results.filter((r) =>
        r.Ingredients.every(
          (ing) => getItemQuantity(ing.ItemCode) >= ing.StackSize
        )
      );
    }

    results = results.filter(
      (r) => r.SkillLevelReq >= minLevel && r.SkillLevelReq <= maxLevel
    );

    return results.sort((a, b) => a.SkillLevelReq - b.SkillLevelReq || a.Name.localeCompare(b.Name));
  }, [
    recipes,
    search,
    skillFilter,
    showFirstTimeOnly,
    showCraftableOnly,
    minLevel,
    maxLevel,
    character,
    getItemQuantity,
  ]);

  if (!loaded) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-text-secondary mb-2">
          Recipe Browser
        </h2>
        <p className="text-text-muted">
          Load game data in Settings to browse recipes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <input
          type="text"
          placeholder="Search recipes..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary flex-1 min-w-48"
        />
        <select
          value={skillFilter}
          onChange={(e) => { setSkillFilter(e.target.value); setPage(0); }}
          className="bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary"
        >
          <option value="">All skills</option>
          {skills.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 text-sm text-text-secondary">
          <span className="text-xs text-text-muted">Lv</span>
          <input
            type="number"
            value={minLevel}
            onChange={(e) => { setMinLevel(Number(e.target.value)); setPage(0); }}
            min={0}
            max={125}
            className="bg-bg-secondary border border-border rounded px-2 py-1.5 text-sm text-text-primary w-16"
          />
          <span className="text-xs text-text-muted">–</span>
          <input
            type="number"
            value={maxLevel}
            onChange={(e) => { setMaxLevel(Number(e.target.value)); setPage(0); }}
            min={0}
            max={125}
            className="bg-bg-secondary border border-border rounded px-2 py-1.5 text-sm text-text-primary w-16"
          />
        </div>
        {character && (
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={showFirstTimeOnly}
              onChange={(e) => { setShowFirstTimeOnly(e.target.checked); setPage(0); }}
              className="rounded"
            />
            First-time only
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={showCraftableOnly}
            onChange={(e) => { setShowCraftableOnly(e.target.checked); setPage(0); }}
            className="rounded"
          />
          Craftable now
        </label>
      </div>

      <div className="text-xs text-text-muted">
        {filtered.length} recipes
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary text-xs">
              <th className="py-2 px-3">Recipe</th>
              <th className="py-2 px-3">Skill</th>
              <th className="py-2 px-3 text-right">Req Lv</th>
              <th className="py-2 px-3 text-right">Base XP</th>
              {character && <th className="py-2 px-3 text-right">1st-Time XP</th>}
              {character && <th className="py-2 px-3 text-right">Eff. XP</th>}
              <th className="py-2 px-3 text-right">Dropoff Lv</th>
              <th className="py-2 px-3">Ingredients</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((recipe) => {
              const skillState = character?.Skills[recipe.Skill];
              const effXp = skillState
                ? computeEffectiveXp(recipe, skillState.Level)
                : null;
              const isFirstTime =
                character?.RecipeCompletions[recipe.InternalName] === 0;

              return (
                <tr
                  key={recipe.id}
                  className={`border-b border-border/50 hover:bg-bg-secondary/50 ${
                    isFirstTime ? "bg-gold/5" : ""
                  }`}
                >
                  <td className="py-2 px-3 font-medium">
                    {recipe.Name}
                    {isFirstTime && (
                      <span className="ml-1.5 text-xs bg-gold/20 text-gold px-1 py-0.5 rounded">NEW</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-text-secondary text-xs">
                    {recipe.Skill}
                  </td>
                  <td className="py-2 px-3 text-right">{recipe.SkillLevelReq}</td>
                  <td className="py-2 px-3 text-right">{recipe.RewardSkillXp.toLocaleString()}</td>
                  {character && (
                    <td className="py-2 px-3 text-right">
                      {recipe.RewardSkillXpFirstTime ? (
                        <span className={isFirstTime ? "text-gold font-medium" : "text-text-muted"}>
                          {recipe.RewardSkillXpFirstTime.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  )}
                  {character && (
                    <td className="py-2 px-3 text-right">
                      {effXp !== null && (
                        <span
                          className={
                            effXp === 0
                              ? "text-danger"
                              : effXp < recipe.RewardSkillXp
                              ? "text-gold"
                              : "text-success"
                          }
                        >
                          {effXp.toLocaleString()}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="py-2 px-3 text-right text-text-muted text-xs">
                    {recipe.RewardSkillXpDropOffLevel ?? "—"}
                  </td>
                  <td className="py-2 px-3 text-xs text-text-secondary">
                    {recipe.Ingredients.map((ing, i) => {
                      const item = getItemByCode(ing.ItemCode);
                      const have = getItemQuantity(ing.ItemCode);
                      return (
                        <span key={ing.ItemCode}>
                          {i > 0 && ", "}
                          <span
                            className={
                              have >= ing.StackSize
                                ? "text-success"
                                : "text-text-muted"
                            }
                          >
                            {item?.Name ?? `#${ing.ItemCode}`} x{ing.StackSize}
                          </span>
                        </span>
                      );
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1 rounded bg-bg-secondary disabled:opacity-40 hover:bg-bg-secondary/80"
          >
            ←
          </button>
          <span className="text-text-muted text-xs">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(Math.ceil(filtered.length / PAGE_SIZE) - 1, p + 1))}
            disabled={(page + 1) * PAGE_SIZE >= filtered.length}
            className="px-3 py-1 rounded bg-bg-secondary disabled:opacity-40 hover:bg-bg-secondary/80"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
