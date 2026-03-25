/**
 * @module useColumnFilters
 *
 * Generic hook for managing column dropdown filters in data tables.
 * Used by RecipeBrowser, GourmandTracker, and InventoryBrowser to let
 * users filter rows by selecting allowed values for specific columns.
 *
 * An empty Set for a column means "no filter" (show all rows).
 * A non-empty Set means "show only rows whose value is in the Set".
 *
 * **How to add a new filterable column:** At the hook's usage site,
 * call `setFilter(columnKey, selectedValues)` with the new column's key.
 * The hook is column-agnostic — it just stores Sets keyed by string.
 */
import { useState, useCallback } from "react";

/**
 * Manages multi-select column filter state for a table.
 * An empty Set means "no filter" (show all). A non-empty Set means "show only these values".
 */
export function useColumnFilters() {
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});

  const setFilter = useCallback((col: string, selected: Set<string>) => {
    setFilters((prev) => ({ ...prev, [col]: selected }));
  }, []);

  const clearAll = useCallback(() => setFilters({}), []);

  const isFiltered = useCallback(
    (col: string) => {
      const s = filters[col];
      return !!s && s.size > 0;
    },
    [filters]
  );

  /** Check if a value passes the column filter (true if no filter or value is selected) */
  const passesFilter = useCallback(
    (col: string, value: string) => {
      const s = filters[col];
      if (!s || s.size === 0) return true;
      return s.has(value);
    },
    [filters]
  );

  return { filters, setFilter, clearAll, isFiltered, passesFilter };
}
