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
