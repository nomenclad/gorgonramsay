/**
 * Route planning sub-tab within the planner. Builds a zone-by-zone travel route
 * from storage stops, vendor purchases, foraging, gardening, and cooking actions.
 * Zones are ordered with non-cooking zones first, gardening second-to-last, cooking last.
 */
import { useMemo } from "react";
import { useCharacterStore } from "../../stores/characterStore";
import { getRecipeSourceLabels } from "../../lib/sourceResolver";
import { useGameDataStore } from "../../stores/gameDataStore";
import { pickBestVendor } from "./plannerUtils";
import { formatSkillName } from "../../lib/foodSkills";
import type { Recipe } from "../../types/recipe";
import type { GatheringRoute, CraftingStep, StillNeededItem, AltTransferItem } from "./plannerUtils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RouteAction {
  type: "buy_recipe" | "storage" | "vendor_buy" | "forage" | "garden" | "cook" | "alt_deposit" | "transfer_pickup";
  label: string;
  items: { name: string; qty?: number; detail?: string }[];
}

interface ZoneRoute {
  zone: string;
  isGardeningZone: boolean;
  isCookingZone: boolean;
  actions: RouteAction[];
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  gatheringRoute: GatheringRoute;
  gardeningSteps: CraftingStep[];
  cookingSteps: CraftingStep[];
  plannedRecipes: { recipe: Recipe; quantity: number }[];
  stillNeeded: StillNeededItem[];
  gardenNeeded?: StillNeededItem[];
  purchaseNeeded?: StillNeededItem[];
  gardeningZone: string;
  cookingZone: string;
}

// ─── Icon helpers ───────────────────────────────────────────────────────────

const ACTION_ICONS: Record<RouteAction["type"], string> = {
  buy_recipe: "📖",
  storage: "📦",
  vendor_buy: "🛒",
  forage: "🌿",
  garden: "🌱",
  cook: "🍳",
  alt_deposit: "🔄",
  transfer_pickup: "📬",
};

const ACTION_LABELS: Record<RouteAction["type"], string> = {
  buy_recipe: "Learn Recipes",
  storage: "Collect from Storage",
  vendor_buy: "Buy from Vendors",
  forage: "Forage / Farm",
  garden: "Plant Garden",
  cook: "Cook Recipes",
  alt_deposit: "Alt Deposits to Transfer Chest",
  transfer_pickup: "Pick Up from Transfer Chest",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function RouteTab({
  gatheringRoute,
  gardeningSteps,
  cookingSteps,
  plannedRecipes,
  stillNeeded,
  gardenNeeded = [],
  purchaseNeeded = [],
  gardeningZone,
  cookingZone,
}: Props) {
  const character = useCharacterStore((s) => s.character);
  const completions = character?.RecipeCompletions ?? {};
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);

  const route = useMemo(() => {
    const zoneActions = new Map<string, RouteAction[]>();

    function getOrCreate(zone: string): RouteAction[] {
      if (!zoneActions.has(zone)) zoneActions.set(zone, []);
      return zoneActions.get(zone)!;
    }

    // 1. Unknown recipes → find where to learn them
    for (const pr of plannedRecipes) {
      const known = pr.recipe.InternalName in completions;
      if (known) continue;
      const labels = getRecipeSourceLabels(pr.recipe.id, getItemByCode);
      for (const sl of labels) {
        if (sl.kind === "trainer" && sl.detail) {
          const zone = sl.detail; // area name from source labels
          const actions = getOrCreate(zone);
          const existing = actions.find((a) => a.type === "buy_recipe");
          if (existing) {
            existing.items.push({
              name: pr.recipe.Name,
              detail: `from ${sl.label}`,
            });
          } else {
            actions.push({
              type: "buy_recipe",
              label: ACTION_LABELS.buy_recipe,
              items: [{ name: pr.recipe.Name, detail: `from ${sl.label}` }],
            });
          }
        }
      }
    }

    // 2. Storage vault stops
    for (const zs of gatheringRoute.zoneStops) {
      const actions = getOrCreate(zs.zone);
      for (const vs of zs.vaults) {
        actions.push({
          type: "storage",
          label: `Collect from ${vs.label}`,
          items: vs.items.map((i) => ({ name: i.itemName, qty: i.toCollect })),
        });
      }
    }

    // 3. Vendor buys from purchaseNeeded (one vendor per item, prefer cooking zone)
    for (const item of purchaseNeeded) {
      const vendor = pickBestVendor(item.itemCode, cookingZone);
      if (!vendor) continue;
      const zone = vendor.area;
      const actions = getOrCreate(zone);
      const existing = actions.find((a) => a.type === "vendor_buy");
      if (existing) {
        existing.items.push({
          name: item.itemName,
          qty: item.shortfall,
          detail: vendor.npcName,
        });
      } else {
        actions.push({
          type: "vendor_buy",
          label: ACTION_LABELS.vendor_buy,
          items: [{ name: item.itemName, qty: item.shortfall, detail: vendor.npcName }],
        });
      }
    }

    // 4. Gardening steps (in gardening zone)
    if ((gardeningSteps.length > 0 || gardenNeeded.length > 0) && gardeningZone) {
      const actions = getOrCreate(gardeningZone);
      const gardenItems = [
        ...gardeningSteps.map((s) => ({
          name: s.resultItemName,
          qty: s.runs * s.resultQty,
          detail: `${s.runs} batch${s.runs !== 1 ? "es" : ""}`,
        })),
        ...gardenNeeded.map((i) => ({
          name: i.itemName,
          qty: i.shortfall,
          detail: "grow from seeds",
        })),
      ];
      actions.push({
        type: "garden",
        label: ACTION_LABELS.garden,
        items: gardenItems,
      });
    }

    // 5. Cooking steps (in cooking zone)
    if (plannedRecipes.length > 0 && cookingZone) {
      const actions = getOrCreate(cookingZone);
      // Add intermediate cooking steps
      for (const step of cookingSteps) {
        if (step.skill === "Gardening") continue;
        const existing = actions.find((a) => a.type === "cook");
        if (existing) {
          existing.items.push({
            name: step.recipeName,
            qty: step.runs,
            detail: `${formatSkillName(step.skill)} Lv${step.levelReq}`,
          });
        } else {
          actions.push({
            type: "cook",
            label: ACTION_LABELS.cook,
            items: [{ name: step.recipeName, qty: step.runs, detail: `${formatSkillName(step.skill)} Lv${step.levelReq}` }],
          });
        }
      }
      // Add final recipes
      for (const pr of plannedRecipes) {
        const existing = actions.find((a) => a.type === "cook");
        if (existing) {
          existing.items.push({
            name: pr.recipe.Name,
            qty: pr.quantity,
            detail: `${formatSkillName(pr.recipe.Skill)} Lv${pr.recipe.SkillLevelReq}`,
          });
        } else {
          actions.push({
            type: "cook",
            label: ACTION_LABELS.cook,
            items: [{ name: pr.recipe.Name, qty: pr.quantity, detail: `${formatSkillName(pr.recipe.Skill)} Lv${pr.recipe.SkillLevelReq}` }],
          });
        }
      }
    }

    // Sort actions within each zone by priority
    const priority: Record<RouteAction["type"], number> = {
      buy_recipe: 0,
      storage: 1,
      vendor_buy: 2,
      forage: 3,
      garden: 4,
      cook: 5,
    };
    for (const actions of zoneActions.values()) {
      actions.sort((a, b) => priority[a.type] - priority[b.type]);
    }

    // Build zone route list, ordered
    const zones: ZoneRoute[] = Array.from(zoneActions.entries())
      .map(([zone, actions]) => ({
        zone,
        isGardeningZone: zone === gardeningZone,
        isCookingZone: zone === cookingZone,
        actions,
      }))
      .sort((a, b) => {
        // Cooking zone last
        if (a.isCookingZone && !b.isCookingZone) return 1;
        if (b.isCookingZone && !a.isCookingZone) return -1;
        // Gardening zone second to last
        if (a.isGardeningZone && !b.isGardeningZone) return 1;
        if (b.isGardeningZone && !a.isGardeningZone) return -1;
        return a.zone.localeCompare(b.zone);
      });

    return zones;
  }, [
    gatheringRoute,
    gardeningSteps,
    cookingSteps,
    plannedRecipes,
    stillNeeded,
    gardenNeeded,
    purchaseNeeded,
    gardeningZone,
    cookingZone,
    completions,
    getItemByCode,
  ]);

  if (route.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">
        No route to display. Star recipes or set your cooking/gardening zones.
      </div>
    );
  }

  // Group alt transfers by character for display before the main route
  const altTransfersByChar = (gatheringRoute.altTransfers ?? []).reduce((acc, t) => {
    if (!acc.has(t.fromCharacter)) acc.set(t.fromCharacter, []);
    acc.get(t.fromCharacter)!.push(t);
    return acc;
  }, new Map<string, typeof gatheringRoute.altTransfers>());

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">
        Follow this zone-by-zone route. Non-cooking zones are listed first, ending at your cooking zone.
      </p>

      {/* Alt character deposit steps — shown before the main route */}
      {altTransfersByChar.size > 0 && (
        <div className="bg-amber-400/5 rounded-lg border border-amber-400/20 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-400/10 border-b border-amber-400/20">
            <span className="text-xs text-amber-400 font-medium">Pre-Step</span>
            <span className="text-sm font-semibold text-amber-400">Alt Character Transfers</span>
          </div>
          <div className="p-3 space-y-3">
            {Array.from(altTransfersByChar.entries()).map(([charName, items]) => (
              <div key={charName}>
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400 mb-1">
                  <span>🔄</span>
                  <span>Log in as <strong>{charName}</strong> — deposit into any Transfer Chest:</span>
                </div>
                <ul className="ml-5 space-y-0.5">
                  {items.map((item, i) => (
                    <li key={`${item.itemCode}-${i}`} className="flex items-baseline gap-2 text-xs">
                      <span className="text-amber-400 font-medium shrink-0">×{item.quantity}</span>
                      <span className="text-text-primary">{item.itemName}</span>
                      <span className="text-text-muted">from {item.fromVault}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {route.map((zr, zoneIdx) => (
        <div key={zr.zone} className="bg-bg-secondary rounded-lg border border-border overflow-hidden">
          {/* Zone header */}
          <div className="flex items-center gap-2 px-3 py-2 bg-bg-primary/50 border-b border-border">
            <span className="text-xs text-text-muted font-medium">Stop {zoneIdx + 1}</span>
            <span className={`text-sm font-semibold ${
              zr.isCookingZone ? "text-accent" : zr.isGardeningZone ? "text-success" : "text-text-primary"
            }`}>
              {zr.zone}
            </span>
            {zr.isGardeningZone && (
              <span className="text-xs bg-success/10 text-success px-1.5 py-0.5 rounded">Garden</span>
            )}
            {zr.isCookingZone && (
              <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded">Cook</span>
            )}
          </div>

          {/* Actions within this zone */}
          <div className="p-3 space-y-3">
            {zr.actions.map((action, actionIdx) => (
              <div key={`${action.type}-${actionIdx}`}>
                <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1">
                  <span>{ACTION_ICONS[action.type]}</span>
                  <span>{action.label}</span>
                </div>
                <ul className="ml-5 space-y-0.5">
                  {action.items.map((item, itemIdx) => (
                    <li key={itemIdx} className="flex items-baseline gap-2 text-xs">
                      {item.qty != null && (
                        <span className="text-accent font-medium shrink-0">×{item.qty}</span>
                      )}
                      <span className="text-text-primary">{item.name}</span>
                      {item.detail && (
                        <span className="text-text-muted">{item.detail}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
