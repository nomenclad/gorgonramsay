/**
 * Modal popup showing detailed info for a selected ingredient: inventory breakdown,
 * acquisition sources (vendors, fishing, gardening, crafting, monster drops),
 * and all food recipes that use this ingredient. Rendered as a portal overlay.
 */
import { createPortal } from "react-dom";
import { useEffect } from "react";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useNavStore } from "../../stores/navStore";
import { FOOD_SKILLS, formatSkillName } from "../../lib/foodSkills";
import { getAcquisitionMethods } from "../../lib/sourceResolver";
import { openInBrowser, wikiUrl } from "../common/ContextMenu";
import type { AggregatedItem } from "../../types";
import type { DropEntry } from "../../hooks/useMonsterDrops";
import { TagEditor } from "../common/TagEditor";

interface Props {
  item: AggregatedItem;
  wikiDrops: DropEntry[] | null;
  onClose: () => void;
}

export function IngredientDetailModal({ item, wikiDrops, onClose }: Props) {
  const recipeIndexes = useGameDataStore((s) => s.recipeIndexes);
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const fmtVault = useGameDataStore((s) => s.formatVaultName);
  const navigateToCraft = useNavStore((s) => s.navigateToCraft);
  const filterRecipesByIngredient = useNavStore((s) => s.filterRecipesByIngredient);
  const navigateToRecipeSearch = useNavStore((s) => s.navigateToRecipeSearch);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Acquisition type
  const isCrafted = recipeIndexes?.byResultItem.get(item.typeId)?.some((r) => FOOD_SKILLS.has(r.Skill)) ?? false;

  // All food recipes using this item as ingredient
  const usedInRecipes = recipeIndexes?.byIngredient.get(item.typeId)?.filter((r) => FOOD_SKILLS.has(r.Skill)) ?? [];

  // CDN sources — vendor, gather, fishing, craft only (no quests or misc)
  const cdnSources = getAcquisitionMethods(item.typeId, 0).filter(
    (m) => m.kind === "vendor" || m.kind === "fishing" || m.kind === "gather" || m.kind === "craft"
  );
  // Fishing/Angling recipe → "Fished/Angled: [recipe name]"
  const fishingRecipe = recipeIndexes?.byResultItem.get(item.typeId)?.find(
    (r) => r.Skill === "Fishing" || r.Skill === "Angling"
  ) ?? null;
  // Gardening recipe → "Gardened from [seedling]"
  const gardenRecipe = !fishingRecipe
    ? (recipeIndexes?.byResultItem.get(item.typeId)?.find(
        (r) => r.Skill === "Gardening"
      ) ?? null)
    : null;
  const gardenSeedlings = gardenRecipe
    ? gardenRecipe.Ingredients.map((ing) => getItemByCode(ing.ItemCode)?.Name ?? `Item #${ing.ItemCode}`)
    : [];
  // Other food-skill crafting recipe (non-Gardening, non-Fishing/Angling)
  const craftRecipe = !gardenRecipe && !fishingRecipe
    ? (recipeIndexes?.byResultItem.get(item.typeId)?.find(
        (r) => FOOD_SKILLS.has(r.Skill) && r.Skill !== "Gardening" && r.Skill !== "Fishing" && r.Skill !== "Angling"
      ) ?? null)
    : null;

  // Deduplicated monster→zones map from wiki data
  const monsterMap = new Map<string, string[]>();
  if (wikiDrops) {
    for (const d of wikiDrops) {
      if (!monsterMap.has(d.monster)) monsterMap.set(d.monster, []);
      if (d.location && !monsterMap.get(d.monster)!.includes(d.location)) {
        monsterMap.get(d.monster)!.push(d.location);
      }
    }
  }

  const totalValue = item.value * item.totalQuantity;
  const hasAnySource = cdnSources.length > 0 || monsterMap.size > 0 || !!craftRecipe || !!gardenRecipe || !!fishingRecipe;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-bg-primary border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-xl font-bold text-text-primary">{item.name}</h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {fishingRecipe ? (
                <span className="text-xs bg-blue-400/10 text-blue-400 px-2 py-0.5 rounded-full font-medium">
                  {fishingRecipe.Skill === "Angling" ? "Angled" : "Fished"}
                </span>
              ) : gardenRecipe ? (
                <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full font-medium">Gardened</span>
              ) : isCrafted ? (
                <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">Crafted</span>
              ) : (
                <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full font-medium">Foraged / Raw</span>
              )}
              <span className="text-xs text-text-muted">{item.value.toLocaleString()}c each</span>
              {item.totalQuantity > 0 && (
                <span className="text-xs bg-bg-secondary px-2 py-0.5 rounded-full text-text-secondary">
                  {item.totalQuantity} in stock · {totalValue.toLocaleString()}c total
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={() => openInBrowser(wikiUrl(item.name))}
              className="text-xs text-accent hover:text-accent/80 border border-border hover:border-accent/40 px-2.5 py-1.5 rounded transition-colors"
            >
              🔗 Wiki
            </button>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary text-lg leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-bg-secondary transition-colors"
            >
              ×
            </button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Custom tags */}
          <section>
            <SectionTitle>Tags</SectionTitle>
            <div className="mt-2">
              <TagEditor resource={{ kind: "item", typeId: item.typeId }} size="sm" emptyLabel="No tags yet — apply or create one." />
            </div>
          </section>

          {/* Inventory breakdown */}
          {item.locations.length > 0 && (
            <section>
              <SectionTitle>In Your Inventory</SectionTitle>
              <div className="mt-2 space-y-1">
                {item.locations.map((loc, i) => (
                  <div key={i} className="flex justify-between items-center py-1 border-b border-border/30 last:border-0">
                    <span className="text-text-secondary text-sm">{fmtVault(loc.vault)}</span>
                    <span className="text-success font-medium text-sm">×{loc.quantity}</span>
                  </div>
                ))}
                {item.locations.length > 1 && (
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-text-muted text-xs font-semibold">Total</span>
                    <span className="text-success text-xs font-bold">×{item.totalQuantity}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Where Found */}
          {hasAnySource && (
            <section>
              <SectionTitle>Where to Find</SectionTitle>
              <div className="mt-2 space-y-3">

                {/* Vendors */}
                {cdnSources.filter((m) => m.kind === "vendor").length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-text-muted mb-1 uppercase tracking-wide">Sold By</div>
                    <div className="space-y-1">
                      {cdnSources.filter((m) => m.kind === "vendor").map((m, i) => (
                        <div key={i} className="flex items-baseline gap-1.5 text-sm">
                          <span className="text-accent">
                            {(m as Extract<typeof m, { kind: "vendor" }>).npcName ?? "Vendor"}
                          </span>
                          {(m as Extract<typeof m, { kind: "vendor" }>).area && (
                            <span className="text-text-muted text-xs">
                              — {(m as Extract<typeof m, { kind: "vendor" }>).area}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fishing / Angling */}
                {fishingRecipe && (
                  <div>
                    <div className="text-xs font-semibold text-text-muted mb-1 uppercase tracking-wide">
                      {fishingRecipe.Skill === "Angling" ? "Angled" : "Fished"}
                    </div>
                    <div className="text-sm text-blue-400">{fishingRecipe.Name}</div>
                  </div>
                )}

                {/* Gather */}
                {cdnSources.some((m) => m.kind === "gather") && (
                  <div>
                    <div className="text-xs font-semibold text-text-muted mb-1 uppercase tracking-wide">Gathered</div>
                    <div className="text-sm text-text-secondary">Gather / harvest</div>
                  </div>
                )}

                {/* Gardened from seedling */}
                {gardenRecipe && (
                  <div>
                    <div className="text-xs font-semibold text-text-muted mb-1 uppercase tracking-wide">Gardened From</div>
                    <div className="text-sm space-y-0.5">
                      {gardenSeedlings.map((name) => (
                        <div key={name}>
                          <button
                            className="text-success hover:underline text-left"
                            onClick={() => { navigateToRecipeSearch(gardenRecipe.Name); onClose(); }}
                          >
                            {name}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Crafted by recipe (non-Gardening, non-Fishing) */}
                {!gardenRecipe && !fishingRecipe && cdnSources.some((m) => m.kind === "craft") && (
                  <div>
                    <div className="text-xs font-semibold text-text-muted mb-1 uppercase tracking-wide">Crafted By</div>
                    <div className="text-sm">
                      {craftRecipe ? (
                        <button
                          className="text-accent hover:underline text-left"
                          onClick={() => { navigateToRecipeSearch(craftRecipe.Name); onClose(); }}
                        >
                          {craftRecipe.Name}
                        </button>
                      ) : (
                        <span className="text-text-secondary">Craftable recipe</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Monster drops */}
                {monsterMap.size > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-text-muted mb-1 uppercase tracking-wide">
                      Monster Drops ({monsterMap.size} monsters)
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {[...monsterMap.entries()].map(([monster, zones]) => (
                        <div key={monster} className="flex items-baseline gap-1.5 text-sm">
                          <span className="text-text-primary shrink-0">{monster}</span>
                          {zones.length > 0 && (
                            <span className="text-text-muted text-xs truncate">
                              — {zones.join(", ")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Recipes using this ingredient */}
          {usedInRecipes.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <SectionTitle>Used In {usedInRecipes.length} Recipe{usedInRecipes.length !== 1 ? "s" : ""}</SectionTitle>
                <button
                  onClick={() => { filterRecipesByIngredient(item.typeId, item.name); onClose(); }}
                  className="text-xs text-accent hover:underline"
                >
                  View all in Recipes tab →
                </button>
              </div>
              <div className="space-y-1">
                {usedInRecipes.map((recipe) => {
                  const ingEntry = recipe.Ingredients.find((i) => i.ItemCode === item.typeId);
                  const resultItem = getItemByCode(recipe.ResultItems?.[0]?.ItemCode ?? 0);
                  return (
                    <div
                      key={recipe.id}
                      className="flex items-center justify-between gap-2 py-1.5 border-b border-border/30 last:border-0"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">
                          {recipe.Name}
                          {resultItem && resultItem.Name !== recipe.Name && (
                            <span className="text-text-muted font-normal"> → {resultItem.Name}</span>
                          )}
                        </div>
                        <div className="text-xs text-text-muted flex items-center gap-2">
                          <span>{formatSkillName(recipe.Skill)}</span>
                          <span>·</span>
                          <span>Lv {recipe.SkillLevelReq}</span>
                          {ingEntry && (
                            <>
                              <span>·</span>
                              <span>Needs ×{ingEntry.StackSize}</span>
                            </>
                          )}
                          <span>·</span>
                          <span>{recipe.RewardSkillXp.toLocaleString()} XP</span>
                        </div>
                      </div>
                      <button
                        onClick={() => { navigateToCraft(recipe.Name); onClose(); }}
                        className="text-xs text-text-muted hover:text-accent border border-border hover:border-accent/40 px-2 py-1 rounded shrink-0 transition-colors"
                      >
                        🍳 Craft
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {!hasAnySource && item.locations.length === 0 && usedInRecipes.length === 0 && (
            <p className="text-text-muted text-sm text-center py-4">No additional data available.</p>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted border-b border-border/40 pb-1">
      {children}
    </h3>
  );
}
