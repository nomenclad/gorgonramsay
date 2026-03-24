import { useState, useCallback, useEffect } from "react";

/**
 * Persists column widths in localStorage and exposes a drag-to-resize handler.
 *
 * @param key          Unique key per table (e.g. "inventory", "recipes")
 * @param defaults     Initial pixel widths for each column
 */
export function useResizableColumns(key: string, defaults: number[]) {
  const storageKey = `col-widths-${key}`;

  const [widths, setWidths] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (
          Array.isArray(parsed) &&
          parsed.length === defaults.length &&
          parsed.every((v) => typeof v === "number")
        ) {
          return parsed as number[];
        }
      }
    } catch {
      // ignore
    }
    return defaults;
  });

  // Persist whenever widths change
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(widths));
  }, [widths, storageKey]);

  /**
   * Call from a th's resize-handle onMouseDown.
   * colIndex — which column is being dragged
   * startX   — e.clientX at the moment of mousedown
   */
  const startResize = useCallback(
    (colIndex: number, startX: number) => {
      const startWidth = widths[colIndex];

      const onMove = (e: MouseEvent) => {
        const newWidth = Math.max(40, startWidth + e.clientX - startX);
        setWidths((prev) => {
          const next = [...prev];
          next[colIndex] = newWidth;
          return next;
        });
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [widths]
  );

  return { widths, startResize };
}
