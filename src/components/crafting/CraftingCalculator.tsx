import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useGameDataStore, type RecipeIndexes } from "../../stores/gameDataStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useNavStore } from "../../stores/navStore";
import { FOOD_SKILLS, formatSkillName } from "../../lib/foodSkills";
import type { Recipe } from "../../types/recipe";

// ─── Layout constants ─────────────────────────────────────────────────────────
const NODE_W = 180;
const NODE_H = 80;
const COL_GAP = 58;
const ROW_GAP = 14;
const MAX_DEPTH = 8;
const SIDEBAR_MIN = 140;
const SIDEBAR_MAX = 480;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 2.5;

const SKILL_ABBREV: Record<string, string> = {
  Cooking: "COO",
  Cheesemaking: "CHE",
  Fishing: "FSH",
  Angling: "ANG",
  Gardening: "GRD",
  Gourmand: "GOU",
  Butchering: "BUT",
  Mycology: "MYC",
  SushiPreparation: "SUS",
  IceConjuration: "ICE",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface CraftNode {
  nodeId: string;
  itemCode: number;
  name: string;
  needed: number;
  inInventory: number;
  recipeId?: string;
  skill?: string;
  levelReq?: number;
  resultQty: number;
  children: CraftNode[];
}

interface LayoutNode extends Omit<CraftNode, "children"> {
  x: number;
  y: number;
}

interface Edge {
  childId: string;
  parentId: string;
}

interface ContextMenu {
  x: number;
  y: number;
  node: LayoutNode;
}

// ─── Tree builder ─────────────────────────────────────────────────────────────
function buildTree(
  itemCode: number,
  needed: number,
  recipeIndexes: RecipeIndexes,
  getItemByCode: (code: number) => { Name: string } | undefined,
  getItemQuantity: (code: number) => number,
  visited: Set<number>,
  depth: number,
  counter: { val: number }
): CraftNode {
  const nodeId = `n${counter.val++}`;
  const item = getItemByCode(itemCode);
  const name = item?.Name ?? `Item #${itemCode}`;
  const inInventory = getItemQuantity(itemCode);

  const recipe = (recipeIndexes.byResultItem.get(itemCode) ?? []).find((r) =>
    FOOD_SKILLS.has(r.Skill)
  );

  if (!recipe || depth >= MAX_DEPTH || visited.has(itemCode)) {
    return { nodeId, itemCode, name, needed, inInventory, resultQty: 1, children: [] };
  }

  const resultQty =
    recipe.ResultItems.find((ri) => ri.ItemCode === itemCode)?.StackSize ?? 1;
  const runs = Math.ceil(needed / resultQty);

  const newVisited = new Set(visited);
  newVisited.add(itemCode);

  const children = recipe.Ingredients.map((ing) =>
    buildTree(
      ing.ItemCode,
      ing.StackSize * runs,
      recipeIndexes,
      getItemByCode,
      getItemQuantity,
      newVisited,
      depth + 1,
      counter
    )
  );

  return {
    nodeId,
    itemCode,
    name,
    needed,
    inInventory,
    recipeId: recipe.id,
    skill: recipe.Skill,
    levelReq: recipe.SkillLevelReq,
    resultQty,
    children,
  };
}

// ─── Layout engine ────────────────────────────────────────────────────────────
function layoutTree(root: CraftNode): {
  nodes: LayoutNode[];
  edges: Edge[];
  totalWidth: number;
  totalHeight: number;
} {
  const nodes: LayoutNode[] = [];
  const edges: Edge[] = [];

  function treeDepth(n: CraftNode): number {
    if (n.children.length === 0) return 0;
    return 1 + Math.max(...n.children.map(treeDepth));
  }
  const maxCol = treeDepth(root);

  let nextSlot = 0;

  function place(node: CraftNode, depth: number): number {
    const x = (maxCol - depth) * (NODE_W + COL_GAP);
    let cy: number;

    if (node.children.length === 0) {
      cy = nextSlot * (NODE_H + ROW_GAP);
      nextSlot++;
    } else {
      const ys = node.children.map((child) => {
        const childY = place(child, depth + 1);
        edges.push({ childId: child.nodeId, parentId: node.nodeId });
        return childY;
      });
      cy = (ys[0] + ys[ys.length - 1]) / 2;
    }

    const { children: _c, ...rest } = node;
    nodes.push({ ...rest, x, y: cy });
    return cy;
  }

  place(root, 0);

  return {
    nodes,
    edges,
    totalWidth: (maxCol + 1) * (NODE_W + COL_GAP) + 24,
    totalHeight: Math.max(nextSlot * (NODE_H + ROW_GAP), NODE_H + 24),
  };
}

// ─── Node card ────────────────────────────────────────────────────────────────
function NodeCard({
  node,
  onContextMenu,
}: {
  node: LayoutNode;
  onContextMenu: (e: React.MouseEvent, node: LayoutNode) => void;
}) {
  const isLeaf = !node.recipeId;
  const hasAll = node.inInventory >= node.needed;
  const hasSome = node.inInventory > 0 && node.inInventory < node.needed;

  const borderCls = isLeaf
    ? hasAll
      ? "border-success/50 bg-success/8"
      : hasSome
      ? "border-amber-500/50 bg-amber-500/8"
      : "border-success/25 bg-success/5"
    : "border-accent/30 bg-bg-secondary";

  return (
    <div
      className={`craft-node absolute rounded border text-xs select-none ${borderCls}`}
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, node);
      }}
    >
      <div className="absolute -top-2.5 -right-1 bg-bg-primary border border-border rounded px-1.5 py-0.5 text-[10px] font-bold text-text-primary z-10">
        ×{node.needed}
      </div>
      <div className="px-2.5 pt-2 pb-2 h-full flex flex-col justify-between overflow-hidden">
        <div
          className="font-semibold text-text-primary leading-tight pr-4 overflow-hidden"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {node.name}
        </div>
        <div className="space-y-0.5 mt-1">
          <div
            className={`text-[10px] font-medium ${isLeaf ? "text-success" : "text-accent"}`}
          >
            {isLeaf ? "Raw Material" : `${formatSkillName(node.skill ?? "")} Lv ${node.levelReq}`}
          </div>
          <div
            className={`text-[10px] ${
              hasAll ? "text-success" : hasSome ? "text-amber-400" : "text-text-muted"
            }`}
          >
            {hasAll
              ? `✓ Have ${node.inInventory}`
              : hasSome
              ? `Have ${node.inInventory} / need ${node.needed}`
              : `Need ${node.needed}`}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function CraftingCalculator() {
  const recipes = useGameDataStore((s) => s.recipes);
  const recipeIndexes = useGameDataStore((s) => s.recipeIndexes);
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const loaded = useGameDataStore((s) => s.loaded);
  const getItemQuantity = useInventoryStore((s) => s.getItemQuantity);

  const pendingCraftName = useNavStore((s) => s.pendingCraftName);
  const clearPendingCraft = useNavStore((s) => s.clearPendingCraft);
  const selectedSkill = useNavStore((s) => s.selectedSkill);
  const navigateToIngredient = useNavStore((s) => s.navigateToIngredient);
  const navigateToRecipeSearch = useNavStore((s) => s.navigateToRecipeSearch);

  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [search, setSearch] = useState("");

  // Sidebar resize
  const [sidebarWidth, setSidebarWidth] = useState(208);
  const resizingRef = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    resizeStartX.current = e.clientX;
    resizeStartW.current = sidebarWidth;

    function onMove(ev: MouseEvent) {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizeStartX.current;
      setSidebarWidth(
        Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, resizeStartW.current + delta))
      );
    }
    function onUp() {
      resizingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);

  // Pan + zoom
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);
  const panningRef = useRef(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  // Use refs so closures in wheel/mouse handlers always see latest values
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".craft-node")) return;
    panningRef.current = true;
    panStart.current = {
      mx: e.clientX,
      my: e.clientY,
      px: panRef.current.x,
      py: panRef.current.y,
    };
    e.preventDefault();

    function onMove(ev: MouseEvent) {
      if (!panningRef.current) return;
      setPan({
        x: panStart.current.px + ev.clientX - panStart.current.mx,
        y: panStart.current.py + ev.clientY - panStart.current.my,
      });
    }
    function onUp() {
      panningRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  // Scroll to zoom — centred on pointer position
  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;

    const prevZoom = zoomRef.current;
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prevZoom * factor));

    // Adjust pan so the point under the cursor stays fixed
    const scale = nextZoom / prevZoom;
    setPan((prev) => ({
      x: pointerX - scale * (pointerX - prev.x),
      y: pointerY - scale * (pointerY - prev.y),
    }));
    setZoom(nextZoom);
  }, []);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);
  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: LayoutNode) => {
      setCtxMenu({ x: e.clientX, y: e.clientY, node });
    },
    []
  );
  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    function close() { setCtxMenu(null); }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [ctxMenu]);

  // Food recipes list
  const foodRecipes = useMemo(
    () =>
      recipes
        .filter((r) => FOOD_SKILLS.has(r.Skill))
        .sort((a, b) => a.Name.localeCompare(b.Name)),
    [recipes]
  );

  const sidebarList = useMemo(() => {
    let list = foodRecipes;
    if (selectedSkill) list = list.filter((r) => r.Skill === selectedSkill);
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (r) =>
        r.Name.toLowerCase().includes(term) ||
        r.Skill.toLowerCase().includes(term)
    );
  }, [foodRecipes, search, selectedSkill]);

  // Auto-select when navigated from context menu elsewhere
  useEffect(() => {
    if (!pendingCraftName || foodRecipes.length === 0) return;
    const match = foodRecipes.find(
      (r) => r.Name.toLowerCase() === pendingCraftName.toLowerCase()
    );
    if (match) {
      setSelectedRecipe(match);
      setQuantity(1);
      setPan({ x: 40, y: 40 });
      setZoom(1);
    }
    clearPendingCraft();
  }, [pendingCraftName, foodRecipes, clearPendingCraft]);

  // Reset view when recipe changes
  useEffect(() => {
    setPan({ x: 40, y: 40 });
    setZoom(1);
  }, [selectedRecipe]);

  // Build layout
  const layout = useMemo(() => {
    if (!selectedRecipe || !recipeIndexes) return null;
    const rootResult = selectedRecipe.ResultItems[0];
    if (!rootResult) return null;

    const rootNode = buildTree(
      rootResult.ItemCode,
      rootResult.StackSize * quantity,
      recipeIndexes,
      getItemByCode,
      getItemQuantity,
      new Set(),
      0,
      { val: 0 }
    );
    return layoutTree(rootNode);
  }, [selectedRecipe, quantity, recipeIndexes, getItemByCode, getItemQuantity]);

  // Attach wheel listener with { passive: false } to allow preventDefault.
  // Must be declared AFTER `layout` so it's in scope for the deps array.
  // layout is in deps so this re-runs once the canvas div renders (canvasRef becomes non-null).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel, layout]);

  // Aggregate raw materials for footer
  const rawMaterials = useMemo(() => {
    if (!layout) return [];
    const map = new Map<number, { name: string; needed: number; have: number }>();
    for (const n of layout.nodes) {
      if (n.recipeId) continue;
      const existing = map.get(n.itemCode);
      if (existing) {
        existing.needed += n.needed;
      } else {
        map.set(n.itemCode, { name: n.name, needed: n.needed, have: n.inInventory });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [layout]);

  if (!loaded) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-text-secondary mb-2">
          Crafting Calculator
        </h2>
        <p className="text-text-muted">
          Load game data in Settings to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* ── Resizable sidebar ── */}
      <aside
        className="flex-shrink-0 flex flex-col border-r border-border bg-bg-secondary overflow-hidden relative"
        style={{ width: sidebarWidth }}
      >
        <div className="p-2 border-b border-border">
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">
            Item to Craft
          </div>
          <input
            type="search"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-bg-primary border border-border rounded px-2 py-1 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {sidebarList.map((r) => {
            const abbrev =
              SKILL_ABBREV[r.Skill] ?? r.Skill.slice(0, 3).toUpperCase();
            return (
              <button
                key={r.id}
                onClick={() => {
                  setSelectedRecipe(r);
                  setQuantity(1);
                }}
                className={`w-full text-left px-2.5 py-2 flex items-center gap-2 hover:bg-bg-primary transition-colors text-xs ${
                  selectedRecipe?.id === r.id
                    ? "bg-accent/10 border-l-2 border-accent"
                    : "border-l-2 border-transparent"
                }`}
              >
                <span className="flex-1 font-medium text-text-primary min-w-0 truncate">
                  {r.Name}
                </span>
                <span className="shrink-0 text-[10px] text-text-muted font-mono">
                  {abbrev} {r.SkillLevelReq}
                </span>
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-border space-y-1.5">
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
            Quantity Required
          </div>
          <input
            type="number"
            min={1}
            max={9999}
            value={quantity}
            onChange={(e) =>
              setQuantity(Math.max(1, parseInt(e.target.value) || 1))
            }
            className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent text-center"
          />
          {!selectedRecipe && (
            <p className="text-[10px] text-text-muted leading-tight">
              Select an item and quantity to see its full material breakdown.
            </p>
          )}
        </div>

        {/* Resize handle — sits on the border-r, pointer captures the drag */}
        <div
          onMouseDown={onResizeStart}
          className="absolute top-0 right-0 w-2 h-full cursor-col-resize z-20 hover:bg-accent/30 transition-colors"
          title="Drag to resize sidebar"
        />
      </aside>

      {/* ── Pannable / zoomable canvas ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {!selectedRecipe ? (
          <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
            ← Select a recipe from the list
          </div>
        ) : !layout ? (
          <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
            No recipe data found
          </div>
        ) : (
          <>
            {/* Canvas */}
            <div
              ref={canvasRef}
              className="flex-1 min-h-0 relative overflow-hidden"
              style={{ cursor: panningRef.current ? "grabbing" : "grab" }}
              onMouseDown={onCanvasMouseDown}
            >
              {/* Zoom / pan hint + controls */}
              <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 pointer-events-none select-none">
                <span className="text-[10px] text-text-muted bg-bg-secondary/80 px-2 py-0.5 rounded">
                  Scroll to zoom · Drag to pan · Right-click for options
                </span>
                <span className="text-[10px] text-text-muted font-mono bg-bg-secondary/80 px-2 py-0.5 rounded">
                  {Math.round(zoom * 100)}%
                </span>
              </div>

              {/* Zoom reset button */}
              {zoom !== 1 && (
                <button
                  className="absolute top-2 left-2 z-10 text-[10px] text-text-muted hover:text-text-primary bg-bg-secondary/90 border border-border rounded px-2 py-0.5 transition-colors"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 40, y: 40 });
                  }}
                >
                  Reset zoom
                </button>
              )}

              {/* Transformed canvas content */}
              <div
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "0 0",
                  position: "absolute",
                  width: layout.totalWidth,
                  height: layout.totalHeight,
                  willChange: "transform",
                }}
              >
                {/* SVG connection lines */}
                <svg
                  className="absolute inset-0 pointer-events-none overflow-visible"
                  width={layout.totalWidth}
                  height={layout.totalHeight}
                >
                  {layout.edges.map(({ childId, parentId }) => {
                    const child = layout.nodes.find((n) => n.nodeId === childId);
                    const parent = layout.nodes.find((n) => n.nodeId === parentId);
                    if (!child || !parent) return null;

                    const x1 = child.x + NODE_W;
                    const y1 = child.y + NODE_H / 2;
                    const x2 = parent.x;
                    const y2 = parent.y + NODE_H / 2;
                    const mx = (x1 + x2) / 2;

                    return (
                      <path
                        key={`${childId}-${parentId}`}
                        d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                        fill="none"
                        stroke="rgba(99,102,241,0.45)"
                        strokeWidth={1.5}
                        strokeDasharray="5 3"
                      />
                    );
                  })}
                </svg>

                {/* Node cards */}
                {layout.nodes.map((node) => (
                  <NodeCard
                    key={node.nodeId}
                    node={node}
                    onContextMenu={handleNodeContextMenu}
                  />
                ))}
              </div>
            </div>

            {/* Raw materials footer */}
            {rawMaterials.length > 0 && (
              <div className="flex-shrink-0 border-t border-border bg-bg-secondary/80 px-4 py-3">
                <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
                  Total Raw Materials Required
                </div>
                <div className="flex flex-wrap gap-2">
                  {rawMaterials.map((m) => {
                    const hasAll = m.have >= m.needed;
                    const hasSome = m.have > 0 && m.have < m.needed;
                    return (
                      <div
                        key={m.name}
                        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border ${
                          hasAll
                            ? "bg-success/10 border-success/40 text-success"
                            : hasSome
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                            : "bg-bg-primary border-border text-text-primary"
                        }`}
                      >
                        <span className="font-medium">{m.name}</span>
                        <span className="font-bold">×{m.needed}</span>
                        {hasSome && (
                          <span className="text-[10px] opacity-75">
                            ({m.have} owned)
                          </span>
                        )}
                        {hasAll && <span className="text-[10px]">✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Node context menu ── */}
      {ctxMenu && (() => {
        const craftingRecipe = ctxMenu.node.recipeId
          ? recipes.find((r) => r.id === ctxMenu.node.recipeId)
          : null;
        return (
          <div
            className="fixed z-50 bg-bg-secondary border border-border rounded shadow-xl py-1 text-sm min-w-48"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Go to Ingredient page */}
            <button
              className="w-full text-left px-4 py-2 hover:bg-bg-primary transition-colors text-text-primary"
              onClick={() => {
                navigateToIngredient(ctxMenu.node.name);
                setCtxMenu(null);
              }}
            >
              View Ingredient
            </button>

            {/* View Recipe — only if this node is craftable */}
            {craftingRecipe && (
              <button
                className="w-full text-left px-4 py-2 hover:bg-bg-primary transition-colors text-text-primary"
                onClick={() => {
                  navigateToRecipeSearch(craftingRecipe.Name);
                  setCtxMenu(null);
                }}
              >
                View Recipe
              </button>
            )}

            <div className="border-t border-border my-1" />

            {/* Wiki link */}
            <button
              className="w-full text-left px-4 py-2 hover:bg-bg-primary transition-colors text-text-muted"
              onClick={() => {
                const url = `https://wiki.projectgorgon.com/wiki/${encodeURIComponent(
                  ctxMenu.node.name.replace(/ /g, "_")
                )}`;
                window.open(url, "_blank");
                setCtxMenu(null);
              }}
            >
              View on Wiki
            </button>
          </div>
        );
      })()}
    </div>
  );
}
