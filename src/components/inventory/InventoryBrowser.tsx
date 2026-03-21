import { useState, useMemo } from "react";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useGameDataStore } from "../../stores/gameDataStore";

export function InventoryBrowser() {
  const aggregated = useInventoryStore((s) => s.aggregated);
  const getVaultNames = useInventoryStore((s) => s.getVaultNames);
  const loaded = useGameDataStore((s) => s.loaded);
  const recipeIndexes = useGameDataStore((s) => s.recipeIndexes);

  const [search, setSearch] = useState("");
  const [vaultFilter, setVaultFilter] = useState("");

  const vaults = useMemo(() => getVaultNames(), [getVaultNames]);

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

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }, [aggregated, search, vaultFilter]);

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
      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary flex-1"
        />
        <select
          value={vaultFilter}
          onChange={(e) => setVaultFilter(e.target.value)}
          className="bg-bg-secondary border border-border rounded px-3 py-2 text-sm text-text-primary"
        >
          <option value="">All vaults</option>
          {vaults.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="text-xs text-text-muted">
        {filtered.length} items
        {search && ` matching "${search}"`}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="py-2 px-3">Item</th>
              <th className="py-2 px-3">Total Qty</th>
              <th className="py-2 px-3">Value</th>
              <th className="py-2 px-3">Locations</th>
              {loaded && <th className="py-2 px-3">Used In</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((item) => {
              const usedInCount = recipeIndexes?.byIngredient.get(item.typeId)?.length ?? 0;
              return (
                <tr
                  key={item.typeId}
                  className="border-b border-border/50 hover:bg-bg-secondary/50"
                >
                  <td className="py-2 px-3 font-medium">{item.name}</td>
                  <td className="py-2 px-3">{item.totalQuantity}</td>
                  <td className="py-2 px-3 text-gold">{item.value}g</td>
                  <td className="py-2 px-3 text-xs text-text-secondary">
                    {item.locations.map((l, i) => (
                      <span key={l.vault}>
                        {i > 0 && ", "}
                        {l.vault} (x{l.quantity})
                      </span>
                    ))}
                  </td>
                  {loaded && (
                    <td className="py-2 px-3 text-text-secondary">
                      {usedInCount > 0 && (
                        <span className="text-accent">{usedInCount} recipes</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > 200 && (
        <p className="text-xs text-text-muted text-center">
          Showing first 200 of {filtered.length} results
        </p>
      )}
    </div>
  );
}
