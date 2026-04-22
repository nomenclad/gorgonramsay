/**
 * Full Inventory tab: shows ALL items across all characters, not limited
 * to food/cooking items. Has two views:
 *
 *   1. **Inventory** — every item the active character owns, with vault
 *      breakdown, value, and alt quantities. Searchable and sortable.
 *
 *   2. **Consolidate** — highlights items that are spread across multiple
 *      characters. Shows exactly which character holds what, so the
 *      player can move duplicates to a single character to save space.
 */
import { useState, useMemo, useCallback } from "react";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useAltStore } from "../../stores/altStore";
import { ContextMenu, wikiUrl, openInBrowser } from "../common/ContextMenu";
import { Pagination } from "../common/Pagination";
import { useResizableColumns } from "../../hooks/useResizableColumns";
import { DEFAULT_PAGE_SIZE } from "../../lib/config";
import { TagEditor } from "../common/TagEditor";
import { TagFilter } from "../common/TagFilter";
import { useTagsStore } from "../../stores/tagsStore";
import type { AggregatedItem } from "../../types";

type SortKey = "name" | "qty" | "value" | "totalValue" | "vaults";
type SortDir = "asc" | "desc";
type ViewMode = "inventory" | "consolidate";

export function FullInventoryPage() {
  const aggregated = useInventoryStore((s) => s.aggregated);
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const fmtVault = useGameDataStore((s) => s.formatVaultName);

  const alts = useAltStore((s) => s.alts);
  const activeCharId = useAltStore((s) => s.activeCharId);

  const itemTagMap = useTagsStore((s) => s.itemTags);

  const [view, setView] = useState<ViewMode>("inventory");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; name: string } | null>(null);
  const handleContextMenu = useCallback((e: React.MouseEvent, name: string) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, name });
  }, []);

  const { widths: colW } = useResizableColumns("full-inv-v2", [200, 70, 90, 90, 90, 220, 160]);

  const altQtyByTypeId = useMemo(() => {
    const map = new Map<number, { total: number; perChar: { name: string; qty: number }[] }>();
    for (const [id, alt] of alts) {
      if (id === activeCharId) continue;
      for (const agg of alt.aggregated) {
        const entry = map.get(agg.typeId) ?? { total: 0, perChar: [] };
        entry.total += agg.totalQuantity;
        entry.perChar.push({ name: alt.name, qty: agg.totalQuantity });
        map.set(agg.typeId, entry);
      }
    }
    return map;
  }, [alts, activeCharId]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
    setPage(0);
  }

  const filtered = useMemo(() => {
    let results = [...aggregated];
    if (search) {
      const term = search.toLowerCase();
      results = results.filter((item) => item.name.toLowerCase().includes(term));
    }
    if (selectedTags.size > 0) {
      results = results.filter((item) => {
        const tags = itemTagMap.get(item.typeId);
        if (!tags) return false;
        for (const t of tags) if (selectedTags.has(t)) return true;
        return false;
      });
    }
    return results.sort((a, b) => {
      let diff = 0;
      if (sortKey === "name") diff = a.name.localeCompare(b.name);
      else if (sortKey === "qty") diff = a.totalQuantity - b.totalQuantity;
      else if (sortKey === "value") diff = a.value - b.value;
      else if (sortKey === "totalValue") diff = (a.value * a.totalQuantity) - (b.value * b.totalQuantity);
      else if (sortKey === "vaults") diff = a.locations.length - b.locations.length;
      return sortDir === "asc" ? diff : -diff;
    });
  }, [aggregated, search, sortKey, sortDir, selectedTags, itemTagMap]);

  if (aggregated.length === 0) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-text-secondary mb-2">Full Inventory</h2>
        <p className="text-text-muted">Load character inventory in Settings to view all items.</p>
      </div>
    );
  }

  const totalValue = aggregated.reduce((s, i) => s + i.value * i.totalQuantity, 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Full Inventory</h2>
        <p className="text-sm text-text-muted mt-1">
          Every item across all storage vaults — not limited to food/cooking items.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Unique Items" value={aggregated.length.toLocaleString()} />
        <StatCard label="Total Stacks" value={aggregated.reduce((s, i) => s + i.totalQuantity, 0).toLocaleString()} />
        <StatCard label="Total Value" value={`${totalValue.toLocaleString()}c`} />
        <StatCard label="Characters" value={alts.size.toLocaleString()} />
      </div>

      {/* View toggle */}
      <div className="flex gap-1 bg-bg-secondary rounded-lg p-1 w-fit">
        {([
          { key: "inventory" as ViewMode, label: "All Items" },
          { key: "consolidate" as ViewMode, label: "Consolidate" },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setView(key); setPage(0); }}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              view === key ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "inventory" ? (
        <InventoryView
          items={filtered}
          search={search}
          setSearch={(v) => { setSearch(v); setPage(0); }}
          sortKey={sortKey}
          sortDir={sortDir}
          toggleSort={toggleSort}
          page={page}
          setPage={setPage}
          colW={colW}
          altQtyByTypeId={altQtyByTypeId}
          getItemByCode={getItemByCode}
          fmtVault={fmtVault}
          handleContextMenu={handleContextMenu}
          selectedTags={selectedTags}
          onToggleTag={(t) => { setSelectedTags((prev) => { const next = new Set(prev); if (next.has(t)) next.delete(t); else next.add(t); return next; }); setPage(0); }}
          onClearTags={() => { setSelectedTags(new Set()); setPage(0); }}
        />
      ) : (
        <ConsolidateView
          alts={alts}
          activeCharId={activeCharId}
          getItemByCode={getItemByCode}
          fmtVault={fmtVault}
          search={search}
          setSearch={(v) => { setSearch(v); setPage(0); }}
          page={page}
          setPage={setPage}
          handleContextMenu={handleContextMenu}
        />
      )}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[{ label: "🔗 View on Wiki", onClick: () => openInBrowser(wikiUrl(ctxMenu.name)) }]}
        />
      )}
    </div>
  );
}

// ─── Inventory View ──────────────────────────────────────────────────────────

interface InventoryViewProps {
  items: AggregatedItem[];
  search: string;
  setSearch: (v: string) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  toggleSort: (key: SortKey) => void;
  page: number;
  setPage: (p: number) => void;
  colW: number[];
  altQtyByTypeId: Map<number, { total: number; perChar: { name: string; qty: number }[] }>;
  getItemByCode: (code: number) => import("../../types/item").Item | undefined;
  fmtVault: (key: string) => string;
  handleContextMenu: (e: React.MouseEvent, name: string) => void;
  selectedTags: Set<string>;
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
}

function InventoryView({
  items, search, setSearch, sortKey, sortDir, toggleSort,
  page, setPage, colW, altQtyByTypeId, fmtVault, handleContextMenu,
  selectedTags, onToggleTag, onClearTags,
}: InventoryViewProps) {
  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <>
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search all items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary flex-1 min-w-48"
        />
        <span className="text-xs text-text-muted">
          {items.length.toLocaleString()} items{search && ` matching "${search}"`}
        </span>
      </div>

      <TagFilter
        selected={selectedTags}
        onToggle={onToggleTag}
        onClear={onClearTags}
        label="Filter by tag"
      />

      <Pagination page={page} totalItems={items.length} pageSize={DEFAULT_PAGE_SIZE} onPageChange={setPage} />

      <div className="overflow-x-auto">
        <table className="text-sm w-full" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="border-b border-border text-left text-text-secondary text-xs">
              <th style={{ width: colW[0] }} className="py-2 px-3 cursor-pointer select-none" onClick={() => toggleSort("name")}>Item{sortArrow("name")}</th>
              <th style={{ width: colW[1] }} className="py-2 px-3 text-right cursor-pointer select-none" onClick={() => toggleSort("qty")}>Qty{sortArrow("qty")}</th>
              <th style={{ width: colW[2] }} className="py-2 px-3 text-right">Alt Qty</th>
              <th style={{ width: colW[3] }} className="py-2 px-3 text-right cursor-pointer select-none" onClick={() => toggleSort("value")}>Unit Value{sortArrow("value")}</th>
              <th style={{ width: colW[4] }} className="py-2 px-3 text-right cursor-pointer select-none" onClick={() => toggleSort("totalValue")}>Total Value{sortArrow("totalValue")}</th>
              <th style={{ width: colW[5] }} className="py-2 px-3 cursor-pointer select-none" onClick={() => toggleSort("vaults")}>Storage{sortArrow("vaults")}</th>
              <th style={{ width: colW[6] }} className="py-2 px-3">Tags</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(page * DEFAULT_PAGE_SIZE, (page + 1) * DEFAULT_PAGE_SIZE).map((item) => {
              const altEntry = altQtyByTypeId.get(item.typeId);
              return (
                <tr
                  key={item.typeId}
                  onContextMenu={(e) => handleContextMenu(e, item.name)}
                  className="border-b border-border/50 hover:bg-bg-secondary/50"
                >
                  <td className="py-2 px-3 font-medium truncate">{item.name}</td>
                  <td className="py-2 px-3 text-right">{item.totalQuantity.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-text-secondary">
                    {altEntry ? (
                      <span title={altEntry.perChar.map((p) => `${p.name}: ${p.qty}`).join("\n")}>
                        {altEntry.total.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right text-gold">{item.value.toLocaleString()}c</td>
                  <td className="py-2 px-3 text-right text-gold">{(item.value * item.totalQuantity).toLocaleString()}c</td>
                  <td className="py-2 px-3 text-xs text-text-secondary truncate">
                    {item.locations.map((l) => `${fmtVault(l.vault)} (×${l.quantity})`).join(", ")}
                  </td>
                  <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                    <TagEditor resource={{ kind: "item", typeId: item.typeId }} emptyLabel="—" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalItems={items.length} pageSize={DEFAULT_PAGE_SIZE} onPageChange={setPage} />
    </>
  );
}

// ─── Consolidate View ────────────────────────────────────────────────────────

interface DuplicateItem {
  typeId: number;
  name: string;
  value: number;
  holders: {
    charName: string;
    charId: string;
    qty: number;
    vaults: string[];
  }[];
  totalAcrossAll: number;
}

interface ConsolidateViewProps {
  alts: Map<string, import("../../stores/altStore").AltCharacter>;
  activeCharId: string | null;
  getItemByCode: (code: number) => import("../../types/item").Item | undefined;
  fmtVault: (key: string) => string;
  search: string;
  setSearch: (v: string) => void;
  page: number;
  setPage: (p: number) => void;
  handleContextMenu: (e: React.MouseEvent, name: string) => void;
}

function ConsolidateView({
  alts, activeCharId, fmtVault, search, setSearch, page, setPage, handleContextMenu,
}: ConsolidateViewProps) {
  const [sortBy, setSortBy] = useState<"name" | "holders" | "totalQty">("holders");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const duplicates = useMemo(() => {
    const itemMap = new Map<number, DuplicateItem>();

    for (const [, alt] of alts) {
      for (const agg of alt.aggregated) {
        // Skip account-shared storage since all characters see those
        const personalLocations = agg.locations.filter(
          (l) => !l.vault.startsWith("*AccountStorage")
        );
        if (personalLocations.length === 0) continue;

        const personalQty = personalLocations.reduce((s, l) => s + l.quantity, 0);
        if (personalQty === 0) continue;

        let entry = itemMap.get(agg.typeId);
        if (!entry) {
          entry = {
            typeId: agg.typeId,
            name: agg.name,
            value: agg.value,
            holders: [],
            totalAcrossAll: 0,
          };
          itemMap.set(agg.typeId, entry);
        }

        entry.holders.push({
          charName: alt.name,
          charId: alt.id,
          qty: personalQty,
          vaults: personalLocations.map((l) => l.vault),
        });
        entry.totalAcrossAll += personalQty;
      }
    }

    // Only keep items held by 2+ characters
    return [...itemMap.values()].filter((d) => d.holders.length >= 2);
  }, [alts]);

  const filtered = useMemo(() => {
    let results = duplicates;
    if (search) {
      const term = search.toLowerCase();
      results = results.filter((d) => d.name.toLowerCase().includes(term));
    }
    return results.sort((a, b) => {
      let diff = 0;
      if (sortBy === "name") diff = a.name.localeCompare(b.name);
      else if (sortBy === "holders") diff = a.holders.length - b.holders.length;
      else if (sortBy === "totalQty") diff = a.totalAcrossAll - b.totalAcrossAll;
      return sortDir === "asc" ? diff : -diff;
    });
  }, [duplicates, search, sortBy, sortDir]);

  function toggleSort(key: typeof sortBy) {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir(key === "name" ? "asc" : "desc"); }
    setPage(0);
  }

  const sortArrow = (key: typeof sortBy) =>
    sortBy === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  if (alts.size < 2) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted text-sm">
          Load at least two characters in Settings to see consolidation opportunities.
        </p>
      </div>
    );
  }

  const totalDuplicateStacks = filtered.reduce((s, d) => {
    return s + d.holders.reduce((acc, h) => acc + h.qty, 0) - Math.max(...d.holders.map((h) => h.qty));
  }, 0);

  return (
    <>
      <div className="bg-accent/10 border border-accent/30 rounded-lg px-4 py-3 text-sm space-y-1">
        <p className="text-text-primary">
          <span className="font-semibold text-accent">{duplicates.length}</span> item{duplicates.length === 1 ? "" : "s"} found
          on multiple characters. Consolidating these could free up roughly{" "}
          <span className="font-semibold text-accent">{totalDuplicateStacks.toLocaleString()}</span> inventory slots.
        </p>
        <p className="text-text-muted text-xs">
          Items in Account Storage are excluded — all characters already share those.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search duplicates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary flex-1 min-w-48"
        />
        <span className="text-xs text-text-muted">
          {filtered.length.toLocaleString()} items{search && ` matching "${search}"`}
        </span>
      </div>

      <Pagination page={page} totalItems={filtered.length} pageSize={DEFAULT_PAGE_SIZE} onPageChange={setPage} />

      <div className="overflow-x-auto">
        <table className="text-sm w-full">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary text-xs">
              <th className="py-2 px-3 cursor-pointer select-none" onClick={() => toggleSort("name")}>
                Item{sortArrow("name")}
              </th>
              <th className="py-2 px-3 text-right cursor-pointer select-none w-28" onClick={() => toggleSort("totalQty")}>
                Total Qty{sortArrow("totalQty")}
              </th>
              <th className="py-2 px-3 text-right cursor-pointer select-none w-24" onClick={() => toggleSort("holders")}>
                Characters{sortArrow("holders")}
              </th>
              <th className="py-2 px-3">Distribution</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(page * DEFAULT_PAGE_SIZE, (page + 1) * DEFAULT_PAGE_SIZE).map((dup) => (
              <tr
                key={dup.typeId}
                onContextMenu={(e) => handleContextMenu(e, dup.name)}
                className="border-b border-border/50 hover:bg-bg-secondary/50 align-top"
              >
                <td className="py-2 px-3 font-medium">{dup.name}</td>
                <td className="py-2 px-3 text-right">{dup.totalAcrossAll.toLocaleString()}</td>
                <td className="py-2 px-3 text-right">
                  <span className="text-accent font-medium">{dup.holders.length}</span>
                </td>
                <td className="py-2 px-3">
                  <div className="space-y-0.5">
                    {dup.holders
                      .sort((a, b) => b.qty - a.qty)
                      .map((h) => {
                        const isActive = h.charId === activeCharId;
                        return (
                          <div key={h.charId} className="flex items-baseline gap-2 text-xs">
                            <span className={`font-medium shrink-0 ${isActive ? "text-accent" : "text-text-primary"}`}>
                              {h.charName}
                              {isActive && <span className="text-text-muted ml-1">(active)</span>}
                            </span>
                            <span className="text-success font-medium">×{h.qty}</span>
                            <span className="text-text-muted truncate">
                              {h.vaults.map((v) => fmtVault(v)).join(", ")}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && duplicates.length === 0 && (
        <div className="text-center py-8 text-text-muted text-sm">
          No duplicate items found across your characters. Inventory is already consolidated!
        </div>
      )}

      {filtered.length === 0 && duplicates.length > 0 && (
        <div className="text-center py-8 text-text-muted text-sm">
          No duplicates match "{search}".
        </div>
      )}

      <Pagination page={page} totalItems={filtered.length} pageSize={DEFAULT_PAGE_SIZE} onPageChange={setPage} />
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-secondary rounded-lg p-3">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
