/**
 * Dropdown UI for filtering table columns by value. Renders a portal-based
 * checkbox list with search, select-all, and clear-all controls.
 * Used by ResizableTh variants to add per-column value filtering.
 * To add a new filterable column, pass filterOptions/filterSelected/onFilterChange props.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface Props {
  options: string[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  label?: string;
}

export function ColumnFilterDropdown({ options, selected, onChange, label }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const isActive = selected.size > 0 && selected.size < options.length;

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtered = search
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggle = useCallback(
    (val: string) => {
      const next = new Set(selected);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      onChange(next);
    },
    [selected, onChange]
  );

  const selectAll = useCallback(() => onChange(new Set(options)), [options, onChange]);
  const clearAll = useCallback(() => onChange(new Set()), [onChange]);

  // Compute dropdown position from button ref
  const getPos = () => {
    if (!btnRef.current) return { top: 0, left: 0 };
    const rect = btnRef.current.getBoundingClientRect();
    return {
      top: rect.bottom + 4,
      left: Math.max(4, Math.min(rect.left, window.innerWidth - 260)),
    };
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
          setSearch("");
        }}
        className={`ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded text-xs leading-none transition-colors ${
          isActive
            ? "text-accent bg-accent/20"
            : "text-text-muted hover:text-text-primary"
        }`}
        title={`Filter ${label ?? "column"}`}
      >
        ▾
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[100] bg-bg-secondary border border-border rounded-lg shadow-xl text-sm"
            style={{ ...getPos(), width: 250, maxHeight: 360 }}
          >
            {/* Search */}
            <div className="p-2 border-b border-border">
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-bg-primary border border-border rounded px-2 py-1 text-xs text-text-primary"
                autoFocus
              />
            </div>

            {/* Select All / Clear All */}
            <div className="flex gap-2 px-2 py-1.5 border-b border-border text-xs">
              <button
                onClick={selectAll}
                className="text-accent hover:text-accent/80 transition-colors"
              >
                Select All
              </button>
              <button
                onClick={clearAll}
                className="text-accent hover:text-accent/80 transition-colors"
              >
                Clear All
              </button>
              {isActive && (
                <span className="ml-auto text-text-muted">
                  {selected.size}/{options.length}
                </span>
              )}
            </div>

            {/* Options */}
            <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
              {filtered.length === 0 ? (
                <div className="px-2 py-3 text-xs text-text-muted text-center">
                  No matches
                </div>
              ) : (
                filtered.map((opt) => (
                  <label
                    key={opt}
                    className="flex items-center gap-2 px-2 py-1 hover:bg-bg-primary cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(opt)}
                      onChange={() => toggle(opt)}
                      className="rounded border-border accent-accent"
                    />
                    <span className="truncate text-text-primary">{opt}</span>
                  </label>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
