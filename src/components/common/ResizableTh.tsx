import React from "react";
import { ColumnFilterDropdown } from "./ColumnFilterDropdown";

interface BaseProps {
  width: number;
  onStartResize: (startX: number) => void;
  right?: boolean;
  className?: string;
  children: React.ReactNode;
}

interface FilterProps {
  filterOptions?: string[];
  filterSelected?: Set<string>;
  onFilterChange?: (selected: Set<string>) => void;
}

/**
 * A <th> with a fixed pixel width and a drag handle on its right edge.
 * Use this as a drop-in replacement for plain <th> elements inside tables
 * that use useResizableColumns.
 */
export function ResizableTh({
  width,
  onStartResize,
  right,
  className = "",
  children,
}: BaseProps) {
  return (
    <th
      style={{ width, minWidth: width }}
      className={`relative py-2 px-3 select-none ${right ? "text-right" : "text-left"} ${className}`}
    >
      {children}
      {/* Drag handle — sits on the right border of the cell */}
      <span
        className="absolute -right-1 top-0 bottom-0 w-3 cursor-col-resize hover:bg-accent/40 z-10"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onStartResize(e.clientX);
        }}
      />
    </th>
  );
}

/** Sortable variant — renders sort arrows and calls onSort on click */
export function SortableResizableTh<K extends string>({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  width,
  onStartResize,
  right,
  filterOptions,
  filterSelected,
  onFilterChange,
}: {
  label: string;
  col: K;
  sortKey: K;
  sortDir: "asc" | "desc";
  onSort: (k: K) => void;
  width: number;
  onStartResize: (startX: number) => void;
  right?: boolean;
} & FilterProps) {
  const active = sortKey === col;
  return (
    <ResizableTh width={width} onStartResize={onStartResize} right={right}
      className="cursor-pointer hover:text-text-primary"
    >
      <span className="inline-flex items-center gap-0.5">
        <span onClick={() => onSort(col)}>
          {label} {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
        </span>
        {filterOptions && filterSelected && onFilterChange && (
          <ColumnFilterDropdown
            options={filterOptions}
            selected={filterSelected}
            onChange={onFilterChange}
            label={label}
          />
        )}
      </span>
    </ResizableTh>
  );
}

/** Filterable-only variant (no sorting) */
export function FilterableResizableTh({
  label,
  width,
  onStartResize,
  right,
  filterOptions,
  filterSelected,
  onFilterChange,
}: {
  label: string;
  width: number;
  onStartResize: (startX: number) => void;
  right?: boolean;
} & FilterProps) {
  return (
    <ResizableTh width={width} onStartResize={onStartResize} right={right}>
      <span className="inline-flex items-center gap-0.5">
        {label}
        {filterOptions && filterSelected && onFilterChange && (
          <ColumnFilterDropdown
            options={filterOptions}
            selected={filterSelected}
            onChange={onFilterChange}
            label={label}
          />
        )}
      </span>
    </ResizableTh>
  );
}
