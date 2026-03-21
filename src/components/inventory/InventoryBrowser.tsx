import { useState, useMemo } from "react";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useGameDataStore } from "../../stores/gameDataStore";

type SortKey = "name" | "qty" | "value" | "totalValue" | "recipes";
type SortDir = "asc" | "desc";

export function InventoryBrowser() {
  const aggregated = useInventoryStore((s) => s.aggregated);
  const getVaultNames = useInventoryStore((s) => s.getVaultNames);
  const loaded = useGameDataStore((s) => s.loaded);
  const recipeIndexes = useGameDataStore((s) => s.recipeIndexes);

  const [search, setSearch] = useState("");
  const [vaultFilter, setVaultFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 100;

  const vaults = useMemo(() => getVaultNames(), [getVaultNames]);

  const totalValue = useMemo(
    () => aggregated.reduce((sum, i) => sum + i.value * i.totalQuantity, 0),
    [aggregated]
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
    setPage(0);
  }

  const filtered = useMemo(() => {
    let results = aggregated;

    if (search) {
      const term = search.toLowerCase();
      results = results.filter((item) =>
        item.name.toLowerCase().includes(term)
      );
    }

    if (vaultFilter) {
      results = results.filter((item) =>
        item.locations.some((l) => l.vault === vaultFilter)
      );
    }

    return [...results].sort((a, b) => {
      let diff = 0;
      if (sortKey === "name") diff = a.name.localeCompare(b.name);
      else if (sortKey === "qty") diff = a.totalQuantity - b.totalQuantity;
      else if (sortKey === "value") diff = a.value - b.value;
      else if (sortKey === "totalValue") diff = (a.value * a.totalQuantity) - (b.value * b.totalQuantity);
      else if (sortKey === "recipes") {
        const ar = recipeIndexes?.byIngredient.get(a.typeId)?.length ?? 0;
        const br = recipeIndexes?.byIngredient.get(b.typeId)?.length ?? 0;
        diff = ar - br;
      }
      return sortDir === "asc" ? diff : -diff;
    });
  }, [aggregated, search, vaultFilter, sortKey, sortDir, recipeIndexes]);

  if (aggregated.length === 0) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-text-secondary mb-2">
          Inventory Browser
        </h2>
        <p className="text-text-muted">
          Load inventory data in Settings to browse your items.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-bg-secondary rounded-lg p-3">
          <div className="text-xs text-text-muted mb-1">Total Items</div>
          <div className="font-bold">{aggregated.length.toLocaleString()}</div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-3">
          <div className="text-xs text-text-muted mb-1">Total Value</div>
          <div className="font-bold text-gold">{totalValue.toLocaleString()}g</div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-3">
          <div className="text-xs text-text-muted mb-1">Vaults</div>
          <div className="font-bold">{vaults.length}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary flex-1 min-w-48"
        />
        <select
          value={vaultFilter}
          onChange={(e) => { setVaultFilter(e.target.value); setPage(0); }}
          className="bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary"
        >
          <option value="">All vaults</option>
          {vaults.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      <div className="text-xs text-text-muted">
        {filtered.length.toLocaleString()} items
        {search && ` matching "${search}"`}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary text-xs">
              <SortTh label="Item" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortTh label="Qty" col="qty" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right />
              <SortTh label="Unit Value" col="value" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right />
              <SortTh label="Total Value" col="totalValue" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right />
              <th className="py-2 px-3">Locations</th>
              {loaded && <SortTh label="Recipes" col="recipes" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right />}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((item) => {
              const usedInCount = recipeIndexes?.byIngredient.get(item.typeId)?.length ?? 0;
              return (
                <tr
                  key={item.typeId}
                  className="border-b border-border/50 hover:bg-bg-secondary/50"
                >
                  <td className="py-2 px-3 font-medium">{item.name}</td>
                  <td className="py-2 px-3 text-right">{item.totalQuantity.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-gold">{item.value.toLocaleString()}g</td>
                  <td className="py-2 px-3 text-right text-gold">{(item.value * item.totalQuantity).toLocaleString()}g</td>
                  <td className="py-2 px-3 text-xs text-text-secondary">
                    {item.locations.map((l, i) => (
                      <span key={l.vault}>
                        {i > 0 && <span className="text-border mx-1">·</span>}
                        {l.vault} <span className="text-text-muted">×{l.quantity}</span>
                      </span>
                    ))}
                  </td>
                  {loaded && (
                    <td className="py-2 px-3 text-right">
                      {usedInCount > 0 ? (
                        <span className="text-accent text-xs">{usedInCount}</span>
                      ) : (
                        <span className="text-text-muted text-xs">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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

function SortTh({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  right,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = sortKey === col;
  return (
    <th
      className={`py-2 px-3 cursor-pointer hover:text-text-primary select-none ${right ? "text-right" : ""}`}
      onClick={() => onSort(col)}
    >
      {label} {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );
}
