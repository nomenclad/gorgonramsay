/**
 * Hover tooltip showing item details: inventory locations, vendor sources,
 * craftable recipes, and other acquisition methods (monster drops, gathering, fishing).
 * Rendered as a fixed-position portal on mouse enter; hidden on mouse leave.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { getAcquisitionMethods, getRecipeSourceLabels, type AcquisitionMethod, type RecipeSourceLabel } from "../../lib/sourceResolver";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useInventoryStore } from "../../stores/inventoryStore";

interface Props {
  itemCode: number;
  quantity: number;
  children: React.ReactNode;
}

function RecipeLearnRow({ s }: { s: RecipeSourceLabel }) {
  switch (s.kind) {
    case "trainer":
      return (
        <div className="flex flex-col">
          <span className="text-text-primary">{s.label}</span>
          {s.detail && <span className="text-text-muted">{s.detail}</span>}
        </div>
      );
    case "scroll":
      return (
        <div className="flex flex-col">
          <span className="text-text-muted">Recipe scroll</span>
          <span className="text-text-primary">{s.label}</span>
          {s.detail && <span className="text-text-muted">{s.detail}</span>}
        </div>
      );
    case "skill":
      return (
        <div className="flex flex-col">
          <span className="text-text-muted">Auto-learned from skill</span>
          <span className="text-text-primary">{s.label}</span>
        </div>
      );
    case "quest":
      return <span className="text-text-primary">Quest reward</span>;
    case "hangout":
      return (
        <div className="flex flex-col">
          <span className="text-text-muted">Hang out with</span>
          <span className="text-text-primary">{s.label}</span>
          {s.detail && <span className="text-text-muted">{s.detail}</span>}
        </div>
      );
    case "gift":
      return (
        <div className="flex flex-col">
          <span className="text-text-muted">Gift to</span>
          <span className="text-text-primary">{s.label}</span>
          {s.detail && <span className="text-text-muted">{s.detail}</span>}
        </div>
      );
    default:
      return (
        <div className="flex flex-col">
          <span className="text-text-primary">{s.label}</span>
          {s.detail && <span className="text-text-muted">{s.detail}</span>}
        </div>
      );
  }
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-1 mt-2 first:mt-0 border-b border-border/40 pb-0.5">
      {children}
    </div>
  );
}

export function ItemTooltip({ itemCode, quantity, children }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const fmtVault = useGameDataStore((s) => s.formatVaultName);
  const getItemLocations = useInventoryStore((s) => s.getItemLocations);

  const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const y = spaceBelow > 160 ? rect.bottom + 6 : rect.top - 6;
    const x = Math.min(rect.left, window.innerWidth - 240);
    setPos({ x, y });
  };

  const methods: AcquisitionMethod[] = pos ? getAcquisitionMethods(itemCode, quantity) : [];
  const locations = pos && quantity > 0 ? getItemLocations(itemCode) : [];

  // Vendors
  const vendors = methods.filter((m) => m.kind === "vendor") as Extract<AcquisitionMethod, { kind: "vendor" }>[];

  // Craftable recipes + their sources
  const craftMethods = methods.filter((m) => m.kind === "craft") as Extract<AcquisitionMethod, { kind: "craft" }>[];
  const recipeSourceMap = new Map<number, RecipeSourceLabel[]>();
  for (const m of craftMethods) {
    if (!recipeSourceMap.has(m.recipeId)) {
      recipeSourceMap.set(
        m.recipeId,
        getRecipeSourceLabels(`recipe_${m.recipeId}`, (code) => getItemByCode(code))
      );
    }
  }

  // Other obtainment (monster, gather, fishing) — exclude quest
  const otherMethods = methods.filter(
    (m) => m.kind !== "vendor" && m.kind !== "craft" && m.kind !== "inventory" && m.kind !== "quest"
  );

  const hasAnyInfo = locations.length > 0 || vendors.length > 0 || craftMethods.length > 0 || otherMethods.length > 0;

  const recipeLearnSources: RecipeSourceLabel[] = [];
  for (const m of craftMethods) {
    const srcs = recipeSourceMap.get(m.recipeId) ?? [];
    for (const s of srcs) {
      if (s.kind === "quest") continue;
      if (!recipeLearnSources.find((x) => x.label === s.label && x.kind === s.kind)) {
        recipeLearnSources.push(s);
      }
    }
  }

  const otherMethodLabel = (m: AcquisitionMethod) => {
    switch (m.kind) {
      case "monster": return "Monster drop";
      case "fishing": return "Fishing";
      case "gather":  return "Gather / harvest";
      case "quest":   return "Quest reward";
      default: return (m as { description?: string }).description ?? "Other";
    }
  };

  const tooltipContent = pos ? (
    <div
      className="border border-border rounded shadow-2xl p-2.5 text-xs min-w-48 max-w-64 pointer-events-none"
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        transform: pos.y < window.innerHeight / 2 ? undefined : "translateY(-100%)",
        backgroundColor: "var(--color-bg-primary)",
      }}
    >
      {!hasAnyInfo && locations.length === 0 && (
        <div className="text-text-muted">Source unknown</div>
      )}

      {/* In Your Inventory */}
      {locations.length > 0 && (
        <div>
          <SectionHeader>In Your Inventory</SectionHeader>
          <div className="space-y-0.5">
            {locations.map((loc, i) => (
              <div key={i} className="flex justify-between gap-3">
                <span className="text-text-primary truncate">{fmtVault(loc.vault)}</span>
                <span className="text-success shrink-0">×{loc.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Where to Buy */}
      {vendors.length > 0 && (
        <div>
          <SectionHeader>Where to Buy</SectionHeader>
          <div className="space-y-0.5">
            {vendors.map((v, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-accent">{v.npcName ?? "Vendor"}</span>
                {v.area && <span className="text-text-muted">{v.area}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Craft it */}
      {craftMethods.length > 0 && (
        <div>
          <SectionHeader>Craftable</SectionHeader>
          {recipeLearnSources.length > 0 ? (
            <div>
              <div className="text-text-muted mb-0.5 text-[10px]">Learn the recipe from:</div>
              <div className="space-y-0.5">
                {recipeLearnSources.map((s, i) => (
                  <RecipeLearnRow key={i} s={s} />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-text-muted">Recipe source unknown</div>
          )}
        </div>
      )}

      {/* Other */}
      {otherMethods.length > 0 && (
        <div>
          <SectionHeader>Other Sources</SectionHeader>
          <div className="space-y-0.5">
            {otherMethods.map((m, i) => (
              <div key={i} className="text-text-muted">{otherMethodLabel(m)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <span
      className="cursor-default"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {tooltipContent && createPortal(tooltipContent, document.body)}
    </span>
  );
}
