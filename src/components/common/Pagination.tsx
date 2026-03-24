import { useState } from "react";

interface Props {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalItems, pageSize, onPageChange }: Props) {
  const [pageInput, setPageInput] = useState("");
  const totalPages = Math.ceil(totalItems / pageSize);

  const safeTotal = Math.max(1, totalPages);
  const start = totalItems === 0 ? 0 : page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalItems);

  function commitPageInput() {
    const n = parseInt(pageInput, 10);
    if (!isNaN(n) && n >= 1 && n <= safeTotal) onPageChange(n - 1);
    setPageInput("");
  }

  return (
    <div className="flex items-center justify-center gap-3 text-sm flex-wrap">
      <button
        onClick={() => onPageChange(Math.max(0, page - 1))}
        disabled={page === 0}
        className="px-3 py-1 rounded bg-bg-secondary disabled:opacity-40 hover:bg-bg-secondary/80"
      >
        ←
      </button>
      <span className="text-text-muted text-xs">
        {start}–{end} of {totalItems.toLocaleString()}
      </span>
      <button
        onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
        disabled={page >= safeTotal - 1}
        className="px-3 py-1 rounded bg-bg-secondary disabled:opacity-40 hover:bg-bg-secondary/80"
      >
        →
      </button>
      <span className="text-text-muted text-xs">
        Page
        <input
          type="number"
          min={1}
          max={safeTotal}
          value={pageInput !== "" ? pageInput : page + 1}
          onChange={(e) => setPageInput(e.target.value)}
          onBlur={commitPageInput}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="mx-1.5 w-14 bg-bg-secondary border border-border rounded px-1.5 py-0.5 text-text-primary text-center"
        />
        of {safeTotal}
      </span>
    </div>
  );
}
