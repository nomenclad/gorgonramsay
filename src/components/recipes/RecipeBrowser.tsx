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

    return results;
  }, [
    recipes,
    search,
    skillFilter,
    showFirstTimeOnly,
    showCraftableOnly,
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
      <div className="flex flex-wrap gap-4 items-end">
        <input
          type="text"
          placeholder="Search recipes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary flex-1 min-w-48"
        />
        <select
          value={skillFilter}
          onChange={(e) => setSkillFilter(e.target.value)}
          className="bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary"
        >
          <option value="">All skills</option>
          {skills.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {character && (
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={showFirstTimeOnly}
              onChange={(e) => setShowFirstTimeOnly(e.target.checked)}
              className="rounded"
            />
            First-time only
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={showCraftableOnly}
            onChange={(e) => setShowCraftableOnly(e.target.checked)}
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
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="py-2 px-3">Recipe</th>
              <th className="py-2 px-3">Skill</th>
              <th className="py-2 px-3">Req Lv</th>
              <th className="py-2 px-3">XP</th>
              {character && <th className="py-2 px-3">Eff. XP</th>}
              <th className="py-2 px-3">Dropoff</th>
              <th className="py-2 px-3">Ingredients</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((recipe) => {
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
                      <span className="ml-1 text-gold text-xs">NEW</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-text-secondary">
                    {recipe.Skill}
                  </td>
                  <td className="py-2 px-3">{recipe.SkillLevelReq}</td>
                  <td className="py-2 px-3">{recipe.RewardSkillXp}</td>
                  {character && (
                    <td className="py-2 px-3">
                      {effXp !== null && (
                        <span
                          className={
                            effXp < recipe.RewardSkillXp
                              ? "text-warning"
                              : "text-success"
                          }
                        >
                          {effXp}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="py-2 px-3 text-text-muted">
                    {recipe.RewardSkillXpDropOffLevel ?? "-"}
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

      {filtered.length > 200 && (
        <p className="text-xs text-text-muted text-center">
          Showing first 200 of {filtered.length} results. Use filters to narrow.
        </p>
      )}
    </div>
  );
}
