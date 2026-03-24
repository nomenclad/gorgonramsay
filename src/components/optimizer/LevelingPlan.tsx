import { useState, useMemo } from "react";
import type { OptimizerResult, LevelingStep, MissingIngredient } from "../../types/optimizer";
import type { Item } from "../../types";
import {
  getAcquisitionMethods,
  getRecipeSourceLabels,
  type RecipeSourceLabel,
} from "../../lib/sourceResolver";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useCharacterStore } from "../../stores/characterStore";
import { ItemTooltip } from "../common/ItemTooltip";

interface Props {
  result: OptimizerResult;
  getItemByCode: (code: number) => Item | undefined;
}

type ActiveTab = "steps" | "recipes" | "missing";

export function LevelingPlan({ result, getItemByCode }: Props) {
  const character = useCharacterStore((s) => s.character);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("steps");

  const knownRecipes = useMemo(
    () => new Set(Object.keys(character?.RecipeCompletions ?? {})),
    [character]
  );

  // Unique recipes in the plan that the player doesn't know yet
  const recipesToLearn = useMemo(() => {
    const seen = new Set<string>();
    const list: { recipeId: string; recipeName: string; skillLevelReq: number; internalName: string }[] = [];
    for (const step of result.steps) {
      if (!seen.has(step.recipeId) && !knownRecipes.has(step.recipeInternalName)) {
        seen.add(step.recipeId);
        list.push({
          recipeId: step.recipeId,
          recipeName: step.recipeName,
          skillLevelReq: step.skillLevelReq,
          internalName: step.recipeInternalName,
        });
      }
    }
    return list.sort((a, b) => a.skillLevelReq - b.skillLevelReq);
  }, [result.steps, knownRecipes]);

  const totalSteps = result.steps.length;
  const fromInventory = result.steps.filter((s) => s.canCraftFromInventory).length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="bg-bg-secondary rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-text-muted text-xs mb-0.5">Route</div>
          <div className="font-medium">
            Lv {result.fromLevel} → {result.toLevel}
          </div>
        </div>
        <div>
          <div className="text-text-muted text-xs mb-0.5">Total XP</div>
          <div className="font-medium text-success">
            {result.totalXpGained.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-text-muted text-xs mb-0.5">Recipe Steps</div>
          <div className="font-medium">
            {totalSteps}{" "}
            <span className="text-text-muted text-xs">
              ({fromInventory} from inventory)
            </span>
          </div>
        </div>
        <div>
          <div className="text-text-muted text-xs mb-0.5">Est. Cost</div>
          <div className={`font-medium ${result.totalIngredientCost > 0 ? "text-gold" : "text-success"}`}>
            {result.totalIngredientCost > 0
              ? `${result.totalIngredientCost.toLocaleString()}c`
              : "Free!"}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-bg-secondary rounded-lg p-1 w-fit">
        <TabButton label={`Leveling Steps (${result.steps.length})`} tab="steps" activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton
          label={`Recipes to Learn${recipesToLearn.length > 0 ? ` (${recipesToLearn.length})` : ""}`}
          tab="recipes"
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          highlight={recipesToLearn.length > 0}
        />
        <TabButton label={`Shopping List (${result.missingIngredients.length})`} tab="missing" activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>

      {activeTab === "steps" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary text-xs">
                <th className="py-2 px-3">Recipe</th>
                <th className="py-2 px-3 w-24" />
                <th className="py-2 px-3 text-right">Crafts</th>
                <th className="py-2 px-3 text-right">XP/craft</th>
                <th className="py-2 px-3 text-right">Total XP</th>
                <th className="py-2 px-3">Ingredients</th>
                <th className="py-2 px-3">Where to Learn Recipe</th>
                <th className="py-2 px-3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {result.steps.map((step, i) => (
                <StepRow
                  key={`${step.recipeId}-${i}`}
                  step={step}
                  isKnown={knownRecipes.has(step.recipeInternalName)}
                  getItemByCode={getItemByCode}
                  expanded={expandedStep === `${step.recipeId}-${i}`}
                  onToggle={() =>
                    setExpandedStep(
                      expandedStep === `${step.recipeId}-${i}`
                        ? null
                        : `${step.recipeId}-${i}`
                    )
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "recipes" && (
        <RecipesToLearnTab
          recipesToLearn={recipesToLearn}
          getItemByCode={getItemByCode}
        />
      )}

      {activeTab === "missing" && (
        <MissingIngredientsList result={result} />
      )}
    </div>
  );
}

function TabButton({
  label, tab, activeTab, setActiveTab, highlight,
}: {
  label: string; tab: ActiveTab; activeTab: ActiveTab;
  setActiveTab: (t: ActiveTab) => void; highlight?: boolean;
}) {
  return (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-3 py-1.5 rounded text-sm transition-colors ${
        activeTab === tab
          ? "bg-accent text-white"
          : highlight
          ? "text-gold hover:text-text-primary"
          : "text-text-secondary hover:text-text-primary"
      }`}
    >
      {label}
    </button>
  );
}

function StepRow({
  step,
  isKnown,
  getItemByCode,
  expanded,
  onToggle,
}: {
  step: LevelingStep;
  isKnown: boolean;
  getItemByCode: (code: number) => Item | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  const sourceLabels = getRecipeSourceLabels(step.recipeId, getItemByCode);

  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-border/50 cursor-pointer hover:bg-bg-secondary/50 ${
          step.isFirstTime
            ? "bg-gold/5"
            : step.canCraftFromInventory
            ? "bg-success/5"
            : ""
        }`}
      >
        <td className="py-2 px-3">
          <span className="font-medium">{step.recipeName}</span>
          <div className="text-xs text-text-muted">Req Lv {step.skillLevelReq}</div>
        </td>
        <td className="py-2 px-3 w-24">
          {step.isFirstTime ? (
            <span className="text-xs bg-gold/20 text-gold px-1.5 py-0.5 rounded whitespace-nowrap">
              FIRST TIME
            </span>
          ) : step.canCraftFromInventory ? (
            <span className="text-xs bg-success/20 text-success px-1.5 py-0.5 rounded whitespace-nowrap">
              IN STOCK
            </span>
          ) : null}
        </td>
        <td className="py-2 px-3 text-right">{step.craftCount.toLocaleString()}</td>
        <td className="py-2 px-3 text-right text-success">
          {step.xpPerCraft.toLocaleString()}
        </td>
        <td className="py-2 px-3 text-right font-medium">
          {step.totalXp.toLocaleString()}
        </td>
        <td className="py-2 px-3 text-xs text-text-muted">
          {step.ingredients.map((ing, i) => (
            <span key={ing.itemCode}>
              {i > 0 && ", "}
              <span className={ing.sufficient ? "text-success" : "text-danger"}>
                {ing.name} ×{ing.expectedNeeded}
              </span>
            </span>
          ))}
        </td>
        <td className="py-2 px-3">
          {isKnown ? (
            <span className="text-xs text-success">✓ Known</span>
          ) : sourceLabels.length > 0 ? (
            <SourceDisplay labels={sourceLabels} />
          ) : (
            <span className="text-xs text-text-muted">—</span>
          )}
        </td>
        <td className="py-2 px-3 text-right">
          {step.ingredientCost > 0 ? (
            <span className="text-gold">{step.ingredientCost.toLocaleString()}c</span>
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/50">
          <td colSpan={8} className="py-3 px-6 bg-bg-secondary/30">
            <div className="space-y-2">
              <div className="text-xs font-medium text-text-secondary">Ingredients:</div>
              <div className="flex flex-wrap gap-3">
                {step.ingredients.map((ing) => (
                  <ItemTooltip key={ing.itemCode} itemCode={ing.itemCode} quantity={ing.have}>
                    <span
                      className={`text-xs px-2 py-1 rounded border inline-block ${
                        ing.sufficient
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-danger/30 bg-danger/10 text-danger"
                      }`}
                    >
                      {ing.name}
                      <span className="ml-1 opacity-80">
                        x{ing.expectedNeeded} (have {ing.have})
                      </span>
                    </span>
                  </ItemTooltip>
                ))}
              </div>
              {step.resultItems.length > 0 && (
                <>
                  <div className="text-xs font-medium text-text-secondary mt-2">
                    Produces:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {step.resultItems.map((r) => (
                      <span key={r.itemCode} className="text-xs text-text-muted">
                        {r.name} x{r.quantity}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function RecipesToLearnTab({
  recipesToLearn,
  getItemByCode,
}: {
  recipesToLearn: { recipeId: string; recipeName: string; skillLevelReq: number; internalName: string }[];
  getItemByCode: (code: number) => Item | undefined;
}) {
  if (recipesToLearn.length === 0) {
    return (
      <div className="text-center py-8 text-success text-sm">
        ✓ You already know all recipes needed for this leveling plan!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        You need to learn {recipesToLearn.length} recipe{recipesToLearn.length !== 1 ? "s" : ""} before you can follow this leveling plan. Learn them in order of level requirement.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary text-xs">
            <th className="py-2 px-3">Recipe</th>
            <th className="py-2 px-3 text-right">Req Lv</th>
            <th className="py-2 px-3">Where to Learn</th>
          </tr>
        </thead>
        <tbody>
          {recipesToLearn.map((r) => {
            const labels = getRecipeSourceLabels(r.recipeId, getItemByCode);
            return (
              <tr key={r.recipeId} className="border-b border-border/50 hover:bg-bg-secondary/50">
                <td className="py-2 px-3 font-medium">
                  {r.recipeName}
                </td>
                <td className="py-2 px-3 text-right text-text-muted">{r.skillLevelReq}</td>
                <td className="py-2 px-3">
                  {labels.length > 0 ? (
                    <SourceDisplay labels={labels} />
                  ) : (
                    <span className="text-xs text-text-muted italic">Source unknown</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SourceDisplay({ labels }: { labels: RecipeSourceLabel[] }) {
  return (
    <div className="space-y-0.5">
      {labels.map((l, i) => (
        <div key={i} className="text-xs flex items-baseline gap-1">
          <SourceBadgeIcon kind={l.kind} />
          <span className="text-text-primary">{l.label}</span>
          {l.detail && (
            <span className="text-text-muted">({l.detail})</span>
          )}
        </div>
      ))}
    </div>
  );
}

function SourceBadgeIcon({ kind }: { kind: RecipeSourceLabel["kind"] }) {
  switch (kind) {
    case "trainer":  return <span>🎓</span>;
    case "scroll":   return <span>📜</span>;
    case "skill":    return <span>⭐</span>;
    case "quest":    return <span>📋</span>;
    case "hangout":  return <span>💬</span>;
    case "gift":     return <span>🎁</span>;
    default:         return <span className="text-text-muted">?</span>;
  }
}

function SourceBadge({ itemCode, quantity }: { itemCode: number; quantity: number }) {
  const methods = getAcquisitionMethods(itemCode, quantity);
  // Find best non-inventory method for shopping list
  const method = methods.find((m) => m.kind !== "inventory") ?? methods[0];
  if (!method) return <span className="text-text-muted text-xs">Unknown</span>;

  switch (method.kind) {
    case "vendor":
      return (
        <span className="text-xs">
          <span className="text-accent font-medium">{method.npcName ?? "Vendor"}</span>
          {method.area && <span className="text-text-muted ml-1">({method.area})</span>}
        </span>
      );
    case "craft":
      return <span className="text-xs text-text-secondary">Craft it</span>;
    case "monster":
      return <span className="text-xs text-text-muted">Monster drop</span>;
    case "fishing":
      return <span className="text-xs text-text-muted">Fishing</span>;
    case "gather":
      return <span className="text-xs text-text-muted">Gather/harvest</span>;
    case "quest":
      return <span className="text-xs text-text-muted">Quest reward</span>;
    case "inventory":
      return <span className="text-xs text-success">In inventory</span>;
    default:
      return <span className="text-xs text-text-muted">{method.description}</span>;
  }
}

function MissingIngredientsList({ result }: { result: OptimizerResult }) {
  const getItemLocations = useInventoryStore((s) => s.getItemLocations);

  if (result.missingIngredients.length === 0) {
    return (
      <div className="text-center py-8 text-success">
        You have all required ingredients in your inventory!
      </div>
    );
  }

  // Group by acquisition method kind
  const vendors: MissingIngredient[] = [];
  const craftable: MissingIngredient[] = [];
  const farmable: MissingIngredient[] = [];
  const other: MissingIngredient[] = [];

  for (const ing of result.missingIngredients) {
    const methods = getAcquisitionMethods(ing.itemCode, ing.inInventory);
    const nonInv = methods.filter((m) => m.kind !== "inventory");
    const primary = nonInv[0];
    if (!primary || primary.kind === "vendor") vendors.push(ing);
    else if (primary.kind === "craft") craftable.push(ing);
    else if (primary.kind === "monster" || primary.kind === "gather" || primary.kind === "fishing") farmable.push(ing);
    else other.push(ing);
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-text-muted">
        Total estimated cost:{" "}
        <span className="text-gold font-medium">
          {result.totalIngredientCost.toLocaleString()}c
        </span>
      </div>

      {vendors.length > 0 && (
        <ShoppingGroup title="Buy from Vendor" items={vendors} getItemLocations={getItemLocations} />
      )}
      {craftable.length > 0 && (
        <ShoppingGroup title="Craft Sub-ingredients" items={craftable} getItemLocations={getItemLocations} />
      )}
      {farmable.length > 0 && (
        <ShoppingGroup title="Farm / Gather" items={farmable} getItemLocations={getItemLocations} />
      )}
      {other.length > 0 && (
        <ShoppingGroup title="Other" items={other} getItemLocations={getItemLocations} />
      )}
    </div>
  );
}

function ShoppingGroup({
  title,
  items,
  getItemLocations,
}: {
  title: string;
  items: MissingIngredient[];
  getItemLocations: (typeId: number) => { vault: string; quantity: number }[];
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">{title}</h4>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary text-xs">
            <th className="py-1.5 px-3">Item</th>
            <th className="py-1.5 px-3 text-right">Need</th>
            <th className="py-1.5 px-3 text-right">Have</th>
            <th className="py-1.5 px-3 text-right">To Buy</th>
            <th className="py-1.5 px-3 text-right">Est. Cost</th>
            <th className="py-1.5 px-3">Where to get</th>
          </tr>
        </thead>
        <tbody>
          {items.map((ing) => {
            const locations = ing.inInventory > 0 ? getItemLocations(ing.itemCode) : [];
            return (
              <tr
                key={ing.itemCode}
                className="border-b border-border/50 hover:bg-bg-secondary/50"
              >
                <td className="py-2 px-3 font-medium">
                  {ing.name}
                  {locations.length > 0 && (
                    <div className="text-xs text-text-muted mt-0.5">
                      {locations.map((l) => `${l.vault}: ${l.quantity}`).join(", ")}
                    </div>
                  )}
                </td>
                <td className="py-2 px-3 text-right">{ing.totalNeeded}</td>
                <td className="py-2 px-3 text-right text-success">{ing.inInventory}</td>
                <td className="py-2 px-3 text-right text-danger">{ing.toBuy}</td>
                <td className="py-2 px-3 text-right text-gold">
                  {ing.estimatedCost > 0
                    ? `${ing.estimatedCost.toLocaleString()}c`
                    : "—"}
                </td>
                <td className="py-2 px-3">
                  <SourceBadge itemCode={ing.itemCode} quantity={ing.inInventory} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
