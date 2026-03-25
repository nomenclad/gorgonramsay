/**
 * Recipe completion tracking component. Shows all food-skill recipes with their
 * Known/Can Learn/Too Low status, times used, acquisition sources, and costs.
 * Filterable by skill (via sidebar) and knowledge status. Supports context menu
 * for wiki links and crafting navigation.
 */
import { useState, useMemo, useCallback } from "react";
import { useCharacterStore } from "../../stores/characterStore";
import { useGameDataStore } from "../../stores/gameDataStore";
import {
  getRecipeSourceLabels,
  getRecipePurchaseInfo,
  type RecipeSourceLabel,
  type RecipePurchaseInfo,
} from "../../lib/sourceResolver";
import { ContextMenu, wikiUrl, openInBrowser } from "../common/ContextMenu";
import type { Recipe } from "../../types/recipe";
import { FOOD_SKILLS, formatSkillName } from "../../lib/foodSkills";
import { useNavStore } from "../../stores/navStore";
import { useColumnFilters } from "../../hooks/useColumnFilters";
import { ColumnFilterDropdown } from "../common/ColumnFilterDropdown";

type KnownFilter = "all" | "known" | "canlearn" | "unknown";

// ─── Source label display ──────────────────────────────────────────────────────

function SourceRow({ s }: { s: RecipeSourceLabel }) {
  switch (s.kind) {
    case "trainer":
      return (
        <div>
          <span className="text-text-primary">{s.label}</span>
          {s.detail && <span className="text-text-muted ml-1 text-xs">({s.detail})</span>}
        </div>
      );
    case "scroll":
      return (
        <div>
          <span className="text-text-muted text-xs">Recipe scroll — </span>
          <span className="text-text-primary">{s.label}</span>
        </div>
      );
    case "skill":
      return (
        <div>
          <span className="text-text-muted text-xs">Auto-learned · </span>
          <span className="text-text-primary">{s.label}</span>
        </div>
      );
    case "hangout":
      return (
        <div>
          <span className="text-text-muted text-xs">Hang out with </span>
          <span className="text-text-primary">{s.label}</span>
          {s.detail && <span className="text-text-muted ml-1 text-xs">({s.detail})</span>}
        </div>
      );
    case "gift":
      return (
        <div>
          <span className="text-text-muted text-xs">Gift to </span>
          <span className="text-text-primary">{s.label}</span>
          {s.detail && <span className="text-text-muted ml-1 text-xs">({s.detail})</span>}
        </div>
      );
    case "quest":
      return <div className="text-text-muted">Quest reward</div>;
    default:
      return <div className="text-text-muted">{s.label}</div>;
  }
}

// ─── Cost cell ────────────────────────────────────────────────────────────────

function CostCell({ purchaseInfo }: { purchaseInfo: RecipePurchaseInfo[] }) {
  if (purchaseInfo.length === 0) {
    return <span className="text-text-muted">—</span>;
  }

  return (
    <div className="space-y-1">
      {purchaseInfo.map((p, i) => {
        if (p.kind === "trainer") {
          return (
            <div key={i} className="text-xs">
              <div className="text-text-primary">{p.npcName}</div>
              {p.area && <div className="text-text-muted">{p.area}</div>}
              <div className="text-text-muted italic">Fee unknown</div>
            </div>
          );
        }
        // scroll
        return (
          <div key={i} className="text-xs">
            {p.cost != null ? (
              <span className="text-gold font-medium">{p.cost.toLocaleString()} c</span>
            ) : (
              <span className="text-text-muted">Price unknown</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Single recipe row ────────────────────────────────────────────────────────

function RecipeRow({
  recipe,
  completions,
  currentLevel,
  getItemByCode,
  onContextMenu,
}: {
  recipe: Recipe;
  completions: Record<string, number>;
  currentLevel: number;
  getItemByCode: (code: number) => { Name: string; Value: number } | undefined;
  onContextMenu: (e: React.MouseEvent, name: string) => void;
}) {
  const isKnown = recipe.InternalName in completions;
  const timesUsed = completions[recipe.InternalName] ?? 0;
  const canLearn = currentLevel >= recipe.SkillLevelReq;

  const sourceLabels = useMemo(
    () => getRecipeSourceLabels(recipe.id, getItemByCode),
    [recipe.id, getItemByCode]
  );

  const purchaseInfo = useMemo(
    () => (isKnown ? [] : getRecipePurchaseInfo(recipe.id, getItemByCode)),
    [recipe.id, isKnown, getItemByCode]
  );

  return (
    <tr
      className={`border-b border-border/50 hover:bg-bg-primary/50 transition-colors ${!canLearn && !isKnown ? "opacity-60" : ""}`}
      onContextMenu={(e) => onContextMenu(e, recipe.Name)}
    >
      {/* Recipe name */}
      <td className="py-2 px-3">
        <div className="font-medium text-text-primary">{recipe.Name}</div>
        {recipe.Description && (
          <div className="text-xs text-text-muted mt-0.5 max-w-xs truncate">{recipe.Description}</div>
        )}
      </td>

      {/* Level req */}
      <td className="py-2 px-3 text-right">
        <span className={`text-sm ${canLearn ? "text-text-primary" : "text-error"}`}>
          {recipe.SkillLevelReq}
        </span>
      </td>

      {/* Status */}
      <td className="py-2 px-3 text-center">
        {isKnown ? (
          <span className="text-xs bg-success/15 text-success px-2 py-0.5 rounded font-medium">Known</span>
        ) : canLearn ? (
          <span className="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded">Can Learn</span>
        ) : (
          <span className="text-xs bg-error/10 text-error px-2 py-0.5 rounded">
            Too Low (Lv {recipe.SkillLevelReq})
          </span>
        )}
      </td>

      {/* Times used */}
      <td className="py-2 px-3 text-right text-text-muted text-sm">
        {isKnown ? (timesUsed > 0 ? timesUsed.toLocaleString() : <span className="text-text-muted">0</span>) : <span className="text-text-muted">—</span>}
      </td>

      {/* How to get */}
      <td className="py-2 px-3">
        {isKnown ? (
          <span className="text-text-muted text-xs">Already known</span>
        ) : sourceLabels.length > 0 ? (
          <div className="space-y-0.5 text-xs">
            {sourceLabels.map((s, i) => (
              <SourceRow key={i} s={s} />
            ))}
          </div>
        ) : (
          <span className="text-text-muted text-xs">Source unknown</span>
        )}
      </td>

      {/* Cost */}
      <td className="py-2 px-3 text-right">
        {isKnown ? (
          <span className="text-text-muted text-xs">—</span>
        ) : (
          <CostCell purchaseInfo={purchaseInfo} />
        )}
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RecipeTracker() {
  const character = useCharacterStore((s) => s.character);
  const recipes = useGameDataStore((s) => s.recipes);
  const getRecipesForSkill = useGameDataStore((s) => s.getRecipesForSkill);
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const loaded = useGameDataStore((s) => s.loaded);
  const navigateToCraft = useNavStore((s) => s.navigateToCraft);
  const selectedSkill = useNavStore((s) => s.selectedSkill);

  const [search, setSearch] = useState("");
  const [knownFilter, setKnownFilter] = useState<KnownFilter>("all");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; name: string } | null>(null);
  const colFilters = useColumnFilters();

  const completions = character?.RecipeCompletions ?? {};
  const currentSkillLevel = selectedSkill
    ? selectedSkill === "Fishing"
      ? Math.max(character?.Skills["Fishing"]?.Level ?? 0, character?.Skills["Angling"]?.Level ?? 0)
      : (character?.Skills[selectedSkill]?.Level ?? 0)
    : 0;
  const currentSkillData = selectedSkill
    ? selectedSkill === "Fishing"
      ? (character?.Skills["Fishing"] ?? character?.Skills["Angling"] ?? null)
      : (character?.Skills[selectedSkill] ?? null)
    : null;

  const skillRecipes = useMemo(() => {
    if (!selectedSkill) {
      // "All" — return all food-skill recipes sorted by skill then level
      return recipes
        .filter((r) => FOOD_SKILLS.has(r.Skill))
        .sort((a, b) => a.Skill.localeCompare(b.Skill) || a.SkillLevelReq - b.SkillLevelReq);
    }
    if (selectedSkill === "Fishing") {
      // Merge Fishing + Angling recipes
      return [...(getRecipesForSkill("Fishing")), ...(getRecipesForSkill("Angling"))]
        .sort((a, b) => a.SkillLevelReq - b.SkillLevelReq);
    }
    return getRecipesForSkill(selectedSkill).sort((a, b) => a.SkillLevelReq - b.SkillLevelReq);
  }, [selectedSkill, getRecipesForSkill, recipes]);

  const knownCount = useMemo(
    () => skillRecipes.filter((r) => r.InternalName in completions).length,
    [skillRecipes, completions]
  );

  const getStatusLabel = useCallback((recipe: Recipe): string => {
    if (recipe.InternalName in completions) return "Known";
    const lvl = selectedSkill ? currentSkillLevel : (character?.Skills[recipe.Skill]?.Level ?? 0);
    return lvl >= recipe.SkillLevelReq ? "Can Learn" : "Too Low";
  }, [completions, selectedSkill, currentSkillLevel, character]);

  const statusOptions = useMemo(
    () => [...new Set(skillRecipes.map((r) => getStatusLabel(r)))].sort(),
    [skillRecipes, getStatusLabel]
  );

  const filtered = useMemo(() => {
    let results = skillRecipes;
    const term = search.trim().toLowerCase();
    if (term) results = results.filter((r) => r.Name.toLowerCase().includes(term));
    if (knownFilter === "known")
      results = results.filter((r) => r.InternalName in completions);
    if (knownFilter === "canlearn") {
      if (selectedSkill) {
        results = results.filter(
          (r) => !(r.InternalName in completions) && r.SkillLevelReq <= currentSkillLevel
        );
      } else {
        results = results.filter(
          (r) =>
            !(r.InternalName in completions) &&
            (character?.Skills[r.Skill]?.Level ?? 0) >= r.SkillLevelReq
        );
      }
    }
    if (knownFilter === "unknown")
      results = results.filter(
        (r) => !(r.InternalName in completions) && r.SkillLevelReq > currentSkillLevel
      );

    // Column dropdown filters
    if (colFilters.isFiltered("status")) {
      results = results.filter((r) => colFilters.passesFilter("status", getStatusLabel(r)));
    }

    return results;
  }, [skillRecipes, search, knownFilter, completions, currentSkillLevel, selectedSkill, character, colFilters, getStatusLabel]);

  // ── Main content ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 min-w-0">
        {!loaded || !character ? (
          <div className="text-center py-16">
            <h2 className="text-xl font-semibold text-text-secondary mb-2">Recipe Tracker</h2>
            <p className="text-text-muted">Load game data and character files in Settings to get started.</p>
          </div>
        ) : (
          <div className="space-y-4 w-full">
            {/* Skill header */}
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <h2 className="text-xl font-semibold">{selectedSkill ? formatSkillName(selectedSkill) : "All Skills"}</h2>
                <p className="text-sm text-text-muted mt-0.5">
                  {selectedSkill ? `Level ${currentSkillLevel} · ` : ""}{knownCount} / {skillRecipes.length} recipes known
                </p>
              </div>
              {selectedSkill && currentSkillData && (
                <div className="flex-1 min-w-48 max-w-64">
                  <div className="flex justify-between text-xs text-text-muted mb-1">
                    <span>{currentSkillData.XpTowardNextLevel.toLocaleString()} / {currentSkillData.XpNeededForNextLevel.toLocaleString()} XP</span>
                    <span>{Math.round((currentSkillData.XpTowardNextLevel / currentSkillData.XpNeededForNextLevel) * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-bg-primary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (currentSkillData.XpTowardNextLevel / currentSkillData.XpNeededForNextLevel) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <input
                type="search"
                placeholder="Search recipes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-bg-secondary border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder-text-muted w-52 focus:outline-none focus:border-accent"
              />
              <div className="flex gap-1 bg-bg-secondary rounded-lg p-1">
                {(["all", "known", "canlearn", "unknown"] as KnownFilter[]).map((f) => {
                  const canLearnCount = selectedSkill
                    ? skillRecipes.filter(
                        (r) => !(r.InternalName in completions) && r.SkillLevelReq <= currentSkillLevel
                      ).length
                    : skillRecipes.filter(
                        (r) =>
                          !(r.InternalName in completions) &&
                          (character?.Skills[r.Skill]?.Level ?? 0) >= r.SkillLevelReq
                      ).length;
                  const tooLowCount = skillRecipes.length - knownCount - canLearnCount;
                  const label =
                    f === "all" ? `All (${skillRecipes.length})`
                    : f === "known" ? `Known (${knownCount})`
                    : f === "canlearn" ? `Can Learn (${canLearnCount})`
                    : `Too Low (${tooLowCount})`;
                  return (
                    <button
                      key={f}
                      onClick={() => setKnownFilter(f)}
                      className={`px-3 py-1 rounded text-sm transition-colors ${
                        knownFilter === f ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Table */}
            <div className="bg-bg-secondary rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left bg-bg-primary/30">
                    <th className="py-2 px-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Recipe</th>
                    <th className="py-2 px-3 text-xs font-semibold text-text-secondary uppercase tracking-wide text-right w-24">Level Req</th>
                    <th className="py-2 px-3 text-xs font-semibold text-text-secondary uppercase tracking-wide text-center w-28">
                      <span className="inline-flex items-center gap-0.5">
                        Status
                        <ColumnFilterDropdown
                          options={statusOptions}
                          selected={colFilters.filters["status"] ?? new Set()}
                          onChange={(s) => colFilters.setFilter("status", s)}
                          label="Status"
                        />
                      </span>
                    </th>
                    <th className="py-2 px-3 text-xs font-semibold text-text-secondary uppercase tracking-wide text-right w-24">Times Used</th>
                    <th className="py-2 px-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">How to Get</th>
                    <th className="py-2 px-3 text-xs font-semibold text-text-secondary uppercase tracking-wide text-right w-32">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((recipe) => (
                    <RecipeRow
                      key={recipe.id}
                      recipe={recipe}
                      completions={completions}
                      currentLevel={selectedSkill ? currentSkillLevel : (character?.Skills[recipe.Skill]?.Level ?? 0)}
                      getItemByCode={getItemByCode}
                      onContextMenu={(e, name) => {
                        e.preventDefault();
                        setCtxMenu({ x: e.clientX, y: e.clientY, name });
                      }}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-text-muted">
                        No recipes match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            { label: "🍳 View Crafting Recipe", onClick: () => navigateToCraft(ctxMenu.name) },
            { label: "🔗 View on Wiki", onClick: () => openInBrowser(wikiUrl(ctxMenu.name)) },
          ]}
        />
      )}
    </>
  );
}
