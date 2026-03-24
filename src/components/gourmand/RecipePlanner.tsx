import { useMemo } from "react";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useCharacterStore } from "../../stores/characterStore";
import { getRecipeSourceLabels, getRecipePurchaseInfo, getAcquisitionMethods } from "../../lib/sourceResolver";
import type { FoodItem } from "../../lib/parsers/gourmandParser";
import { formatSkillName } from "../../lib/foodSkills";
import type { Recipe } from "../../types/recipe";

interface Props {
  foods: FoodItem[];
  completions: Record<string, number>;
  recipeByName: Map<string, Recipe>;
  onClose: () => void;
}

// Favor tier ordering — higher index = better standing
const FAVOR_ORDER = ["Neutral", "Comfortable", "Friends", "CloseFriends", "BestFriends", "Like"];

function favorIndex(level: string | undefined): number {
  if (!level) return -1;
  return FAVOR_ORDER.findIndex((f) => f.toLowerCase() === level.toLowerCase());
}

function favorLabel(level: string | undefined): string {
  if (!level) return "Unknown";
  // Insert spaces before capitals: "CloseFriends" → "Close Friends"
  return level.replace(/([A-Z])/g, " $1").trim();
}

function favorColor(level: string | undefined): string {
  const idx = favorIndex(level);
  if (idx < 0) return "text-text-muted";
  if (idx === 0) return "text-error";        // Neutral — likely can't train
  if (idx === 1) return "text-amber-400";    // Comfortable — might be okay
  if (idx === 2) return "text-gold";         // Friends
  return "text-success";                     // CloseFriends+
}

// Look up a character's favor with an NPC. The export may use "NPC_Jara" or just "Jara".
function getNpcFavor(favorLevels: Record<string, string> | undefined, npcId: string): string | undefined {
  if (!favorLevels) return undefined;
  return (
    favorLevels[npcId] ??
    favorLevels[npcId.replace(/^NPC_/, "")] ??
    undefined
  );
}

interface RecipeEntry { name: string; levelReq: number; skill: string }
interface NpcStop { npcId: string; npcName: string; area: string; recipes: RecipeEntry[] }
interface VendorEntry { label: string; npcId: string }
interface ScrollEntry { scrollName: string; cost?: number; vendors: VendorEntry[]; recipes: RecipeEntry[] }
interface OtherEntry { desc: string; npcName: string; npcId: string; entry: RecipeEntry }

export function RecipePlanner({ foods, completions, recipeByName, onClose }: Props) {
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const character = useCharacterStore((s) => s.character);

  const getSkillLevel = (skillName: string) => character?.Skills[skillName]?.Level ?? 0;

  // Unknown food recipes the character can currently learn (gated by the right skill)
  const learnableFoods = useMemo(() => {
    return foods.filter((f) => {
      if (!f.hasTracking || f.internalName in completions) return false;
      const recipe = recipeByName.get(f.internalName);
      if (!recipe) return false;
      return recipe.SkillLevelReq <= getSkillLevel(recipe.Skill);
    });
  }, [foods, completions, recipeByName, character]);

  const lockedCount = useMemo(() => {
    return foods.filter((f) => {
      if (!f.hasTracking || f.internalName in completions) return false;
      const recipe = recipeByName.get(f.internalName);
      if (!recipe) return false;
      return recipe.SkillLevelReq > getSkillLevel(recipe.Skill);
    }).length;
  }, [foods, completions, recipeByName, character]);

  const { npcStops, scrollEntries, questFoods, otherFoods, noSourceFoods } = useMemo(() => {
    // npcKey → NpcStop
    const npcMap = new Map<string, NpcStop>();
    const scrollMap = new Map<string, ScrollEntry>();
    const questFoods: RecipeEntry[] = [];
    const otherFoods: OtherEntry[] = [];
    const noSourceFoods: RecipeEntry[] = [];

    for (const food of learnableFoods) {
      const recipe = recipeByName.get(food.internalName)!;
      const entry: RecipeEntry = { name: food.itemName, levelReq: recipe.SkillLevelReq, skill: recipe.Skill };

      const sources = getRecipeSourceLabels(recipe.id, getItemByCode);
      const purchaseInfo = getRecipePurchaseInfo(recipe.id, getItemByCode);

      if (sources.length === 0) { noSourceFoods.push(entry); continue; }

      let placed = false;

      for (const src of sources) {
        switch (src.kind) {
          case "trainer": {
            // Use the raw NPC ID from purchase info — fall back to constructing from label
            const pInfo = purchaseInfo.find((p) => p.kind === "trainer" && p.npcName === src.label);
            // We need the npcId for favor lookup — derive from src label via the npcNames map
            // Since we don't have the raw npcId here, reconstruct it
            const npcId = `NPC_${src.label.replace(/\s+/g, "")}`;
            const area = src.detail ?? "Unknown Zone";
            const npcKey = `${src.label}::${area}`;
            if (!npcMap.has(npcKey)) {
              npcMap.set(npcKey, { npcId, npcName: src.label, area, recipes: [] });
            }
            const stop = npcMap.get(npcKey)!;
            if (!stop.recipes.find((r) => r.name === entry.name)) stop.recipes.push(entry);
            placed = true;
            void pInfo;
            break;
          }
          case "scroll": {
            const scrollName = src.label;
            if (!scrollMap.has(scrollName)) {
              const vendors: VendorEntry[] = [];
              const pInfo = purchaseInfo.find((p) => p.kind === "scroll" && p.scrollName === scrollName);
              if (pInfo?.scrollItemTypeId) {
                for (const m of getAcquisitionMethods(pInfo.scrollItemTypeId, 0)) {
                  if (m.kind === "vendor") {
                    const label = m.area ? `${m.npcName ?? "Vendor"} (${m.area})` : (m.npcName ?? "Vendor");
                    if (!vendors.find((v) => v.npcId === m.npcId)) {
                      vendors.push({ label, npcId: m.npcId });
                    }
                  }
                }
              }
              scrollMap.set(scrollName, { scrollName, cost: pInfo?.cost, vendors, recipes: [] });
            }
            const se = scrollMap.get(scrollName)!;
            if (!se.recipes.find((r) => r.name === entry.name)) se.recipes.push(entry);
            placed = true;
            break;
          }
          case "quest":
            if (!questFoods.find((r) => r.name === entry.name)) questFoods.push(entry);
            placed = true;
            break;
          case "hangout":
            otherFoods.push({
              desc: `Hang out with ${src.label}${src.detail ? ` (${src.detail})` : ""}`,
              npcName: src.label,
              npcId: `NPC_${src.label.replace(/\s+/g, "")}`,
              entry,
            });
            placed = true;
            break;
          case "gift":
            otherFoods.push({
              desc: `Give gift to ${src.label}${src.detail ? ` (${src.detail})` : ""}`,
              npcName: src.label,
              npcId: `NPC_${src.label.replace(/\s+/g, "")}`,
              entry,
            });
            placed = true;
            break;
          case "skill":
            placed = true;
            break;
        }
      }

      if (!placed) noSourceFoods.push(entry);
    }

    const sortEntries = (arr: RecipeEntry[]) =>
      [...arr].sort((a, b) => a.skill.localeCompare(b.skill) || a.levelReq - b.levelReq || a.name.localeCompare(b.name));

    const npcStops = Array.from(npcMap.values())
      .sort((a, b) => a.area.localeCompare(b.area) || a.npcName.localeCompare(b.npcName))
      .map((s) => ({ ...s, recipes: sortEntries(s.recipes) }));

    const scrollEntries = Array.from(scrollMap.values())
      .sort((a, b) => a.scrollName.localeCompare(b.scrollName))
      .map((s) => ({ ...s, recipes: sortEntries(s.recipes) }));

    return {
      npcStops,
      scrollEntries,
      questFoods: sortEntries(questFoods),
      otherFoods,
      noSourceFoods: sortEntries(noSourceFoods),
    };
  }, [learnableFoods, recipeByName, getItemByCode]);

  const total = learnableFoods.length;
  const cookingLevel = getSkillLevel("Cooking");
  const cheesemakingLevel = getSkillLevel("Cheesemaking");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-bg-primary border border-border rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">Recipe Hunter</h2>
            <p className="text-sm text-text-muted mt-0.5">
              {total === 0
                ? "Nothing learnable at your current skill levels"
                : `${total} recipe${total !== 1 ? "s" : ""} available to learn now`}
              {lockedCount > 0 && (
                <span className="ml-2 opacity-60">· {lockedCount} more at higher levels</span>
              )}
            </p>
            <div className="flex gap-4 mt-1 text-xs text-text-muted">
              <span>Cooking Lv <span className="text-text-primary font-medium">{cookingLevel}</span></span>
              {cheesemakingLevel > 0 && (
                <span>Cheesemaking Lv <span className="text-text-primary font-medium">{cheesemakingLevel}</span></span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl p-1">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-sm">
          {total === 0 && (
            <p className="text-center text-text-muted py-8">
              {lockedCount > 0
                ? `${lockedCount} recipe${lockedCount !== 1 ? "s" : ""} will unlock as your skill levels increase.`
                : "All learnable food recipes are already known!"}
            </p>
          )}

          {/* NPC trainer stops */}
          {npcStops.length > 0 && (
            <section>
              <SectionTitle>{npcStops.length} Trainer Stop{npcStops.length !== 1 ? "s" : ""}</SectionTitle>
              <div className="space-y-2">
                {npcStops.map((stop) => {
                  const favor = getNpcFavor(character?.FavorLevels, stop.npcId);
                  const idx = favorIndex(favor);
                  const lowFavor = idx < 2; // below Friends
                  return (
                    <div key={`${stop.npcName}::${stop.area}`} className="bg-bg-secondary rounded-lg p-3">
                      {/* NPC header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-baseline gap-2">
                            <span className="font-semibold text-text-primary">{stop.npcName}</span>
                            <span className="text-xs text-accent">{stop.area}</span>
                          </div>
                          {favor && (
                            <div className={`text-xs mt-0.5 font-medium ${favorColor(favor)}`}>
                              {favorLabel(favor)} favor
                            </div>
                          )}
                        </div>
                        {lowFavor && (
                          <div className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded shrink-0">
                            ⚠ May need higher favor
                          </div>
                        )}
                      </div>

                      {/* Recipe list */}
                      <ul className="space-y-0.5 mt-1">
                        {stop.recipes.map((r) => (
                          <li key={r.name} className="flex items-baseline gap-2 text-xs">
                            <span className="text-text-muted shrink-0 w-6 text-right">
                              {r.levelReq}
                            </span>
                            {r.skill !== "Cooking" && (
                              <span className="bg-bg-primary text-text-muted px-1 rounded text-[10px] shrink-0">
                                {formatSkillName(r.skill)}
                              </span>
                            )}
                            <span className="text-text-primary">{r.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Recipe scrolls */}
          {scrollEntries.length > 0 && (
            <section>
              <SectionTitle>Buy Recipe Scrolls</SectionTitle>
              <div className="space-y-2">
                {scrollEntries.map((s) => (
                  <div key={s.scrollName} className="bg-bg-secondary rounded-lg p-3">
                    {/* Scroll name + cost */}
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mb-2">
                      <span className="font-semibold text-text-primary">{s.scrollName}</span>
                      {s.cost != null && <span className="text-xs text-gold">{s.cost.toLocaleString()}c</span>}
                    </div>

                    {/* Vendors with favor */}
                    {s.vendors.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {s.vendors.map((v) => {
                          const favor = getNpcFavor(character?.FavorLevels, v.npcId);
                          const idx = favorIndex(favor);
                          const lowFavor = idx >= 0 && idx < 2;
                          return (
                            <div key={v.npcId} className="flex items-center justify-between gap-2">
                              <div className="flex items-baseline gap-2">
                                <span className="text-xs text-accent">{v.label}</span>
                                {favor && (
                                  <span className={`text-[10px] font-medium ${favorColor(favor)}`}>
                                    {favorLabel(favor)}
                                  </span>
                                )}
                              </div>
                              {lowFavor && (
                                <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded shrink-0">
                                  ⚠ favor
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Recipe list */}
                    <ul className="space-y-0.5">
                      {s.recipes.map((r) => (
                        <li key={r.name} className="flex items-baseline gap-2 text-xs">
                          <span className="text-text-muted shrink-0 w-6 text-right">{r.levelReq}</span>
                          {r.skill !== "Cooking" && (
                            <span className="bg-bg-primary text-text-muted px-1 rounded text-[10px] shrink-0">
                              {formatSkillName(r.skill)}
                            </span>
                          )}
                          <span className="text-text-primary">{r.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Quest rewards */}
          {questFoods.length > 0 && (
            <section>
              <SectionTitle>Quest Rewards</SectionTitle>
              <div className="bg-bg-secondary rounded-lg p-3">
                <ul className="space-y-0.5">
                  {questFoods.map((r) => (
                    <li key={r.name} className="flex items-baseline gap-2 text-xs">
                      <span className="text-text-muted shrink-0 w-6 text-right">{r.levelReq}</span>
                      {r.skill !== "Cooking" && (
                        <span className="bg-bg-primary text-text-muted px-1 rounded text-[10px] shrink-0">{formatSkillName(r.skill)}</span>
                      )}
                      <span className="text-text-primary">{r.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Hangout / Gift */}
          {otherFoods.length > 0 && (
            <section>
              <SectionTitle>NPC Relationship Rewards</SectionTitle>
              <div className="space-y-1.5">
                {otherFoods.map((item, i) => {
                  const favor = getNpcFavor(character?.FavorLevels, item.npcId);
                  const idx = favorIndex(favor);
                  const lowFavor = idx >= 0 && idx < 2;
                  return (
                    <div key={i} className="bg-bg-secondary rounded-lg p-2.5 flex items-start gap-3">
                      <span className="text-xs text-text-muted w-6 shrink-0 text-right pt-0.5">{item.entry.levelReq}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-text-primary">{item.entry.name}</div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-text-muted">{item.desc}</span>
                          {favor && (
                            <span className={`text-[10px] font-medium ${favorColor(favor)}`}>
                              {favorLabel(favor)}
                            </span>
                          )}
                          {lowFavor && (
                            <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded">
                              ⚠ favor
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Source unknown */}
          {noSourceFoods.length > 0 && (
            <section>
              <SectionTitle>Source Unknown</SectionTitle>
              <div className="bg-bg-secondary rounded-lg p-3">
                <ul className="space-y-0.5">
                  {noSourceFoods.map((r) => (
                    <li key={r.name} className="flex items-baseline gap-2 text-xs">
                      <span className="text-text-muted shrink-0 w-6 text-right">{r.levelReq}</span>
                      <span className="text-text-muted">{r.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2 border-b border-border/50 pb-1">
      {children}
    </h3>
  );
}
